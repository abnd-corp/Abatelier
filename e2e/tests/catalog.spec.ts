import { apiLogin, createUser, expect, NEW_PASSWORD, test } from './fixtures'

test.describe('Tarifs et catalogue', () => {
  test('la direction ajoute, modifie et désactive une matière, et l’historique des prix est au journal', async ({ adminPage, uid }) => {
    const nom = `Essai ${uid.slice(-6)}`
    await adminPage.goto('/')
    await adminPage.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', { name: 'Tarifs et catalogue' }).click()
    await expect(adminPage.getByRole('heading', { level: 1 })).toHaveText('Tarifs et catalogue')
    // Le catalogue de départ est là
    const matieres = adminPage.getByRole('tabpanel', { name: 'Matières' })
    await expect(matieres.getByRole('row', { name: /Aluminium 1,50 mm/ })).toBeVisible()

    // Ajout, avec des nombres saisis à la française
    await matieres.getByRole('button', { name: 'Ajouter une matière' }).click()
    await matieres.getByLabel('Matière', { exact: true }).fill(nom)
    await matieres.getByLabel('Épaisseur').fill('1,25')
    await matieres.getByLabel('Prix au m² (HT)').fill('55,40')
    await matieres.getByRole('button', { name: 'Enregistrer' }).click()
    const row = matieres.getByRole('row', { name: new RegExp(nom) })
    await expect(row).toContainText('1,25 mm')
    await expect(row).toContainText(/55,40\s€/)

    // Une erreur s'affiche sous le bon champ
    await row.getByRole('button', { name: `Modifier ${nom} 1,25 mm` }).click()
    await matieres.getByLabel('Prix au m² (HT)').fill('-1')
    await matieres.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(matieres.getByLabel('Prix au m² (HT)')).toHaveAttribute('aria-invalid', 'true')
    await matieres.getByLabel('Prix au m² (HT)').fill('58')
    await matieres.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(row).toContainText(/58,00\s€/)

    // Désactivée : elle disparaît de la liste, mais reste consultable
    await row.getByRole('button', { name: 'Désactiver' }).click()
    await expect(row).toHaveCount(0)
    await matieres.getByLabel(/Afficher les désactivées/).check()
    await expect(row).toContainText('Désactivée')

    // L'historique des prix est dans le journal
    await adminPage.goto('/journal')
    await adminPage.getByRole('button', { name: 'Catalogue et prix' }).click()
    await expect(adminPage.getByRole('cell', { name: new RegExp(`A modifié la matière ${nom} 1,25 mm : prix au m² 55,40\\s€ → 58,00\\s€`) })).toBeVisible()
  })

  test('la direction ajoute un coloris ; une référence en double est refusée', async ({ adminPage, uid }) => {
    await adminPage.goto('/catalogue')
    await adminPage.getByRole('tab', { name: /Coloris/ }).click()
    await expect(adminPage).toHaveURL(/onglet=coloris/)
    const coloris = adminPage.getByRole('tabpanel', { name: 'Coloris' })
    await expect(coloris.getByRole('row', { name: /RAL 7016/ })).toBeVisible()

    const ref = `RAL ${uid.slice(-6)}`
    await coloris.getByRole('button', { name: 'Ajouter un coloris' }).click()
    await coloris.getByLabel('Référence').fill(ref)
    await coloris.getByLabel('Nom', { exact: true }).fill('Rouge essai')
    await coloris.getByLabel('Teinte', { exact: true }).fill('#6d1a2a')
    await coloris.getByLabel('Majoration').fill('8')
    await coloris.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(coloris.getByRole('row', { name: new RegExp(ref) })).toContainText('+8 %')

    await coloris.getByRole('button', { name: 'Ajouter un coloris' }).click()
    await coloris.getByLabel('Référence').fill(ref)
    await coloris.getByLabel('Nom', { exact: true }).fill('Doublon')
    await coloris.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(coloris.getByText('Cette référence de coloris existe déjà.')).toBeVisible()
  })

  test('la RH et l’atelier n’ont pas accès au catalogue', async ({ adminPage, browser, baseURL, uid }) => {
    for (const role of ['rh', 'atelier'] as const) {
      const id = `${uid}-${role}`
      const temp = await createUser(adminPage.request, baseURL!, { identifiant: id, nom: `Test ${role}`, role })
      const page = await (await browser.newContext()).newPage()
      await apiLogin(page.request, baseURL!, id, temp)
      await page.request.post('/api/auth/password', { data: { current: temp, next: NEW_PASSWORD }, headers: { Origin: baseURL! } })
      await page.goto('/catalogue')
      await expect(page).toHaveURL('/')
      await expect(page.getByRole('link', { name: 'Tarifs et catalogue' })).toHaveCount(0)
      expect((await page.request.get('/api/catalog/materials')).status()).toBe(403)
      await page.context().close()
    }
  })
})
