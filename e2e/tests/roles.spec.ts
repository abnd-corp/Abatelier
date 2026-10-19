import { apiLogin, createUser, expect, NEW_PASSWORD, test } from './fixtures'

test.describe('Rôles', () => {
  test('la RH gère les salariés, consulte les clients et lit le journal, sans toucher aux comptes', async ({ adminPage, browser, baseURL, uid }) => {
    // La direction crée un compte RH ; la personne choisit son mot de passe
    const temp = await createUser(adminPage.request, baseURL!, { identifiant: uid, nom: `Claire ${uid.slice(-4)}`, role: 'rh' })
    const rh = await (await browser.newContext()).newPage()
    await apiLogin(rh.request, baseURL!, uid, temp)
    const change = await rh.request.post('/api/auth/password', { data: { current: temp, next: NEW_PASSWORD }, headers: { Origin: baseURL! } })
    expect(change.status()).toBe(200)

    await rh.goto('/')
    const nav = rh.getByRole('navigation', { name: 'Navigation principale' })
    await expect(nav.getByRole('link')).toHaveText(['Tableau de bord', 'Clients', 'Salariés', 'Journal d’activité'])

    // Pas d'accès aux comptes, même en tapant l'adresse
    await rh.goto('/utilisateurs')
    await expect(rh).toHaveURL('/')

    // Ajout d'un salarié : la partie « compte de connexion » n'apparaît pas
    await rh.goto('/salaries/nouveau')
    await expect(rh.getByText('Compte de connexion', { exact: true })).toHaveCount(0)
    await rh.getByRole('textbox', { name: 'Prénom', exact: true }).fill('Nina')
    await rh.getByRole('textbox', { name: 'Nom', exact: true }).fill(`Rh${uid.slice(-5)}`)
    await rh.getByRole('button', { name: 'Enregistrer le salarié' }).click()
    await expect(rh.getByRole('heading', { level: 1 })).toHaveText(`Nina Rh${uid.slice(-5)}`)
    await expect(rh.getByText('Seule la direction peut lui créer un compte')).toBeVisible()

    // Le journal est consultable
    await nav.getByRole('link', { name: 'Journal d’activité' }).click()
    await expect(rh.getByRole('cell', { name: new RegExp(`A ajouté Nina Rh${uid.slice(-5)}`) })).toBeVisible()
    await rh.context().close()
  })
})
