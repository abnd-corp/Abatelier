import { apiLogin, createUser, expect, mailPart, NEW_PASSWORD, test, waitForMail } from './fixtures'

test.describe('Devis et factures', () => {
  test('la direction fait un devis, facture la commande, encaisse puis annule par un avoir', async ({ adminPage: page, baseURL, uid }) => {
    const headers = { Origin: baseURL! }
    const nom = `Fact${uid.slice(-6)}`
    const client = await (
      await page.request.post('/api/clients', { data: { type: 'particulier', prenom: 'Léa', nom, adresse: '3 rue des Lilas', codePostal: '42490', ville: 'Fraisses' }, headers })
    ).json()

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
    // Le devis accepté devient une commande validée d'un clic, sans passer par la fiche de la commande
    await page.getByRole('button', { name: 'Valider la commande' }).click()
    await expect(page.getByText('Commande validée : elle est chez l’atelier.')).toBeVisible()

    // Facture : une fois la commande validée
    await page.goto(orderUrl)
    await expect(page.getByRole('button', { name: 'Valider la commande' })).toHaveCount(0)
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

  test('la direction envoie la facture au client par e-mail, avec le PDF en pièce jointe', async ({ adminPage: page, baseURL, uid }) => {
    const headers = { Origin: baseURL! }
    const nom = `Mail${uid.slice(-6)}`
    const email = `${uid}@exemple.fr`
    const client = await (
      await page.request.post('/api/clients', { data: { type: 'particulier', prenom: 'Léa', nom, email, adresse: '3 rue des Lilas', codePostal: '42490', ville: 'Fraisses' }, headers })
    ).json()
    const cat = await (await page.request.get('/api/orders/catalog')).json()
    const m = cat.models[0]
    const ligne = { modelId: m.id, materialId: cat.materials[0].id, colorId: cat.colors[0].id, cotes: m.cotes, angles: m.angles, longueur: 2000, quantite: 3, accessoires: [] }
    const order = await (await page.request.post('/api/orders', { data: { clientId: client.id, lignes: [ligne], livraison: { mode: 'retrait' } }, headers })).json()
    await page.request.post(`/api/orders/${order.id}/status`, { data: { statut: 'validee' }, headers })
    const facture = await (await page.request.post(`/api/billing/orders/${order.id}/facture`, { headers })).json()

    await page.goto(`/factures/${facture.id}`)
    await expect(page.getByText('À envoyer')).toBeVisible()
    await page.getByRole('button', { name: 'Envoyer par e-mail' }).click()
    // Message prêt : adresse du client, numéro de facture, montant
    await expect(page.getByLabel('Destinataire(s)')).toHaveValue(email)
    await expect(page.getByLabel('Objet')).toHaveValue(new RegExp(`Facture ${facture.numero}`))
    await expect(page.getByLabel('Message')).toHaveValue(new RegExp(`Bonjour Léa ${nom}`))
    // Adresse invalide : message clair sous le champ, rien n'est envoyé
    await page.getByLabel('Destinataire(s)').fill('pas-un-mail')
    await page.getByRole('button', { name: 'Envoyer', exact: true }).click()
    await expect(page.getByText('Adresse e-mail invalide.')).toBeVisible()
    await page.getByLabel('Destinataire(s)').fill(email)
    await page.getByLabel('Objet').fill(`Facture ${facture.numero} pour ${uid}`)
    await page.getByRole('button', { name: 'Envoyer', exact: true }).click()
    await expect(page.getByText('E-mail envoyé avec le PDF en pièce jointe.')).toBeVisible()
    await expect(page.getByText('Envoyée').first()).toBeVisible()

    // Le message est arrivé, avec la facture en PDF
    const mail = await waitForMail(page.request, uid)
    expect(mail.To.map((a) => a.Address)).toEqual([email])
    expect(mail.Attachments).toHaveLength(1)
    expect(mail.Attachments[0]).toMatchObject({ FileName: `${facture.numero}.pdf`, ContentType: 'application/pdf' })
    expect((await mailPart(page.request, mail, mail.Attachments[0]!.PartID)).subarray(0, 5).toString()).toBe('%PDF-')

    await page.goto('/journal')
    await page.getByRole('button', { name: 'Devis et factures', exact: true }).click()
    await expect(page.getByRole('cell', { name: new RegExp(`A envoyé par e-mail la facture ${facture.numero} à Léa ${nom}`) })).toBeVisible()
  })

  test('la facture est électronique : avertissement avant de facturer, PDF/A-3 et XML Factur-X après', async ({ adminPage: page, baseURL, uid }) => {
    const headers = { Origin: baseURL! }
    const raison = `Elec${uid.slice(-6)}`
    // Professionnel sans adresse e-mail : la règle française demande celle de l'acheteur
    const client = await (
      await page.request.post('/api/clients', {
        data: { type: 'professionnel', raisonSociale: raison, siret: '732 829 320 00074', adresse: '8 avenue de la Gare', codePostal: '42700', ville: 'Firminy' },
        headers,
      })
    ).json()
    const cat = await (await page.request.get('/api/orders/catalog')).json()
    const m = cat.models[0]
    const ligne = { modelId: m.id, materialId: cat.materials[0].id, colorId: cat.colors[0].id, cotes: m.cotes, angles: m.angles, longueur: 2000, quantite: 3, accessoires: [] }
    const order = await (await page.request.post('/api/orders', { data: { clientId: client.id, lignes: [ligne], livraison: { mode: 'retrait' } }, headers })).json()
    await page.request.post(`/api/orders/${order.id}/status`, { data: { statut: 'validee' }, headers })

    await page.goto(`/commandes/${order.id}`)
    const section = page.getByRole('region', { name: 'Devis et factures' })
    await expect(section.getByText('l’adresse e-mail du client')).toBeVisible()
    await section.getByRole('button', { name: 'Facturer' }).click()
    await expect(page).toHaveURL(/\/factures\/[0-9a-f-]{36}$/)
    const numero = (await page.getByRole('heading', { level: 1 }).innerText()).trim()

    const pdf = await page.request.get((await page.getByRole('link', { name: 'Ouvrir le PDF' }).getAttribute('href'))!)
    expect((await pdf.body()).subarray(0, 8).toString()).toContain('%PDF-1.7')
    const href = await page.getByRole('link', { name: 'XML Factur-X' }).getAttribute('href')
    const xml = await page.request.get(href!)
    expect(xml.headers()['content-disposition']).toBe(`attachment; filename="${numero}.xml"`)
    const text = await xml.text()
    expect(text).toContain('urn:cen.eu:en16931:2017')
    expect(text).toContain(`<ram:ID>${numero}</ram:ID>`)
    expect(text).toContain(raison)
    expect(text).toContain('<ram:ID schemeID="0002">732829320</ram:ID>')
  })

  test('un devis signé sur papier : un seul clic l’accepte et valide la commande', async ({ adminPage: page, baseURL, uid }) => {
    const headers = { Origin: baseURL! }
    const client = await (
      await page.request.post('/api/clients', {
        data: { type: 'particulier', prenom: 'Léa', nom: `Papier${uid.slice(-6)}`, adresse: '3 rue des Lilas', codePostal: '42490', ville: 'Fraisses' },
        headers,
      })
    ).json()
    const cat = await (await page.request.get('/api/orders/catalog')).json()
    const m = cat.models[0]
    const ligne = { modelId: m.id, materialId: cat.materials[0].id, colorId: cat.colors[0].id, cotes: m.cotes, angles: m.angles, longueur: 2000, quantite: 2, accessoires: [] }
    const order = await (await page.request.post('/api/orders', { data: { clientId: client.id, lignes: [ligne], livraison: { mode: 'retrait' } }, headers })).json()
    const devis = await (await page.request.post(`/api/billing/orders/${order.id}/devis`, { headers })).json()

    await page.goto(`/factures/${devis.id}`)
    await page.getByRole('button', { name: 'Accepté : valider la commande' }).click()
    await expect(page.getByText('Devis accepté et commande validée : elle est chez l’atelier.')).toBeVisible()
    await expect(page.locator('.identity .pill')).toHaveText('Accepté')
    await expect(page.getByRole('button', { name: /valider la commande/i })).toHaveCount(0)
    await page.goto(`/commandes/${order.id}`)
    await expect(page.locator('.identity .pill')).toContainText('Validée')
  })

  test('la direction annule un paiement enregistré par erreur', async ({ adminPage: page, baseURL, uid }) => {
    const headers = { Origin: baseURL! }
    const client = await (
      await page.request.post('/api/clients', {
        data: { type: 'particulier', prenom: 'Léa', nom: `Annul${uid.slice(-6)}`, adresse: '3 rue des Lilas', codePostal: '42490', ville: 'Fraisses' },
        headers,
      })
    ).json()
    const cat = await (await page.request.get('/api/orders/catalog')).json()
    const m = cat.models[0]
    const ligne = { modelId: m.id, materialId: cat.materials[0].id, colorId: cat.colors[0].id, cotes: m.cotes, angles: m.angles, longueur: 2000, quantite: 1, accessoires: [] }
    const order = await (await page.request.post('/api/orders', { data: { clientId: client.id, lignes: [ligne], livraison: { mode: 'retrait' } }, headers })).json()
    await page.request.post(`/api/orders/${order.id}/status`, { data: { statut: 'validee' }, headers })
    const facture = await (await page.request.post(`/api/billing/orders/${order.id}/facture`, { headers })).json()
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date())
    await page.request.post(`/api/billing/${facture.id}/paiement`, { data: { date: today, mode: 'virement' }, headers })

    await page.goto(`/factures/${facture.id}`)
    await expect(page.locator('.identity .pill')).toHaveText('Payée')
    await page.getByRole('button', { name: 'Annuler le paiement' }).click()
    await expect(page.getByText('Paiement annulé.')).toBeVisible()
    await expect(page.locator('.identity .pill')).not.toHaveText('Payée')
    await expect(page.getByRole('button', { name: 'Enregistrer le paiement' })).toBeVisible()
  })

  test('la direction exporte les ventes et les encaissements en CSV pour son comptable', async ({ adminPage: page, baseURL, uid }) => {
    const headers = { Origin: baseURL! }
    const nom = `Export${uid.slice(-6)}`
    const client = await (
      await page.request.post('/api/clients', { data: { type: 'particulier', prenom: 'Léa', nom, adresse: '3 rue des Lilas', codePostal: '42490', ville: 'Fraisses' }, headers })
    ).json()
    const cat = await (await page.request.get('/api/orders/catalog')).json()
    const m = cat.models[0]
    const ligne = { modelId: m.id, materialId: cat.materials[0].id, colorId: cat.colors[0].id, cotes: m.cotes, angles: m.angles, longueur: 2000, quantite: 3, accessoires: [] }
    const order = await (await page.request.post('/api/orders', { data: { clientId: client.id, lignes: [ligne], livraison: { mode: 'retrait' } }, headers })).json()
    await page.request.post(`/api/orders/${order.id}/status`, { data: { statut: 'validee' }, headers })
    const facture = await (await page.request.post(`/api/billing/orders/${order.id}/facture`, { headers })).json()
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date())
    await page.request.post(`/api/billing/${facture.id}/paiement`, { data: { date: today, mode: 'virement' }, headers })

    await page.goto('/factures')
    await page.getByText('Exporter pour le comptable').click()
    await page.getByLabel('Du', { exact: true }).fill(today)
    await page.getByLabel('Au', { exact: true }).fill(today)

    const download = async () => {
      const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Télécharger le CSV' }).click()])
      const path = await file.path()
      const { readFileSync } = await import('node:fs')
      return { name: file.suggestedFilename(), text: readFileSync(path, 'utf8') }
    }
    const ventes = await download()
    expect(ventes.name).toBe(`ventes-${today}_${today}.csv`)
    expect(ventes.text.charCodeAt(0)).toBe(0xfeff)
    expect(ventes.text).toContain(`${facture.numero};`)
    expect(ventes.text).toContain(nom)
    expect(ventes.text.split('\r\n')[0]).toContain('Total HT;Taux de TVA (%);TVA;Total TTC')

    await page.getByLabel('Contenu').selectOption('encaissements')
    const enc = await download()
    expect(enc.name).toBe(`encaissements-${today}_${today}.csv`)
    expect(enc.text).toContain(`Virement;${facture.numero};`)

    // Période incohérente : message clair, pas de fichier
    await page.getByLabel('Du', { exact: true }).fill('2030-01-01')
    await page.getByRole('button', { name: 'Télécharger le CSV' }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'après la date de début' })).toBeVisible()

    // Tracé dans le journal
    await page.goto('/journal')
    await page.getByRole('button', { name: 'Devis et factures', exact: true }).click()
    await expect(page.getByRole('cell', { name: /A exporté les encaissements du .* pour le comptable/ }).first()).toBeVisible()
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
