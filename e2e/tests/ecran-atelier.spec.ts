import { ADMIN, apiLogin, createUser, expect, NEW_PASSWORD, test } from './fixtures'

// L'écran de l'atelier est une page à part, ouverte à tout compte connecté : les commandes en cours en grand, sans client ni prix.
const PASSWORD = 'Plieuse-numerique-2026'

test.describe('Écran de l’atelier @responsive', () => {
  test('une commande payée y apparaît pour tous les comptes, sans le client ; le lien est sous « Voir le site »', async ({ browser, baseURL, uid, page }) => {
    const h = { Origin: baseURL! }
    const admin = await (await browser.newContext()).newPage()
    await apiLogin(admin.request, baseURL!, ADMIN.identifiant, ADMIN.password)
    const nom = `Ecran ${uid.slice(-8)}`
    const { id } = await (await admin.request.post('/api/boutique/produits', { data: { nom }, headers: h })).json()
    const v = await (await admin.request.post(`/api/boutique/produits/${id}/variantes`, { data: { libelle: '200 mm · 2 m', prixTtc: 40 }, headers: h })).json()
    expect((await admin.request.patch(`/api/boutique/produits/${id}`, { data: { actif: true }, headers: h })).status()).toBe(200)
    const client = await (await browser.newContext()).newPage()
    expect(
      (await client.request.post('/api/espace/inscription', { data: { nom: `Ecran ${uid.slice(-6)}`, email: `${uid}@exemple.fr`, password: PASSWORD, consentement: true }, headers: h })).status(),
    ).toBe(201)
    const checkout = await client.request.post('/api/espace/boutique/paiement', { data: { lignes: [{ variantId: v.variante.id, quantite: 1 }], livraison: { mode: 'retrait' } }, headers: h })
    const paiementId = (await checkout.json()).id
    expect((await client.request.post(`/api/espace/boutique/paiements/${paiementId}/simulation`, { data: { issue: 'paye' }, headers: h })).status()).toBe(200)
    const numero = (await (await client.request.get(`/api/espace/boutique/paiements/${paiementId}`)).json()).commande.numero as string

    // Un compte sans aucune section (RH) peut l'ouvrir : l'écran n'est pas réservé à l'atelier
    const identifiant = `${uid}-rh`
    const temp = await createUser(admin.request, baseURL!, { identifiant, nom: 'Compte RH', role: 'rh' })
    await apiLogin(page.request, baseURL!, identifiant, temp)
    await page.request.post('/api/auth/password', { data: { current: temp, next: NEW_PASSWORD }, headers: h })

    // Le lien est dans le bas du menu, sous « Voir le site », et s'ouvre dans un nouvel onglet
    await page.goto('/tableau-de-bord')
    if (await page.getByRole('button', { name: 'Ouvrir le menu' }).isVisible()) await page.getByRole('button', { name: 'Ouvrir le menu' }).click()
    const lien = page.getByRole('link', { name: 'Écran de l’atelier' })
    await expect(lien).toHaveAttribute('target', '_blank')
    const ordre = await page.locator('.item').allInnerTexts()
    expect(ordre.findIndex((t) => t.includes('Voir le site'))).toBeLessThan(ordre.findIndex((t) => t.includes('Écran de l’atelier')))
    // Pas de plan graphique pour ce compte
    await expect(page.getByRole('link', { name: 'Plan graphique' })).toHaveCount(0)

    await page.goto('/ecran-atelier')
    await expect(page.getByRole('heading', { level: 1, name: 'Atelier' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toHaveCount(0)
    const aLancer = page.locator('[data-colonne="validee"]')
    await expect(aLancer).toContainText(numero)
    // Ni le nom du client, ni son adresse, ni un prix
    await expect(page.getByText(`Ecran ${uid.slice(-6)}`)).toHaveCount(0)
    await expect(page.getByText(`${uid}@exemple.fr`)).toHaveCount(0)
    await expect(page.getByText(/€/)).toHaveCount(0)

    // La commande avance : l'écran la change de colonne au rechargement des données
    const orderId = await (await admin.request.get('/api/orders')).json().then((r: { orders: { id: string; numero: string }[] }) => r.orders.find((o) => o.numero === numero)!.id)
    expect((await admin.request.post(`/api/orders/${orderId}/status`, { data: { statut: 'fabrication' }, headers: h })).status()).toBe(200)
    await page.reload()
    await expect(page.locator('[data-colonne="fabrication"]')).toContainText(numero)
    await expect(page.locator('[data-colonne="validee"]')).not.toContainText(numero)
  })

  test('refuse l’accès à l’écran sans connexion', async ({ page }) => {
    await page.goto('/ecran-atelier')
    await expect(page).toHaveURL(/\/connexion/)
    expect((await page.request.get('/api/ecran')).status()).toBe(401)
  })
})
