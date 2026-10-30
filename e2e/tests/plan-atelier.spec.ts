import { ADMIN, apiLogin, createUser, expect, NEW_PASSWORD, test } from './fixtures'

// Le plan graphique de l'atelier est réservé à la direction : il lit les commandes à fabriquer et le stock, sans que personne ne le tienne à jour.
const PASSWORD = 'Plieuse-numerique-2026'

test.describe('Plan graphique de l’atelier @responsive', () => {
  test('une commande payée apparaît dans « À lancer », avance avec l’atelier, et le stock bas est signalé', async ({ browser, baseURL, uid, page }) => {
    const h = { Origin: baseURL! }
    const admin = await (await browser.newContext()).newPage()
    await apiLogin(admin.request, baseURL!, ADMIN.identifiant, ADMIN.password)

    // Une référence de feuilles sous son seuil
    const options = await (await admin.request.get('/api/stock/options')).json()
    const largeur = 1100 + Math.floor(Math.random() * 900)
    const ref = await admin.request.post('/api/stock/feuilles', {
      data: { materialId: options.materials[0].id, colorId: options.colors[0].id, largeur, longueur: 2600, quantite: 1, seuil: 5 },
      headers: h,
    })
    expect(ref.status(), await ref.text()).toBe(201)

    // Une commande boutique payée : elle naît validée
    const { id } = await (await admin.request.post('/api/boutique/produits', { data: { nom: `Plan ${uid.slice(-8)}` }, headers: h })).json()
    const v = await (await admin.request.post(`/api/boutique/produits/${id}/variantes`, { data: { libelle: '200 mm · 2 m', prixTtc: 40 }, headers: h })).json()
    expect((await admin.request.patch(`/api/boutique/produits/${id}`, { data: { actif: true }, headers: h })).status()).toBe(200)
    const client = await (await browser.newContext()).newPage()
    expect(
      (await client.request.post('/api/espace/inscription', { data: { nom: `Plan ${uid.slice(-6)}`, email: `${uid}@exemple.fr`, password: PASSWORD, consentement: true }, headers: h })).status(),
    ).toBe(201)
    const checkout = await client.request.post('/api/espace/boutique/paiement', { data: { lignes: [{ variantId: v.variante.id, quantite: 1 }], livraison: { mode: 'retrait' } }, headers: h })
    expect(checkout.status(), await checkout.text()).toBe(201)
    const paiementId = (await checkout.json()).id
    expect((await client.request.post(`/api/espace/boutique/paiements/${paiementId}/simulation`, { data: { issue: 'paye' }, headers: h })).status()).toBe(200)
    const numero = (await (await client.request.get(`/api/espace/boutique/paiements/${paiementId}`)).json()).commande.numero as string

    // Un compte de direction (sans la section Atelier) ouvre le plan
    const identifiant = `${uid}-pl`
    const temp = await createUser(admin.request, baseURL!, { identifiant, nom: 'Direction Plan', sections: ['ventes', 'direction'], admin: false })
    await apiLogin(page.request, baseURL!, identifiant, temp)
    await page.request.post('/api/auth/password', { data: { current: temp, next: NEW_PASSWORD }, headers: h })
    await page.goto('/plan-atelier')
    await expect(page.getByRole('heading', { level: 1, name: 'Plan de l’atelier' })).toBeVisible()
    // Toute la page : pas de menu, seulement un bouton pour fermer
    await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toHaveCount(0)

    // Sur téléphone et tablette, les listes sont rangées au départ pour laisser voir le plan
    const bouton = page.getByRole('button', { name: 'Listes' })
    if ((await bouton.getAttribute('aria-pressed')) === 'false') await bouton.click()

    // Le plan est dessiné, et un résumé en texte le décrit
    await expect(page.getByRole('img', { name: /Plan de l’atelier : \d+ commande\(s\) à lancer/ })).toBeVisible()
    const aLancer = page.locator('[data-lieu="a-lancer"]')
    await expect(aLancer).toContainText(numero)
    await expect(aLancer).toContainText(`Plan ${uid.slice(-6)}`)
    await expect(page.getByText(`${uid}@exemple.fr`)).toHaveCount(0)
    // Aucun prix sur ce plan
    await expect(page.getByText(/€/)).toHaveCount(0)

    // Le stock bas est signalé
    await expect(page.getByRole('list', { name: 'Références sous leur seuil' })).toContainText(`${largeur.toLocaleString('fr-FR')} × 2 600 mm`)

    // Quand l'atelier lance la commande, elle change de lieu au rechargement des données
    expect(
      (
        await admin.request.post(
          '/api/orders/' + (await (await admin.request.get('/api/orders')).json().then((r: { orders: { id: string; numero: string }[] }) => r.orders.find((o) => o.numero === numero)!.id)) + '/status',
          { data: { statut: 'fabrication' }, headers: h },
        )
      ).status(),
    ).toBe(200)
    await page.goto('/plan-atelier')
    if ((await bouton.getAttribute('aria-pressed')) === 'false') await bouton.click()
    await expect(page.locator('[data-lieu="fabrication"]')).toContainText(numero)
    // Le groupe « À lancer » disparaît quand il est vide : on compte donc les lignes plutôt que de lire son texte
    await expect(page.locator('[data-lieu="a-lancer"] li', { hasText: numero })).toHaveCount(0)
  })

  test('le bouton Fermer ramène au tableau de bord, et les listes se rangent', async ({ page, baseURL, uid, browser }) => {
    const h = { Origin: baseURL! }
    const admin = await (await browser.newContext()).newPage()
    await apiLogin(admin.request, baseURL!, ADMIN.identifiant, ADMIN.password)
    const identifiant = `${uid}-fm`
    const temp = await createUser(admin.request, baseURL!, { identifiant, nom: 'Direction Fermer', sections: ['direction'], admin: false })
    await apiLogin(page.request, baseURL!, identifiant, temp)
    await page.request.post('/api/auth/password', { data: { current: temp, next: NEW_PASSWORD }, headers: h })
    await page.goto('/plan-atelier')
    const listes = page.getByRole('complementary', { name: 'Commandes et stock' })
    const bouton = page.getByRole('button', { name: 'Listes' })
    // Ouvertes au départ sur grand écran, rangées sur téléphone et tablette : le bouton fait l'inverse de l'état de départ
    const ouvertes = (await bouton.getAttribute('aria-pressed')) === 'true'
    await bouton.click()
    if (ouvertes) await expect(listes).toBeHidden()
    else await expect(listes).toBeVisible()
    await bouton.click()
    if (ouvertes) await expect(listes).toBeVisible()
    else await expect(listes).toBeHidden()
    await page.getByRole('link', { name: 'Fermer' }).click()
    await expect(page).toHaveURL(/\/tableau-de-bord$/)
  })

  test('l’atelier n’y a pas accès, le plan n’apparaît pas dans son menu', async ({ page, baseURL, uid, browser }) => {
    const h = { Origin: baseURL! }
    const admin = await (await browser.newContext()).newPage()
    await apiLogin(admin.request, baseURL!, ADMIN.identifiant, ADMIN.password)
    const identifiant = `${uid}-at`
    const temp = await createUser(admin.request, baseURL!, { identifiant, nom: 'Plieur Sans Plan', role: 'atelier' })
    await apiLogin(page.request, baseURL!, identifiant, temp)
    await page.request.post('/api/auth/password', { data: { current: temp, next: NEW_PASSWORD }, headers: h })
    expect((await page.request.get('/api/plan')).status()).toBe(403)
    await page.goto('/plan-atelier')
    await expect(page).toHaveURL(/\/tableau-de-bord$/)
    await page.goto('/tableau-de-bord')
    await expect(page.getByRole('link', { name: 'Plan graphique' })).toHaveCount(0)
  })

  test('refuse l’accès au plan sans connexion', async ({ page }) => {
    await page.goto('/plan-atelier')
    await expect(page).toHaveURL(/\/connexion/)
  })
})
