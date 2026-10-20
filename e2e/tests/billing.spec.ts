import { apiLogin, createUser, expect, NEW_PASSWORD, test } from './fixtures'

test.describe('Devis et factures', () => {
  test('la direction fait un devis, facture la commande, encaisse puis annule par un avoir', async ({ adminPage: page, baseURL, uid }) => {
    const headers = { Origin: baseURL! }
    const nom = `Fact${uid.slice(-6)}`
    const client = await (await page.request.post('/api/clients', { data: { type: 'particulier', prenom: 'Léa', nom, adresse: '3 rue des Lilas', codePostal: '42490', ville: 'Fraisses' }, headers })).json()

    // Commande saisie à l'écran
    await page.goto(`/commandes/nouvelle?client=${client.id}`)
    await expect(page.getByRole('button', { name: 'Enregistrer la commande' })).toBeEnabled()
    await page.getByRole('button', { name: 'Enregistrer la commande' }).click()
    await expect(page).toHaveURL(/\/commandes\/[0-9a-f-]{36}$/)
    const orderUrl = page.url()
    const commande = (await page.getByRole('heading', { level: 1 }).innerText()).trim()
    const section = page.getByRole('region', { name: 'Devis et factures' })
    await expect(section).toContainText('Aucun devis ni facture')
    await expect(section.getByRole('button', { name: 'Facturer' })).toHaveCount(0)

    // Devis : émis, envoyé, accepté
    await section.getByRole('button', { name: 'Faire un devis' }).click()
    await expect(page).toHaveURL(/\/factures\/[0-9a-f-]{36}$/)
    const devis = (await page.getByRole('heading', { level: 1 }).innerText()).trim()
    expect(devis).toMatch(/^D-\d{4}-\d{4}$/)
    await expect(page.getByRole('navigation', { name: 'Fil d’Ariane' }).getByRole('listitem')).toHaveText(['Ventes', 'Devis et factures', devis])
    await expect(page.getByText(`Léa ${nom}`).first()).toBeVisible()
    const pdfLink = page.getByRole('link', { name: 'Ouvrir le PDF' })
    await expect(pdfLink).toHaveAttribute('target', '_blank')
    const pdf = await page.request.get((await pdfLink.getAttribute('href'))!)
    expect(pdf.headers()['content-type']).toBe('application/pdf')
    expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-')
    await page.getByRole('button', { name: 'Marquer envoyé' }).click()
    await expect(page.getByText('Devis marqué comme envoyé.')).toBeVisible()
    await page.getByRole('button', { name: 'Accepté par le client' }).click()
    await expect(page.getByText('Devis accepté.')).toBeVisible()
    await expect(page.locator('.identity .pill')).toHaveText('Accepté')
    await page.getByRole('link', { name: 'valider la commande' }).click()

    // Facture : une fois la commande validée
    await expect(page).toHaveURL(orderUrl)
    await page.getByRole('button', { name: 'Valider la commande' }).click()
    await expect(page.getByText('Commande passée à l’étape « Validée »')).toBeVisible()
    await expect(section).toContainText(devis)
    await section.getByRole('button', { name: 'Facturer' }).click()
    await expect(page).toHaveURL(/\/factures\/[0-9a-f-]{36}$/)
    const facture = (await page.getByRole('heading', { level: 1 }).innerText()).trim()
    expect(facture).toMatch(/^F-\d{4}-\d{4}$/)
    await expect(page.locator('.identity .pill')).toHaveText('À envoyer')

    // Paiement par chèque, aujourd'hui
    await page.getByRole('button', { name: 'Enregistrer le paiement' }).click()
    await page.getByLabel('Mode').selectOption('cheque')
    await page.getByRole('button', { name: /Enregistrer le paiement de/ }).click()
    await expect(page.getByText('Paiement enregistré.')).toBeVisible()
    await expect(page.locator('.identity .pill')).toHaveText('Payée')
    await expect(page.getByText('Chèque')).toBeVisible()

    // Une commande facturée ne s'annule pas sans avoir
    await page.goto(orderUrl)
    await page.getByRole('button', { name: 'Annuler la commande' }).click()
    await page.getByLabel('Raison de l’annulation').fill('Client parti')
    await page.getByRole('button', { name: 'Confirmer l’annulation' }).click()
    await expect(page.getByText(`La commande est facturée (${facture})`)).toBeVisible()
    await expect(section.getByRole('button', { name: 'Facturer' })).toHaveCount(0)

    // Avoir sur la facture
    await section.getByRole('link', { name: facture }).click()
    await page.getByRole('button', { name: 'Faire un avoir' }).click()
    await expect(page.getByText('pensez à rembourser le client')).toBeVisible()
    await page.getByLabel('Motif de l’avoir').fill('Erreur de coloris')
    await page.getByRole('button', { name: 'Émettre l’avoir' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^A-\d{4}-\d{4}$/)
    const avoir = (await page.getByRole('heading', { level: 1 }).innerText()).trim()
    await expect(page.getByText('Erreur de coloris')).toBeVisible()
    await page.getByRole('link', { name: facture }).click()
    await expect(page.locator('.identity .pill')).toHaveText('Annulée')

    // La commande peut de nouveau être facturée
    await page.goto(orderUrl)
    await expect(section.getByRole('button', { name: 'Facturer' })).toBeVisible()

    // Dans la liste, et au journal
    await page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', { name: 'Devis et factures' }).click()
    await page.getByLabel('Rechercher un document').fill(nom)
    await expect(page.getByRole('link', { name: facture })).toBeVisible()
    await page.getByRole('tab', { name: 'Avoirs' }).click()
    await expect(page.getByRole('link', { name: avoir })).toBeVisible()
    await page.getByRole('tab', { name: 'Devis' }).click()
    await expect(page.getByRole('link', { name: devis })).toBeVisible()
    await page.goto('/journal')
    await page.getByRole('button', { name: 'Devis et factures', exact: true }).click()
    await expect(page.getByRole('cell', { name: new RegExp(`A émis la facture ${facture} pour Léa ${nom} \\(commande ${commande}`) })).toBeVisible()
    await expect(page.getByRole('cell', { name: new RegExp(`A émis l’avoir ${avoir} qui annule la facture ${facture}`) })).toBeVisible()
  })

  test('la RH ne voit ni les devis, ni les factures', async ({ adminPage, browser, baseURL, uid }) => {
    const identifiant = `${uid}-rh`
    const temp = await createUser(adminPage.request, baseURL!, { identifiant, nom: 'Claire RH', role: 'rh' })
    const rh = await (await browser.newContext()).newPage()
    await apiLogin(rh.request, baseURL!, identifiant, temp)
    await rh.request.post('/api/auth/password', { data: { current: temp, next: NEW_PASSWORD }, headers: { Origin: baseURL! } })
    await rh.goto('/tableau-de-bord')
    await expect(rh.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', { name: 'Devis et factures' })).toHaveCount(0)
    await rh.goto('/factures')
    await expect(rh).toHaveURL('/tableau-de-bord')
    expect((await rh.request.get('/api/billing')).status()).toBe(403)
    await rh.context().close()
  })
})
