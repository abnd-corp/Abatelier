import { expect, test, waitForMail } from './fixtures'

// Mot de passe oublié et activation d'un espace sur une fiche créée par l'atelier : des liens à usage unique reçus par e-mail
const ANCIEN = 'Plieuse-numerique-2026'
const NOUVEAU = 'Cintreuse-hydraulique-2027'

test.describe('Espace client : liens reçus par e-mail', () => {
  test('un client qui a oublié son mot de passe en choisit un nouveau avec le lien reçu, qui ne sert qu’une fois', async ({ browser, baseURL, uid }) => {
    const email = `${uid}-oubli@exemple.fr`
    const ouverture = await (await browser.newContext()).newPage()
    const signup = await ouverture.request.post('/api/espace/inscription', { data: { nom: `Oubli ${uid.slice(-6)}`, email, password: ANCIEN, consentement: true }, headers: { Origin: baseURL! } })
    expect(signup.status(), await signup.text()).toBe(201)
    // Le message de bienvenue arrive à la création de l'espace
    const bienvenue = await waitForMail(ouverture.request, 'Bienvenue', email)
    expect(bienvenue.HTML).toContain('Accéder à mon espace client')

    // Sur la page de connexion : « Mot de passe oublié ? »
    const client = await (await browser.newContext()).newPage()
    await client.goto('/espace/connexion')
    await client.getByRole('link', { name: 'Mot de passe oublié ?' }).click()
    await expect(client.getByRole('heading', { level: 1, name: 'Mot de passe oublié ?' })).toBeVisible()
    await client.getByLabel('Adresse e-mail').fill(email)
    await client.getByRole('button', { name: 'Recevoir le lien' }).click()
    await expect(client.getByRole('status')).toContainText('Si cette adresse correspond à un espace client ou à une fiche, un message vient de vous être envoyé')

    // Le lien arrive par e-mail
    const mail = await waitForMail(client.request, 'Réinitialisation de votre mot de passe', email)
    expect(mail.HTML).toContain('Choisir un nouveau mot de passe')
    expect(mail.HTML).toContain('Pour votre sécurité.')
    const lien = mail.Text.match(/https?:\/\/\S+nouveau-mot-de-passe\?jeton=[A-Za-z0-9_-]+/)![0]
    await client.goto(lien)
    await expect(client.getByRole('heading', { level: 1, name: 'Choisissez un nouveau mot de passe' })).toBeVisible()
    await client.locator('#mdp-password').fill('court')
    await client.getByRole('button', { name: 'Enregistrer le mot de passe' }).click()
    await expect(client.getByRole('alert')).toBeVisible()
    await client.locator('#mdp-password').fill(NOUVEAU)
    await client.getByRole('button', { name: 'Enregistrer le mot de passe' }).click()
    await expect(client.getByRole('heading', { level: 1, name: 'Mot de passe modifié' })).toBeVisible()
    // Le client est prévenu par un message de sécurité
    const alerte = await waitForMail(client.request, 'Votre mot de passe a été modifié', email)
    expect(alerte.HTML).toContain('Ce n’était pas moi')

    // Le lien ne sert qu'une fois
    await client.goto(lien)
    await expect(client.getByRole('heading', { level: 1, name: 'Ce lien n’est plus valable' })).toBeVisible()

    // L'ancien mot de passe est refusé, le nouveau accepté
    await client.goto('/espace/connexion')
    await client.locator('#auth-email').fill(email)
    await client.locator('#auth-password').fill(ANCIEN)
    await client.getByRole('button', { name: 'Me connecter' }).click()
    await expect(client.getByRole('alert')).toContainText('incorrect')
    await client.locator('#auth-password').fill(NOUVEAU)
    await client.getByRole('button', { name: 'Me connecter' }).click()
    await expect(client).toHaveURL(/\/espace$/)
  })

  test('un client dont l’atelier a créé la fiche active son espace avec le lien reçu à son adresse', async ({ adminPage, browser, baseURL, uid }) => {
    const email = `${uid}-fiche@exemple.fr`
    const nom = `Fiche${uid.slice(-6)}`
    const fiche = await adminPage.request.post('/api/clients', { data: { type: 'particulier', prenom: 'Marie', nom, email }, headers: { Origin: baseURL! } })
    expect(fiche.status(), await fiche.text()).toBe(201)

    // Il tente de créer un espace avec cette adresse : refus clair, et un lien d'activation part à l'adresse de la fiche
    const client = await (await browser.newContext()).newPage()
    await client.goto('/espace/inscription')
    await client.locator('#auth-nom').fill('Quelqu’un')
    await client.locator('#auth-email').fill(email)
    await client.locator('#auth-password').fill(NOUVEAU)
    await client.locator('#auth-consentement').check()
    await client.getByRole('button', { name: 'Créer mon espace' }).click()
    await expect(client.getByText('Cette adresse e-mail est déjà connue')).toBeVisible()

    const mail = await waitForMail(client.request, 'Activez votre espace client', email)
    expect(mail.HTML).toContain('Choisir mon mot de passe')
    const lien = mail.Text.match(/https?:\/\/\S+nouveau-mot-de-passe\?jeton=[A-Za-z0-9_-]+/)![0]
    await client.goto(lien)
    await expect(client.getByRole('heading', { level: 1, name: 'Activez votre espace client' })).toBeVisible()
    await client.locator('#mdp-password').fill(NOUVEAU)
    await client.getByRole('button', { name: 'Activer mon espace' }).click()
    // Il est connecté, dans l'espace de SA fiche (celle créée par l'atelier), pas dans un nouvel espace vide
    await expect(client).toHaveURL(/\/espace$/)
    await expect(client.getByText(nom).first()).toBeVisible()
    await waitForMail(client.request, 'Bienvenue', email)

    // Le lien ne sert qu'une fois
    await client.goto(lien)
    await expect(client.getByRole('heading', { level: 1, name: 'Ce lien n’est plus valable' })).toBeVisible()

    // L'atelier voit la même fiche, sans doublon
    const clients = await (await adminPage.request.get(`/api/clients?q=${encodeURIComponent(nom)}`)).json()
    expect(clients.clients.filter((c: { email: string }) => c.email === email)).toHaveLength(1)
  })
})

// Sur téléphone, tablette et ordinateur : titre visible, rien ne déborde sur le côté
test.describe('Pages de mot de passe @responsive', () => {
  for (const [path, titre] of [
    ['/espace/mot-de-passe-oublie', 'Mot de passe oublié ?'],
    ['/espace/nouveau-mot-de-passe?jeton=lien-qui-n-existe-pas-du-tout', 'Ce lien n’est plus valable'],
  ] as const) {
    test(`${path.split('?')[0]} tient dans l’écran`, async ({ page }) => {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1, name: titre })).toBeInViewport()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
    })
  }
})
