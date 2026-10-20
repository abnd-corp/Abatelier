import { apiLogin, createUser, expect, NEW_PASSWORD, test } from './fixtures'

test.describe('Tarifs et catalogue', () => {
  test('la direction ajoute, modifie et désactive une matière, et l’historique des prix est au journal', async ({ adminPage, uid }) => {
    const nom = `Essai ${uid.slice(-6)}`
    await adminPage.goto('/tableau-de-bord')
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

  test('la direction ajoute un accessoire pour les bandeaux, change sa règle de quantité et le retrouve au journal', async ({ adminPage, uid }) => {
    const nom = `Patte ${uid.slice(-6)}`
    await adminPage.goto('/catalogue')
    await adminPage.getByRole('tab', { name: /Accessoires/ }).click()
    await expect(adminPage).toHaveURL(/onglet=accessoires/)
    const panel = adminPage.getByRole('tabpanel', { name: 'Accessoires' })
    // Catalogue de départ
    await expect(panel.getByRole('row', { name: /Éclisse de jonction/ })).toContainText(/7,80\s€/)
    await expect(panel.getByRole('row', { name: /Embouts de bavette/ })).toContainText('la paire')

    await panel.getByRole('button', { name: 'Ajouter un accessoire' }).click()
    await panel.getByLabel('Accessoire', { exact: true }).fill(nom)
    await panel.getByLabel('Prix (HT)').fill('3,20')
    // Aucun modèle coché : refusé
    await panel.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(panel.getByText('Choisissez au moins un modèle.')).toBeVisible()
    await panel.getByRole('checkbox', { name: 'Bandeau' }).check()
    await panel.getByLabel('Quantité proposée').selectOption('fixe')
    await panel.getByLabel('Nombre par ligne').fill('4')
    await expect(panel.getByText('Pour une ligne de 4 pièces, 4 proposés')).toBeVisible()
    await panel.getByRole('button', { name: 'Enregistrer' }).click()
    const row = panel.getByRole('row', { name: new RegExp(nom) })
    await expect(row).toContainText(/3,20\s€/)
    await expect(row).toContainText('Bandeau')

    // Nouvelle règle : une par pièce
    await row.getByRole('button', { name: `Modifier ${nom}` }).click()
    await expect(panel.getByLabel('Prix (HT)')).toHaveValue('3,20')
    await panel.getByLabel('Quantité proposée').selectOption('par_piece')
    await expect(panel.getByLabel('Nombre par ligne')).toHaveCount(0)
    await panel.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(panel.getByRole('status')).toContainText(`${nom} enregistré`)

    // Désactivé, puis au journal
    await row.getByRole('button', { name: 'Désactiver' }).click()
    await expect(row).toHaveCount(0)
    await adminPage.goto('/journal')
    await adminPage.getByRole('button', { name: 'Catalogue et prix' }).click()
    await expect(adminPage.getByRole('cell', { name: `A modifié l’accessoire ${nom} : quantité proposée nombre fixe → une par pièce, quantité fixe 4 → 0` })).toBeVisible()
    await expect(adminPage.getByRole('cell', { name: new RegExp(`A ajouté l’accessoire ${nom} \\(3,20\\s€ la pièce\\)`) })).toBeVisible()
  })

  test('la direction règle la livraison et teste une adresse de chantier', async ({ adminPage }) => {
    // Réglages partagés par tous les tests : on remet les valeurs de départ à la fin
    await adminPage.goto('/catalogue')
    await adminPage.getByRole('tab', { name: /Livraison/ }).click()
    await expect(adminPage).toHaveURL(/onglet=livraison/)
    const panel = adminPage.getByRole('tabpanel', { name: 'Livraison' })
    const reglages = panel.getByRole('form', { name: 'Réglages de livraison' })
    const save = reglages.getByRole('button', { name: 'Enregistrer', exact: true })
    await expect(reglages.getByLabel('Zone 1 : prix')).toHaveValue('39,00')
    await expect(save).toBeDisabled()

    // Livraison offerte dès 300 € dans la première zone, supplément pièces longues
    await reglages.getByLabel('Zone 1 : livraison offerte dès').fill('300')
    await reglages.getByLabel('Supplément de livraison pour les pièces longues').check()
    await reglages.getByLabel('Au-delà de').fill('2500')
    await reglages.getByLabel('Supplément', { exact: true }).fill('25')
    await save.click()
    await expect(panel.getByText('Réglages de livraison enregistrés')).toBeVisible()
    await adminPage.reload()
    await expect(reglages.getByLabel('Zone 1 : livraison offerte dès')).toHaveValue('300,00')
    await expect(reglages.getByLabel('Au-delà de')).toHaveValue('2500')

    // Une zone en double est refusée
    await reglages.getByLabel('Zone 2 : distance maximum').fill('30')
    await save.click()
    await expect(reglages.getByRole('alert')).toContainText('de la plus proche à la plus lointaine')
    await reglages.getByRole('button', { name: 'Annuler les modifications' }).click()

    // Simulateur : Saint-Étienne, commande de 400 €, une pièce de 2,8 m
    const sim = panel.getByRole('form', { name: 'Tester une adresse' })
    await sim.getByLabel('Adresse du chantier').fill('10 place Jean Jaurès, 42000 Saint-Étienne')
    await sim.getByLabel('Montant commande').fill('400')
    await sim.getByLabel('Pièce la plus longue').fill('2800')
    await sim.getByRole('button', { name: 'Calculer' }).click()
    const result = sim.getByRole('status')
    await expect(result).toContainText('Saint-Étienne 42000')
    await expect(result).toContainText('Zone jusqu’à 30 km')
    await expect(result).toContainText('Livraison offerte')
    await expect(result).toContainText(/Livraison : 25,00\s€ HT/)
    // Trop loin
    await sim.getByLabel('Adresse du chantier').fill('75001 Paris')
    await sim.getByRole('button', { name: 'Calculer' }).click()
    await expect(result).toContainText('Hors zone : pas de livraison au-delà de 80 km.')

    // Au journal
    await adminPage.goto('/journal')
    await adminPage.getByRole('button', { name: 'Catalogue et prix' }).click()
    await expect(adminPage.getByRole('cell', { name: /A modifié la livraison : .*offerte dès 300,00\s€.*seuil des pièces longues aucun → 2500 mm/ }).first()).toBeVisible()

    // Retour aux valeurs de départ pour les autres tests
    const res = await adminPage.request.patch('/api/catalog/delivery', {
      data: { zones: [{ distanceMax: 30, prix: 39, franco: null }, { distanceMax: 80, prix: 69, franco: null }], longueurSeuil: null, longueurPrix: 0 },
      headers: { Origin: new URL(adminPage.url()).origin },
    })
    expect(res.status()).toBe(200)
  })

  test('la direction règle le façonnage et les remises quantité', async ({ adminPage }) => {
    // Réglages partagés par tous les tests : on remet les valeurs de départ à la fin
    await adminPage.goto('/catalogue')
    await adminPage.getByRole('tab', { name: /Façonnage et conditions/ }).click()
    const panel = adminPage.getByRole('tabpanel', { name: /Façonnage et conditions/ })
    const save = panel.getByRole('button', { name: 'Enregistrer', exact: true })
    await expect(save).toBeDisabled()

    await panel.getByLabel('Prix par pli et par mètre').fill('1,05')
    await expect(panel.getByText(/Une couvertine de 3 m à 4 plis : 12,60\s€/)).toBeVisible()
    await panel.getByRole('button', { name: 'Ajouter un palier' }).click()
    await panel.getByLabel('Palier 3 : nombre de pièces').fill('200')
    await panel.getByLabel('Palier 3 : remise').fill('15')
    await save.click()
    await expect(panel.getByText('Réglages enregistrés')).toBeVisible()

    // Conservé après rechargement
    await adminPage.reload()
    await expect(panel.getByLabel('Prix par pli et par mètre')).toHaveValue('1,05')
    await expect(panel.getByLabel('Palier 3 : remise')).toHaveValue('15')

    // Paliers dans le désordre : refusé, avec une explication
    await panel.getByLabel('Palier 3 : nombre de pièces').fill('30')
    await save.click()
    await expect(panel.getByRole('alert')).toContainText('du plus petit au plus grand')

    // Le journal garde l'ancien et le nouveau prix
    await panel.getByRole('button', { name: 'Annuler les modifications' }).click()
    await adminPage.goto('/journal')
    await adminPage.getByRole('button', { name: 'Catalogue et prix' }).click()
    await expect(adminPage.getByRole('cell', { name: /prix par pli et par mètre 0,90\s€ → 1,05\s€/ }).first()).toBeVisible()

    // Retour aux valeurs de départ pour les autres tests
    const res = await adminPage.request.patch('/api/catalog/settings', {
      data: { prixPliMl: 0.9, remisesQuantite: [{ seuil: 20, remise: 5 }, { seuil: 50, remise: 10 }] },
      headers: { Origin: new URL(adminPage.url()).origin },
    })
    expect(res.status()).toBe(200)
  })

  test('la RH et l’atelier n’ont pas accès au catalogue', async ({ adminPage, browser, baseURL, uid }) => {
    for (const role of ['rh', 'atelier'] as const) {
      const id = `${uid}-${role}`
      const temp = await createUser(adminPage.request, baseURL!, { identifiant: id, nom: `Test ${role}`, role })
      const page = await (await browser.newContext()).newPage()
      await apiLogin(page.request, baseURL!, id, temp)
      await page.request.post('/api/auth/password', { data: { current: temp, next: NEW_PASSWORD }, headers: { Origin: baseURL! } })
      await page.goto('/catalogue')
      await expect(page).toHaveURL('/tableau-de-bord')
      await expect(page.getByRole('link', { name: 'Tarifs et catalogue' })).toHaveCount(0)
      expect((await page.request.get('/api/catalog/materials')).status()).toBe(403)
      expect((await page.request.get('/api/catalog/accessories')).status()).toBe(403)
      expect((await page.request.get('/api/catalog/delivery')).status()).toBe(403)
      await page.context().close()
    }
  })
})
