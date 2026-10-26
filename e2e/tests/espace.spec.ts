import { expect, test } from './fixtures'

const PASSWORD = 'Plieuse-numerique-2026'

// Espace client : inscription, déconnexion, connexion (la suite du parcours est dans site.spec.ts)
test.describe('Espace client : inscription et connexion', () => {
  test('le visiteur est guidé en cas d’erreur, crée son espace, se déconnecte puis se reconnecte', async ({ page, baseURL, uid }) => {
    const email = `${uid}@exemple.fr`
    await page.goto('/espace/inscription')

    // Formulaire vide : les champs obligatoires sont signalés, rien n'est créé
    await page.getByRole('button', { name: 'Créer mon espace' }).click()
    await expect(page.locator('.field-error').first()).toBeVisible()
    await expect(page).toHaveURL(/\/espace\/inscription/)

    // Mot de passe trop court et consentement oublié
    await page.getByLabel('Nom *').fill(`Client ${uid.slice(-6)}`)
    await page.getByLabel('Adresse e-mail *').fill(email)
    await page.getByLabel('Mot de passe *').fill('court')
    await page.getByRole('button', { name: 'Créer mon espace' }).click()
    await expect(page.locator('.field-error').first()).toBeVisible()
    await expect(page).toHaveURL(/\/espace\/inscription/)

    // Le consentement est obligatoire
    await page.getByLabel('Mot de passe *').fill(PASSWORD)
    await page.getByRole('button', { name: 'Créer mon espace' }).click()
    await expect(page.getByText('Cochez la case')).toBeVisible()

    // Un professionnel doit donner sa raison sociale
    await page.getByLabel(/utilisation de vos données|J’accepte|consent/i).check()
    await page.getByLabel('Un professionnel').check()
    await page.getByRole('button', { name: 'Créer mon espace' }).click()
    await expect(page.getByText('Indiquez la raison sociale')).toBeVisible()
    await page.getByLabel('Un particulier').check()

    // Inscription réussie : le client arrive dans son espace, connecté
    await page.getByRole('button', { name: 'Créer mon espace' }).click()
    await expect(page.getByRole('heading', { level: 1, name: /^Bonjour/ })).toBeVisible()
    expect((await page.request.get('/api/espace/commandes')).status()).toBe(200)

    // Déconnexion : l'espace est de nouveau protégé
    await page.getByRole('button', { name: 'Me déconnecter' }).click()
    expect((await page.request.get('/api/espace/commandes')).status()).toBe(401)
    await page.goto('/espace')
    await expect(page).toHaveURL(/\/espace\/(connexion|inscription)/)

    // Connexion : mauvais mot de passe refusé, puis bon mot de passe accepté
    await page.goto('/espace/connexion')
    await page.getByLabel('Adresse e-mail *').fill(email)
    await page.getByLabel('Mot de passe *').fill('Mauvais-mot-de-passe-1')
    await page.getByRole('button', { name: 'Me connecter' }).click()
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page).toHaveURL(/\/espace\/connexion/)
    await page.getByLabel('Mot de passe *').fill(PASSWORD)
    await page.getByRole('button', { name: 'Me connecter' }).click()
    await expect(page.getByRole('heading', { level: 1, name: /^Bonjour/ })).toBeVisible()

    // Une adresse déjà utilisée ne crée pas de second espace
    const doublon = await page.request.post('/api/espace/inscription', { data: { nom: 'Doublon', email, password: PASSWORD, consentement: true }, headers: { Origin: baseURL! } })
    expect(doublon.status()).toBe(409)
  })
})
