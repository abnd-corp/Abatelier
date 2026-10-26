import { ADMIN, apiLogin, createUser, expect, NEW_PASSWORD, test } from './fixtures'

// Stock de feuilles : l'atelier saisit ses feuilles (matière, épaisseur, coloris, format), les fait entrer et sortir,
// et la fiche de fabrication lui dit quelle feuille prendre.
test.describe('Stock de feuilles', () => {
  test('l’atelier saisit ses feuilles, suit les mouvements, et la fabrication conseille la feuille à prendre', async ({ browser, baseURL, uid }) => {
    const h = { Origin: baseURL! }
    const admin = await (await browser.newContext()).newPage()
    await apiLogin(admin.request, baseURL!, ADMIN.identifiant, ADMIN.password)
    const options = await (await admin.request.get('/api/stock/options')).json()
    const matiere = options.materials[0]
    const coloris = options.colors[0]

    // L'atelier ouvre « Stock de feuilles » depuis son menu
    const identifiant = `${uid}-at`
    const temp = await createUser(admin.request, baseURL!, { identifiant, nom: 'Plieur Stock', role: 'atelier' })
    const atelier = await (await browser.newContext()).newPage()
    await apiLogin(atelier.request, baseURL!, identifiant, temp)
    await atelier.request.post('/api/auth/password', { data: { current: temp, next: NEW_PASSWORD }, headers: h })
    await atelier.goto('/tableau-de-bord')
    const nav = atelier.getByRole('navigation', { name: 'Navigation principale' })
    if (await atelier.getByRole('button', { name: 'Ouvrir le menu' }).isVisible()) await atelier.getByRole('button', { name: 'Ouvrir le menu' }).click()
    await expect(nav.getByRole('link')).toHaveText(['Tableau de bord', 'Fabrication', 'Stock de feuilles'])
    await nav.getByRole('link', { name: 'Stock de feuilles' }).click()
    await expect(atelier.getByRole('heading', { level: 1, name: 'Stock de feuilles' })).toBeVisible()

    // Le formulaire d'ajout et l'historique sont fermés : la page reste légère
    // Scopé à #ajout : les filtres détaillés (R7) ont aussi un champ « Coloris »
    const ajoutForm = atelier.locator('#ajout')
    await expect(atelier.getByLabel('Matière et épaisseur')).toHaveCount(0)
    await atelier.getByRole('button', { name: 'Ajouter des feuilles' }).click()
    await expect(ajoutForm.getByLabel('Matière et épaisseur')).toBeVisible()

    // Saisie : erreur claire, puis une feuille entière et une chute (tailles propres à ce test, pour ne pas gêner les autres)
    // Au moins 500 mm : la pièce testée plus bas a un développé de 480 mm, la feuille doit pouvoir la contenir
    const l = 500 + Math.floor(Math.random() * 2400)
    await ajoutForm.getByLabel('Matière et épaisseur').selectOption(matiere.id)
    await ajoutForm.getByLabel('Coloris').selectOption(coloris.id)
    await ajoutForm.getByLabel('Largeur (mm)').fill('10')
    await ajoutForm.getByLabel('Longueur (mm)').fill('3000')
    await ajoutForm.getByLabel('Quantité en stock').fill('6')
    await atelier.getByRole('button', { name: 'Ajouter au stock' }).click()
    await expect(atelier.getByText('50 mm minimum')).toBeVisible()
    await ajoutForm.getByLabel('Largeur (mm)').fill(String(l))
    await ajoutForm.getByLabel('Alerte stock bas (0 = aucune)').fill('4')
    await atelier.getByRole('button', { name: 'Ajouter au stock' }).click()
    await expect(atelier.getByRole('status')).toContainText('Feuille ajoutée')
    await expect(atelier.getByLabel('Matière et épaisseur')).toHaveCount(0)
    const ligne = atelier.getByRole('article').filter({ hasText: `${l.toLocaleString('fr-FR')}` })
    await expect(ligne).toContainText(matiere.label.split(' ')[0])
    await expect(ligne.locator('b.mono')).toHaveText('6')
    // Le même format ne se crée pas deux fois
    await atelier.getByRole('button', { name: 'Ajouter des feuilles' }).click()
    await ajoutForm.getByLabel('Matière et épaisseur').selectOption(matiere.id)
    await ajoutForm.getByLabel('Coloris').selectOption(coloris.id)
    await ajoutForm.getByLabel('Largeur (mm)').fill(String(l))
    await ajoutForm.getByLabel('Longueur (mm)').fill('3000')
    await atelier.getByRole('button', { name: 'Ajouter au stock' }).click()
    await expect(atelier.getByText(/existe déjà dans le stock/)).toBeVisible()
    await atelier.getByRole('button', { name: 'Fermer le formulaire' }).click()

    // Un seul bouton « Ajuster le stock », qui ouvre le choix entrée / sortie / inventaire
    await ligne.getByRole('button', { name: 'Ajuster le stock' }).click()
    await ligne.getByRole('button', { name: 'Sortie' }).click()
    // Sortie trop grande refusée, sortie normale acceptée : le stock bas apparaît
    await atelier.getByLabel('Feuilles sorties').fill('9')
    await atelier.getByRole('button', { name: 'Valider' }).click()
    await expect(atelier.getByRole('alert')).toContainText('Il n’y a que 6 feuilles')
    await atelier.getByLabel('Feuilles sorties').fill('3')
    await atelier.getByLabel(/^Note/).last().fill('Commande test')
    await atelier.getByRole('button', { name: 'Valider' }).click()
    await expect(atelier.getByRole('status')).toContainText('3 feuilles (stock bas)')
    await expect(ligne.locator('b.mono')).toHaveText('3')
    await expect(ligne).toContainText('Stock bas')
    // Inventaire et historique
    await ligne.getByRole('button', { name: 'Ajuster le stock' }).click()
    await ligne.getByRole('button', { name: 'Compter' }).click()
    await atelier.getByLabel('Quantité comptée').fill('8')
    await atelier.getByRole('button', { name: 'Valider' }).click()
    await expect(ligne.locator('b.mono')).toHaveText('8')
    await expect(atelier.getByRole('button', { name: /Derniers mouvements/ })).toHaveAttribute('aria-expanded', 'false')
    await atelier.getByRole('button', { name: /Derniers mouvements/ }).click()
    const hist = atelier.getByRole('region', { name: /Derniers mouvements/ })
    await expect(hist).toContainText('Utilisée en fabrication · Commande test')
    await expect(hist).toContainText('Plieur Stock')

    // L'atelier ne voit ni prix ni accès aux commandes
    await expect(atelier.getByText(/€/)).toHaveCount(0)
    await atelier.goto('/commandes')
    await expect(atelier).toHaveURL('/tableau-de-bord')

    // Une commande validée : la fabrication dit quelle feuille prendre
    const cfg = await (await admin.request.get('/api/public/configurateur')).json()
    const m = cfg.models.find((x: { nom: string }) => x.nom === 'Couvertine') ?? cfg.models[0]
    const client = await (await admin.request.post('/api/clients', { data: { type: 'particulier', prenom: 'Stock', nom: `Test ${uid.slice(-5)}` }, headers: h })).json()
    const order = await (
      await admin.request.post('/api/orders', {
        data: {
          clientId: client.id,
          lignes: [{ modelId: m.id, materialId: matiere.id, colorId: coloris.id, cotes: [20, 70, 300, 70, 20], angles: [135, 90, 90, 135], longueur: 3000, quantite: 4, accessoires: [] }],
          livraison: { mode: 'retrait' },
        },
        headers: h,
      })
    ).json()
    expect((await admin.request.post(`/api/orders/${order.id}/status`, { data: { statut: 'validee' }, headers: h })).status()).toBe(200)
    await atelier.goto(`/fabrication/${order.id}`)
    const conseil = atelier.getByRole('region', { name: 'Feuilles à prendre' })
    await expect(conseil).toContainText('Prendre')
    await expect(conseil).toContainText(`${l.toLocaleString('fr-FR')} × 3 000 mm`.replace(/ /g, ' '))
    await expect(conseil).toContainText('pièces par feuille')
    await expect(conseil).toContainText('% de perte')

    // La direction voit aussi le stock, et le journal le raconte
    await admin.goto('/journal')
    await expect(admin.getByRole('cell', { name: /Sortie de 3 feuilles/ }).first()).toBeVisible()
  })

  test('est fermé à la RH et aux visiteurs', async ({ browser, baseURL, uid }) => {
    const admin = await (await browser.newContext()).newPage()
    await apiLogin(admin.request, baseURL!, ADMIN.identifiant, ADMIN.password)
    const visitor = await (await browser.newContext()).newPage()
    expect((await visitor.request.get('/api/stock/feuilles')).status()).toBe(401)
    await visitor.goto('/stock')
    await expect(visitor).toHaveURL(/\/connexion/)
    const identifiant = `${uid}-rh`
    const temp = await createUser(admin.request, baseURL!, { identifiant, nom: 'Claire RH', role: 'rh' })
    const rh = await (await browser.newContext()).newPage()
    await apiLogin(rh.request, baseURL!, identifiant, temp)
    await rh.request.post('/api/auth/password', { data: { current: temp, next: NEW_PASSWORD }, headers: { Origin: baseURL! } })
    expect((await rh.request.get('/api/stock/feuilles')).status()).toBe(403)
    await rh.goto('/stock')
    await expect(rh).toHaveURL('/tableau-de-bord')
  })
})
