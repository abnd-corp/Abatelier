import { apiLogin, createUser, expect, NEW_PASSWORD, test, uiLogin } from './fixtures'

test.describe('Arrivée et départ d’un employé', () => {
  test('l’admin crée un compte, l’employé choisit son mot de passe, l’admin le désactive', async ({ adminPage, browser, baseURL, uid }) => {
    const nom = `Employé ${uid.slice(-6)}`

    // 1. L'admin crée le compte depuis l'interface
    await adminPage.goto('/utilisateurs')
    await adminPage.getByRole('button', { name: 'Ajouter un compte' }).click()
    // Le rôle RH n'est plus proposé (gardé dans le code pour une V2)
    await expect(adminPage.locator('#new-role option')).toHaveText([/^Atelier/, /^Direction/])
    await adminPage.getByLabel('Nom affiché').fill(nom)
    await adminPage.getByLabel('Identifiant de connexion').fill(uid)
    await adminPage.getByRole('button', { name: 'Créer le compte' }).click()
    const temp = await adminPage.locator('.temp-pw code').innerText()
    expect(temp).toMatch(/^[A-Za-z0-9]{4}(-[A-Za-z0-9]{4}){3}$/)
    await expect(adminPage.getByRole('row', { name: new RegExp(nom) })).toContainText('Mot de passe à changer')

    // 2. L'employé se connecte avec le mot de passe temporaire, sur son propre navigateur
    const employee = await (await browser.newContext()).newPage()
    await uiLogin(employee, uid, temp)
    await expect(employee).toHaveURL('/mon-compte')
    await expect(employee.getByText('Votre mot de passe est temporaire')).toBeVisible()
    await expect(employee.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link')).toHaveCount(0)

    // Il ne peut aller nulle part ailleurs tant qu'il n'a pas changé son mot de passe
    await employee.goto('/journal')
    await expect(employee).toHaveURL('/mon-compte')

    // 3. Il choisit son mot de passe, l'indicateur le guide
    await employee.locator('#pw-current').fill(temp)
    await employee.locator('#pw-next').fill('azerty')
    await expect(employee.getByText('Robustesse : Trop faible')).toBeVisible()
    await expect(employee.getByRole('button', { name: 'Changer le mot de passe' })).toBeDisabled()
    await employee.locator('#pw-next').fill(NEW_PASSWORD)
    await employee.locator('#pw-confirm').fill(NEW_PASSWORD)
    await employee.getByRole('button', { name: 'Changer le mot de passe' }).click()
    await expect(employee).toHaveURL('/tableau-de-bord')

    // 4. Rôle atelier : pas d'accès à la gestion des comptes ni au journal
    const nav = employee.getByRole('navigation', { name: 'Navigation principale' })
    await expect(nav.getByRole('link')).toHaveText(['Tableau de bord', 'Fabrication', 'Stock de feuilles'])
    await employee.goto('/utilisateurs')
    await expect(employee).toHaveURL('/tableau-de-bord')

    // 5. Départ : l'admin désactive le compte
    await adminPage.reload()
    const row = adminPage.getByRole('row', { name: new RegExp(nom) })
    await row.getByRole('button', { name: 'Désactiver' }).click()
    await row.getByRole('button', { name: 'Confirmer' }).click()
    await expect(row).toContainText('Désactivé')

    // L'employé est déconnecté dès sa prochaine action, et ne peut plus revenir
    await employee.getByRole('link', { name: /^Mon compte/ }).click()
    await expect(employee).toHaveURL(/\/connexion\?.*expire=1/)
    await expect(employee.getByText('Votre session a expiré')).toBeVisible()
    await employee.getByLabel('Identifiant').fill(uid)
    await employee.getByLabel('Mot de passe', { exact: true }).fill(NEW_PASSWORD)
    await employee.getByRole('button', { name: 'Se connecter' }).click()
    await expect(employee.getByRole('alert')).toHaveText('Ce compte est désactivé. Contactez la direction.')
    await employee.context().close()
  })

  test('nouveau mot de passe temporaire : l’ancien ne marche plus', async ({ adminPage, browser, baseURL, uid }) => {
    const temp = await createUser(adminPage.request, baseURL!, { identifiant: uid, nom: `Réinit ${uid.slice(-4)}` })
    const employee = await (await browser.newContext()).newPage()
    await apiLogin(employee.request, baseURL!, uid, temp)

    await adminPage.goto('/utilisateurs')
    const row = adminPage.getByRole('row', { name: new RegExp(uid) })
    await row.getByRole('button', { name: 'Nouveau mot de passe' }).click()
    await row.getByRole('button', { name: 'Confirmer' }).click()
    const fresh = await adminPage.locator('.temp-pw code').innerText()
    expect(fresh).not.toBe(temp)

    await uiLogin(employee, uid, temp)
    await expect(employee.getByRole('alert')).toHaveText('Identifiant ou mot de passe incorrect.')
    await uiLogin(employee, uid, fresh)
    await expect(employee).toHaveURL('/mon-compte')
    await employee.context().close()
  })
})
