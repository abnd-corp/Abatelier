import { ADMIN, apiLogin, expect, makePng, test, waitForMail } from './fixtures'

// Boutique : la direction crée un produit, le client le commande et le paie (faux prestataire), la direction refuse et rembourse.
const PASSWORD = 'Plieuse-numerique-2026'

test.describe('Boutique : de la fiche produit au remboursement', () => {
  test('la direction met un produit en ligne, un client le paie, la direction refuse et rembourse', async ({ page, browser, baseURL, uid, adminPage }) => {
    const nom = `Couvertine e2e ${uid.slice(-8)}`
    const client = `Client ${uid.slice(-6)}`
    const email = `${uid}@exemple.fr`

    // --- La direction crée le produit ---
    await adminPage.goto('/produits')
    await adminPage.getByLabel('Nouveau produit').fill(nom)
    await adminPage.getByRole('button', { name: 'Créer le produit' }).click()
    await expect(adminPage).toHaveURL(/\/produits\/[0-9a-f-]{36}$/)
    const produitId = adminPage.url().split('/').pop()!
    await expect(adminPage.getByRole('heading', { level: 1, name: nom })).toBeVisible()
    await expect(adminPage.locator('.head-actions')).toContainText('Hors ligne')
    // Pas de photo : l'emplacement invite à en insérer une
    await expect(adminPage.locator('.empty-photo')).toContainText('Insérez une photo')

    // Impossible de mettre en ligne sans déclinaison
    await adminPage.getByRole('button', { name: 'Mettre en ligne' }).click()
    await expect(adminPage.getByRole('alert').filter({ hasText: 'au moins une déclinaison' })).toBeVisible()

    await adminPage.getByLabel('Description affichée sur le site').fill('Couvertine en aluminium laqué blanc, livrée sans visserie.')
    await adminPage.getByRole('button', { name: 'Enregistrer la fiche' }).click()
    await expect(adminPage.getByText('Fiche enregistrée.')).toBeVisible()

    await adminPage.locator('#p-file').setInputFiles({ name: 'couvertine.png', mimeType: 'image/png', buffer: makePng(900, 600) })
    await adminPage.getByLabel(/^Description de la photo \(pour/).fill('Couvertine blanche')
    await adminPage.getByRole('button', { name: 'Envoyer la photo' }).click()
    await expect(adminPage.getByText('Photo enregistrée.')).toBeVisible()
    await expect(adminPage.locator('.empty-photo')).toHaveCount(0)

    await adminPage.getByLabel('Libellé *').fill('270 mm · 1 m')
    await adminPage.getByLabel('Prix TTC (€) *').fill('21,00')
    await adminPage.getByRole('button', { name: 'Ajouter', exact: true }).click()
    await expect(adminPage.getByLabel('Prix TTC de 270 mm · 1 m')).toHaveValue('21,00')
    await adminPage.getByLabel('Libellé *').fill('320 mm · 3 m')
    await adminPage.getByLabel('Prix TTC (€) *').fill('84')
    await adminPage.getByRole('button', { name: 'Ajouter', exact: true }).click()
    await expect(adminPage.getByLabel('Prix TTC de 320 mm · 3 m')).toHaveValue('84,00')

    // Hors ligne : invisible sur le site
    const visitor = await browser.newPage()
    await visitor.goto('/boutique')
    await expect(visitor.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(visitor.getByText(nom)).toHaveCount(0)

    await adminPage.getByRole('button', { name: 'Mettre en ligne' }).click()
    await expect(adminPage.getByText('Le produit est en ligne sur le site.')).toBeVisible()

    // --- Le visiteur le voit, le met au panier ---
    await visitor.goto('/boutique')
    const carte = visitor.getByRole('link', { name: new RegExp(nom) })
    await expect(carte).toContainText('À partir de 21,00')
    await expect(carte.getByRole('img')).toBeVisible()
    await carte.click()
    await expect(visitor.getByRole('heading', { level: 1, name: nom })).toBeVisible()
    await expect(visitor.getByText('livrée sans visserie')).toBeVisible()
    await visitor.getByLabel('Choisissez votre version').selectOption({ label: '320 mm · 3 m · 84,00 € TTC' })
    await visitor.getByLabel('Quantité').fill('2')
    // Sans espace client, on ne peut pas ajouter au panier : bouton désactivé et explication
    await expect(visitor.getByRole('button', { name: 'Ajouter au panier' })).toBeDisabled()
    await expect(visitor.getByRole('status').filter({ hasText: 'Il faut un espace client' })).toBeVisible()
    await visitor.getByRole('link', { name: 'Créer mon espace' }).click()
    await expect(visitor).toHaveURL(/\/espace\/inscription\?redirect=/)
    await visitor.getByLabel('Nom *').fill(client)
    await visitor.getByLabel('Adresse e-mail *').fill(email)
    await visitor.getByLabel('Mot de passe *').fill(PASSWORD)
    await visitor.getByLabel(/J’accepte que mes données/).check()
    await visitor.getByRole('button', { name: 'Créer mon espace', exact: true }).click()
    // De retour sur la fiche du produit, connecté : l'ajout est possible
    await expect(visitor).toHaveURL(new RegExp(`/boutique/${produitId}$`))
    await visitor.getByLabel('Choisissez votre version').selectOption({ label: '320 mm · 3 m · 84,00 € TTC' })
    await visitor.getByLabel('Quantité').fill('2')
    await expect(visitor.getByRole('button', { name: 'Ajouter au panier' })).toBeEnabled()
    await visitor.getByRole('button', { name: 'Ajouter au panier' }).click()
    await expect(visitor.getByText('Ajouté au panier.')).toBeVisible()
    await expect(visitor.getByRole('link', { name: 'Mon panier, 2 articles' })).toBeVisible()

    await visitor.getByRole('link', { name: 'Mon panier, 2 articles' }).click()
    await expect(visitor.getByRole('heading', { level: 1, name: 'Mon panier' })).toBeVisible()
    await expect(visitor.locator('dl.totals')).toContainText('Total TTC168,00')
    // Un rechargement garde le panier
    await visitor.reload()
    await expect(visitor.locator('dl.totals')).toContainText('Total TTC168,00')

    // --- Paiement, déjà connecté ---
    await visitor.locator('#paiement').getByRole('button', { name: /^Payer 168,00/ }).click()

    await expect(visitor).toHaveURL(/\/paiement-simulation\/[0-9a-f-]{36}$/)
    await expect(visitor.getByText('aucune carte n’est demandée')).toBeVisible()
    await expect(visitor.getByText(/168,00/)).toBeVisible()
    // Une commande n'existe pas tant que le paiement n'est pas confirmé
    await visitor.getByRole('button', { name: 'Simuler un paiement réussi' }).click()
    await expect(visitor.getByRole('heading', { name: 'Merci, votre commande est confirmée' })).toBeVisible()
    const numero = (await visitor.getByText(/C-\d{4}-\d{4}/).first().innerText()).match(/C-\d{4}-\d{4}/)![0]
    // Panier vidé
    await expect(visitor.getByRole('link', { name: 'Mon panier, vide' })).toBeVisible()

    // Confirmation par e-mail au client, alerte à la direction
    const confirmation = await waitForMail(page.request, `Votre commande ${numero} est confirmée`)
    expect(confirmation.To.map((a) => a.Address)).toEqual([email])
    await waitForMail(page.request, `Commande boutique payée : ${numero}`)

    // --- Le client suit sa commande ---
    await visitor.getByRole('link', { name: 'Suivre ma commande' }).click()
    await expect(visitor.getByRole('heading', { level: 1, name: numero })).toBeVisible()
    await expect(visitor.getByRole('region', { name: 'Paiement' })).toContainText('Payé')
    await expect(visitor.getByRole('region', { name: 'Vos articles' })).toContainText('2 × ' + nom)
    await expect(visitor.getByText('Accepter le devis')).toHaveCount(0)

    // --- La direction la voit, et la refuse : le client est remboursé ---
    await adminPage.goto('/commandes?filtre=toutes')
    const ligne = adminPage.getByRole('row').filter({ hasText: numero })
    await expect(ligne).toContainText('Boutique')
    await ligne.getByRole('link', { name: numero }).click()
    await expect(adminPage.getByText(/Payé par carte le/)).toBeVisible()
    // L'annulation ordinaire n'existe pas pour une commande payée : seulement le refus avec remboursement
    await expect(adminPage.getByRole('button', { name: 'Annuler la commande' })).toHaveCount(0)
    await adminPage.getByRole('button', { name: 'Refuser et rembourser', exact: true }).click()
    await expect(adminPage.getByRole('button', { name: /Refuser et rembourser 168,00/ })).toBeDisabled()
    await adminPage.getByLabel('Motif du refus (transmis au client)').fill('Longueur impossible à plier sur notre machine.')
    await adminPage.getByRole('button', { name: /Refuser et rembourser 168,00/ }).click()
    await expect(adminPage.getByText(/Commande refusée : 168,00/)).toBeVisible()
    await expect(adminPage.getByText(/Remboursé en totalité le/)).toBeVisible()

    const refus = await waitForMail(page.request, `Votre commande ${numero} ne peut pas être réalisée`)
    expect(refus.Text).toContain('Longueur impossible à plier sur notre machine.')
    expect(refus.To.map((a) => a.Address)).toEqual([email])

    await visitor.reload()
    await expect(visitor.getByText('Vous êtes remboursé de la totalité, 168,00')).toBeVisible()
    await expect(visitor.getByText('Motif : Longueur impossible à plier sur notre machine.')).toBeVisible()
    await expect(visitor.getByRole('region', { name: 'Paiement' })).toContainText('Remboursé')

    // --- Retiré du site ---
    await adminPage.goto(`/produits/${produitId}`)
    await adminPage.getByRole('button', { name: 'Retirer du site' }).click()
    await expect(adminPage.getByText('Le produit n’est plus visible sur le site.')).toBeVisible()
    await visitor.goto(`/boutique/${produitId}`)
    await expect(visitor.getByRole('heading', { name: 'Ce produit n’est plus en vente' })).toBeVisible()
    await visitor.goto('/boutique')
    await expect(visitor.getByText(nom)).toHaveCount(0)
  })

  test('un article retiré du site est signalé dans le panier, et un visiteur ne peut ni payer ni voir la gestion', async ({ browser, baseURL, uid }) => {
    const admin = await (await browser.newContext()).newPage()
    await apiLogin(admin.request, baseURL!, ADMIN.identifiant, ADMIN.password)
    const h = { Origin: baseURL! }
    const nom = `Bavette e2e ${uid.slice(-8)}`
    const { id } = await (await admin.request.post('/api/boutique/produits', { data: { nom }, headers: h })).json()
    const v = await (await admin.request.post(`/api/boutique/produits/${id}/variantes`, { data: { libelle: '150 mm · 1 m', prixTtc: 15 }, headers: h })).json()
    expect((await admin.request.patch(`/api/boutique/produits/${id}`, { data: { actif: true }, headers: h })).status()).toBe(200)

    const visitor = await browser.newPage()
    await visitor.goto('/boutique')
    await visitor.evaluate((variantId) => localStorage.setItem('aps-panier', JSON.stringify([{ variantId, quantite: 1 }])), v.variante.id)
    await visitor.goto('/panier')
    await expect(visitor.locator('dl.totals')).toContainText('Total TTC15,00')
    await admin.request.patch(`/api/boutique/produits/${id}`, { data: { actif: false }, headers: h })
    await visitor.reload()
    await expect(visitor.getByRole('alert').filter({ hasText: 'n’est plus en vente' })).toBeVisible()
    await visitor.getByRole('button', { name: 'Les retirer' }).click()
    await expect(visitor.getByText('Votre panier est vide')).toBeVisible()

    // Le visiteur ne peut pas ouvrir de paiement sans compte, ni gérer les produits
    expect((await visitor.request.post('/api/espace/boutique/paiement', { data: { lignes: [{ variantId: v.variante.id, quantite: 1 }], livraison: { mode: 'retrait' } }, headers: h })).status()).toBe(401)
    expect((await visitor.request.get('/api/boutique/produits')).status()).toBe(401)
    await visitor.goto('/produits')
    await expect(visitor).toHaveURL(/\/connexion/)
    await admin.request.delete(`/api/boutique/produits/${id}`, { headers: h })
  })

  test('la direction importe un catalogue, le filtre, copie un produit, ajuste les prix et met tout en ligne d’un coup', async ({ adminPage, browser, uid }) => {
    const tag = uid.slice(-6).toUpperCase()
    const catalogue = [
      { nom: `BANDEAUX EN « L » BLANC ${tag}`, categorie: ['BANDEAU'], variations: [{ attrs: { 'Épaisseur Alu': '1 mm', 'HAUTEUR DE BANDEAU': '200' }, prix: 26.5, achetable: true }, { attrs: { 'Épaisseur Alu': '1 mm', 'HAUTEUR DE BANDEAU': '225' }, prix: 0, achetable: true }] },
      { nom: `BOUCHON DE COUVERTINE ${tag}`, categorie: ['ACCESSOIRE COUVERTINE'], variations: [{ attrs: { Quantité: 'Par 2' }, prix: 12, achetable: true }] },
    ]
    await adminPage.goto('/produits')
    await adminPage.locator('#prod-import').setInputFiles({ name: 'catalogue.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(catalogue)) })
    await expect(adminPage.getByRole('status').filter({ hasText: 'Import terminé' })).toContainText('2 produits créés (cachés du site)')
    await expect(adminPage.getByRole('status')).toContainText('1 ignorée')

    // Recherche, puis fiche : noms lisibles, déclinaison à 0 € écartée
    await adminPage.getByLabel('Rechercher').fill(tag)
    const lignes = adminPage.locator('tbody tr')
    await expect(lignes).toHaveCount(2)
    await expect(lignes.first()).toContainText('Hors ligne')
    await adminPage.getByRole('link', { name: `Bandeaux en « L » blanc ${tag}` }).click()
    await expect(adminPage.getByLabel('Prix TTC de 1 mm · hauteur de bandeau 200')).toHaveValue('26,50')

    // Hausse de 10 % sur toutes les déclinaisons
    await adminPage.getByLabel('Ajuster tous les prix (%)').fill('10')
    await adminPage.getByRole('button', { name: 'Appliquer' }).click()
    await expect(adminPage.getByText('Prix augmentés de 10 %')).toBeVisible()
    await expect(adminPage.getByLabel('Prix TTC de 1 mm · hauteur de bandeau 200')).toHaveValue('29,15')

    // Copie pour un autre coloris
    await adminPage.getByRole('button', { name: 'Copier ce produit' }).click()
    await adminPage.getByLabel('Nom de la copie').fill(`Bandeaux en « L » gris ${tag}`)
    await adminPage.getByRole('button', { name: 'Créer la copie' }).click()
    await expect(adminPage.getByRole('heading', { level: 1, name: `Bandeaux en « L » gris ${tag}` })).toBeVisible()
    await expect(adminPage.getByLabel('Prix TTC de 1 mm · hauteur de bandeau 200')).toHaveValue('29,15')

    // Tout mettre en ligne d'un coup : le visiteur voit les trois produits
    await adminPage.goto('/produits')
    await adminPage.getByLabel('Rechercher').fill(tag)
    await expect(adminPage.locator('tbody tr')).toHaveCount(3)
    await adminPage.getByLabel('Choisir tous les produits affichés').check()
    await adminPage.getByRole('button', { name: 'Mettre en ligne', exact: true }).click()
    await expect(adminPage.getByRole('status')).toContainText('3 produits mis en ligne')
    const visitor = await browser.newPage()
    await visitor.goto('/boutique')
    await expect(visitor.getByRole('link', { name: new RegExp(`Bandeaux en « L » gris ${tag}`, "i") })).toBeVisible()
    await expect(visitor.getByRole('link', { name: new RegExp(`Bouchon de couvertine ${tag}`, "i") })).toBeVisible()

    // Nettoyage en lot, avec confirmation
    await adminPage.getByLabel('Choisir tous les produits affichés').check()
    await adminPage.getByRole('button', { name: 'Supprimer…' }).click()
    await adminPage.getByRole('button', { name: 'Confirmer la suppression' }).click()
    await expect(adminPage.getByRole('status')).toContainText('3 produits supprimés')
  })
})
