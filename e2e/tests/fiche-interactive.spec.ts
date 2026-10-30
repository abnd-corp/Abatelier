import { ADMIN, apiLogin, createUser, expect, NEW_PASSWORD, test } from './fixtures'

// Fiche de fabrication à suivre à l'écran : l'atelier coche feuille par feuille (récupérer, découper, plier, mettre de côté),
// l'avancement est gardé pour tous les postes, et la fin d'une feuille met le stock à jour.
test.describe('Fiche de fabrication à cocher', () => {
  test('l’atelier coche ses étapes, elles sont gardées, et le stock se met à jour en fin de feuille', async ({ browser, baseURL, uid }) => {
    const h = { Origin: baseURL! }
    const admin = await (await browser.newContext()).newPage()
    await apiLogin(admin.request, baseURL!, ADMIN.identifiant, ADMIN.password)
    const options = await (await admin.request.get('/api/stock/options')).json()
    const matiere = options.materials[0]
    const coloris = options.colors[0]
    const cfg = await (await admin.request.get('/api/public/configurateur')).json()
    const modele = cfg.models.find((x: { nom: string }) => x.nom === 'Couvertine') ?? cfg.models[0]

    // Des feuilles en stock pour que la fiche sache laquelle prendre
    const largeur = 1250
    const res = await admin.request.post('/api/stock/feuilles', { data: { materialId: matiere.id, colorId: coloris.id, largeur, longueur: 3000, quantite: 20 }, headers: h })
    expect([201, 409], await res.text()).toContain(res.status())

    const client = await (await admin.request.post('/api/clients', { data: { type: 'particulier', prenom: 'Suivi', nom: `Test ${uid.slice(-5)}` }, headers: h })).json()
    const order = await (
      await admin.request.post('/api/orders', {
        data: {
          clientId: client.id,
          lignes: [
            {
              repere: 'Mur sud',
              modelId: modele.id,
              materialId: matiere.id,
              colorId: coloris.id,
              cotes: [20, 70, 300, 70, 20],
              angles: [135, 90, 90, 135],
              longueur: 3000,
              quantite: 4,
              accessoires: [],
            },
          ],
          livraison: { mode: 'retrait' },
        },
        headers: h,
      })
    ).json()
    expect((await admin.request.post(`/api/orders/${order.id}/status`, { data: { statut: 'validee' }, headers: h })).status()).toBe(200)

    const identifiant = `${uid}-at`
    const temp = await createUser(admin.request, baseURL!, { identifiant, nom: 'Plieur Suivi', role: 'atelier' })
    const atelier = await (await browser.newContext()).newPage()
    await apiLogin(atelier.request, baseURL!, identifiant, temp)
    await atelier.request.post('/api/auth/password', { data: { current: temp, next: NEW_PASSWORD }, headers: h })

    // Depuis la fiche de la commande
    await atelier.goto(`/fabrication/${order.id}`)
    await atelier.getByRole('link', { name: 'Suivre pas à pas' }).click()
    await expect(atelier).toHaveURL(`/fabrication/${order.id}/suivi`)
    await expect(atelier.getByRole('heading', { level: 2, name: 'Feuille 1 sur 1' })).toBeVisible()
    await expect(atelier.getByText(/Suivi\s+Test/).first()).toBeVisible()
    await expect(atelier.getByText(/€/)).toHaveCount(0)
    await expect(atelier.getByRole('heading', { name: '1. Récupérer la matière' })).toBeVisible()
    await expect(atelier.getByRole('heading', { name: /2\. Découper/ })).toBeVisible()
    await expect(atelier.getByRole('heading', { name: /3\. Plier/ })).toBeVisible()
    await expect(atelier.getByRole('heading', { name: '4. Mettre de côté' })).toBeVisible()
    await expect(atelier.getByText('Chute de cette feuille')).toBeVisible()
    await expect(atelier.getByRole('list', { name: 'La pièce après chaque pli' }).getByRole('listitem')).toHaveCount(4)

    // Récupérer la matière, puis découper bande par bande
    await atelier.getByRole('region', { name: 'Feuille 1 sur 1' }).getByRole('checkbox').first().check()
    const decoupe = atelier.locator('[data-decoupe="1"]')
    await expect(decoupe.getByRole('status')).toHaveText('0 / 4')
    await decoupe.getByRole('button', { name: /Une bande découpée de plus/ }).click()
    await decoupe.getByRole('button', { name: /Une bande découpée de plus/ }).click()
    await expect(decoupe.getByRole('status')).toHaveText('2 / 4')
    // Les cases sont gardées côté serveur : elles réapparaissent après rechargement
    await atelier.reload()
    await expect(atelier.locator('[data-decoupe="1"]').getByRole('status')).toHaveText('2 / 4')
    await expect(atelier.getByRole('region', { name: 'Feuille 1 sur 1' }).getByRole('checkbox').first()).toBeChecked()
    await expect(atelier.getByRole('progressbar')).toBeVisible()

    // Le stock n'est proposé qu'une fois toutes les découpes faites
    const stock = atelier.getByRole('button', { name: /Mettre à jour le stock/ })
    await expect(stock).toBeDisabled()
    await atelier.locator('[data-decoupe="1"]').getByRole('button', { name: 'Tout' }).click()
    await expect(atelier.locator('[data-decoupe="1"]').getByRole('status')).toHaveText('4 / 4')
    await atelier.locator('[data-pliage="1"]').getByRole('button', { name: 'Tout' }).click()
    await expect(atelier.locator('[data-pliage="1"]').getByRole('status')).toHaveText('4 / 4')
    await expect(stock).toBeEnabled()
    await stock.click()
    await expect(atelier.getByRole('status').filter({ hasText: 'Stock à jour' }).first()).toBeVisible()
    await expect(stock).toHaveCount(0)
    await atelier.reload()
    await expect(atelier.getByText(/Stock à jour pour cette feuille \(Plieur Suivi\)/)).toBeVisible()

    // Le journal raconte la mise à jour du stock
    await admin.goto('/journal')
    await expect(admin.getByRole('cell', { name: new RegExp(`A mis à jour le stock de feuilles à la fabrication de la commande ${order.numero}`) })).toBeVisible()
    await atelier.context().close()
  })

  test('est fermé aux visiteurs et à la RH', async ({ browser, baseURL, uid }) => {
    const admin = await (await browser.newContext()).newPage()
    await apiLogin(admin.request, baseURL!, ADMIN.identifiant, ADMIN.password)
    const inconnu = '00000000-0000-4000-8000-000000000000'
    const visitor = await (await browser.newContext()).newPage()
    expect((await visitor.request.get(`/api/production/${inconnu}/suivi`)).status()).toBe(401)
    const identifiant = `${uid}-rh`
    const temp = await createUser(admin.request, baseURL!, { identifiant, nom: 'Claire RH', role: 'rh' })
    const rh = await (await browser.newContext()).newPage()
    await apiLogin(rh.request, baseURL!, identifiant, temp)
    await rh.request.post('/api/auth/password', { data: { current: temp, next: NEW_PASSWORD }, headers: { Origin: baseURL! } })
    expect((await rh.request.get(`/api/production/${inconnu}/suivi`)).status()).toBe(403)
    await rh.goto(`/fabrication/${inconnu}/suivi`)
    await expect(rh).toHaveURL('/tableau-de-bord')
  })
})
