import { ADMIN, apiLogin, createUser, expect, NEW_PASSWORD, test } from './fixtures'

// Du paiement en boutique à la livraison : l'atelier fait avancer l'étape, le client la voit changer dans son espace.
const PASSWORD = 'Plieuse-numerique-2026'

test.describe('Suivi de fabrication', () => {
  test('l’atelier fait avancer la commande payée, le client voit chaque étape dans son espace', async ({ browser, baseURL, uid }) => {
    const h = { Origin: baseURL! }
    const admin = await (await browser.newContext()).newPage()
    await apiLogin(admin.request, baseURL!, ADMIN.identifiant, ADMIN.password)
    const nom = `Suivi e2e ${uid.slice(-8)}`
    const { id } = await (await admin.request.post('/api/boutique/produits', { data: { nom }, headers: h })).json()
    const v = await (await admin.request.post(`/api/boutique/produits/${id}/variantes`, { data: { libelle: '200 mm · 2 m', prixTtc: 40 }, headers: h })).json()
    expect((await admin.request.patch(`/api/boutique/produits/${id}`, { data: { actif: true }, headers: h })).status()).toBe(200)

    // Le client crée son espace, paie (faux prestataire) : la commande naît déjà validée
    const client = await (await browser.newContext()).newPage()
    const signup = await client.request.post('/api/espace/inscription', { data: { nom: `Suivi ${uid.slice(-6)}`, email: `${uid}@exemple.fr`, password: PASSWORD, consentement: true }, headers: h })
    expect(signup.status(), await signup.text()).toBe(201)
    const checkout = await client.request.post('/api/espace/boutique/paiement', { data: { lignes: [{ variantId: v.variante.id, quantite: 1 }], livraison: { mode: 'retrait' } }, headers: h })
    expect(checkout.status(), await checkout.text()).toBe(201)
    const paiementId = (await checkout.json()).id
    expect((await client.request.post(`/api/espace/boutique/paiements/${paiementId}/simulation`, { data: { issue: 'paye' }, headers: h })).status()).toBe(200)
    const numero = (await (await client.request.get(`/api/espace/boutique/paiements/${paiementId}`)).json()).commande.numero as string
    const commandeId = (await (await client.request.get('/api/espace/commandes')).json()).commandes[0].id as string

    // Le client voit « Commande validée »
    await client.goto(`/espace/commandes/${commandeId}`)
    const suivi = client.getByRole('region', { name: 'Suivi de la commande' })
    await expect(suivi.locator('li[aria-current="step"]')).toContainText('Commande validée')

    // L'atelier la voit dans Fabrication, sans le client, et la fait avancer étape par étape
    const identifiant = `${uid}-at`
    const temp = await createUser(admin.request, baseURL!, { identifiant, nom: 'Plieur Suivi', role: 'atelier' })
    const atelier = await (await browser.newContext()).newPage()
    await apiLogin(atelier.request, baseURL!, identifiant, temp)
    await atelier.request.post('/api/auth/password', { data: { current: temp, next: NEW_PASSWORD }, headers: h })
    await atelier.goto('/fabrication')
    const ligne = atelier.getByRole('article').filter({ hasText: numero })
    await expect(ligne).toBeVisible()
    await expect(atelier.getByText(`Suivi ${uid.slice(-6)}`)).toHaveCount(0)

    await ligne.getByRole('button', { name: 'Lancer la fabrication' }).click()
    await expect(ligne).toContainText('En fabrication')
    await client.reload()
    await expect(suivi.locator('li[aria-current="step"]')).toContainText('En fabrication')
    await expect(suivi.locator('li[aria-current="step"]')).toContainText('Vos pièces sont en cours de pliage')

    await ligne.getByRole('button', { name: 'Marquer prête' }).click()
    await expect(ligne).toContainText('Prête')
    await client.reload()
    await expect(suivi.locator('li[aria-current="step"]')).toContainText('Prête')

    await ligne.getByRole('button', { name: 'Marquer livrée / retirée' }).click()
    // Une commande livrée quitte la liste de fabrication
    await expect(atelier.getByRole('article').filter({ hasText: numero })).toHaveCount(0)
    await client.reload()
    await expect(suivi.locator('li.done')).toHaveCount(5)

    // Les étapes sont au journal, sous le nom du salarié
    await admin.goto('/journal')
    await admin.getByRole('button', { name: 'Commandes', exact: true }).click()
    await expect(admin.getByRole('cell', { name: `A passé la commande ${numero} à « Livrée / retirée »` })).toBeVisible()

    await admin.request.delete(`/api/boutique/produits/${id}`, { headers: h })
  })

  test('le client passe sa commande depuis le configurateur : paiement, atelier prévenu, suivi', async ({ browser, baseURL, uid }) => {
    const h = { Origin: baseURL! }
    const email = `${uid}@exemple.fr`
    const client = await (await browser.newContext()).newPage()
    const signup = await client.request.post('/api/espace/inscription', { data: { nom: `Cmd ${uid.slice(-6)}`, email, password: PASSWORD, consentement: true }, headers: h })
    expect(signup.status(), await signup.text()).toBe(201)

    await client.goto('/configurateur')
    const piece = client.getByRole('region', { name: 'Pièce 1' })
    await piece.getByLabel('Repère').fill(`Commande ${uid.slice(-4)}`)
    await expect(client.getByRole('complementary', { name: 'Montant de la commande' }).locator('dd.big')).toBeVisible()
    await expect(client.getByRole('button', { name: 'Passer la commande' })).toBeEnabled()
    await client.getByRole('button', { name: 'Passer la commande' }).click()

    // Paiement (faux prestataire) : la commande n'existe qu'après
    await expect(client).toHaveURL(/\/paiement-simulation\/[0-9a-f-]{36}$/)
    await client.getByRole('button', { name: 'Simuler un paiement réussi' }).click()
    await expect(client.getByRole('heading', { name: 'Merci, votre commande est confirmée' })).toBeVisible()
    const numero = (
      await client
        .getByText(/C-\d{4}-\d{4}/)
        .first()
        .innerText()
    ).match(/C-\d{4}-\d{4}/)![0]
    await client.getByRole('link', { name: 'Suivre ma commande' }).click()
    await expect(client.getByRole('region', { name: 'Suivi de la commande' }).locator('li[aria-current="step"]')).toContainText('Commande validée')
    await expect(client.getByText(`Commande ${uid.slice(-4)}`).first()).toBeVisible()
    await expect(client.getByRole('region', { name: 'Paiement' })).toContainText('Payé')

    // L'atelier la voit tout de suite dans Fabrication et la lance
    const admin = await (await browser.newContext()).newPage()
    await apiLogin(admin.request, baseURL!, ADMIN.identifiant, ADMIN.password)
    const identifiant = `${uid}-at`
    const temp = await createUser(admin.request, baseURL!, { identifiant, nom: 'Plieur Cmd', role: 'atelier' })
    const atelier = await (await browser.newContext()).newPage()
    await apiLogin(atelier.request, baseURL!, identifiant, temp)
    await atelier.request.post('/api/auth/password', { data: { current: temp, next: NEW_PASSWORD }, headers: h })
    await atelier.goto('/fabrication')
    const carte = atelier.getByRole('article').filter({ hasText: numero })
    await expect(carte).toBeVisible()
    await carte.getByRole('button', { name: 'Lancer la fabrication' }).click()
    await client.reload()
    await expect(client.getByRole('region', { name: 'Suivi de la commande' }).locator('li[aria-current="step"]')).toContainText('En fabrication')
  })
})
