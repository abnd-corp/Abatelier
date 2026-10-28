import { ADMIN, apiLogin, createUser, expect, NEW_PASSWORD, test } from './fixtures'

// Une histoire complète, du devis du client à sa facture payée : chaque étape est vue des deux côtés.
const PASSWORD = 'Plieuse-numerique-2026'

test.describe('Parcours complet : devis, commande, fabrication, facture, paiement', () => {
  test('le client accepte son devis, l’atelier fabrique, la direction facture et encaisse, le client télécharge sa facture', async ({ browser, baseURL, uid }) => {
    const h = { Origin: baseURL! }
    const admin = await (await browser.newContext()).newPage()
    await apiLogin(admin.request, baseURL!, ADMIN.identifiant, ADMIN.password)

    // 1. Le client crée son espace et demande un devis (les pièces viennent du catalogue)
    const client = await (await browser.newContext()).newPage()
    const nom = `Parcours ${uid.slice(-6)}`
    const signup = await client.request.post('/api/espace/inscription', { data: { nom, email: `${uid}@exemple.fr`, password: PASSWORD, consentement: true }, headers: h })
    expect(signup.status(), await signup.text()).toBe(201)
    const cat = await (await client.request.get('/api/orders/catalog').then((r) => (r.ok() ? r : admin.request.get('/api/orders/catalog')))).json()
    const m = cat.models[0]
    const ligne = { modelId: m.id, materialId: cat.materials[0].id, colorId: cat.colors[0].id, cotes: m.cotes, angles: m.angles, longueur: 2000, quantite: 3, accessoires: [] }
    const demande = await client.request.post('/api/espace/devis', { data: { lignes: [ligne], livraison: { mode: 'retrait' } }, headers: h })
    expect(demande.status(), await demande.text()).toBe(201)
    const commande = await demande.json()

    // 2. Il retrouve son devis dans son espace et l'accepte
    await client.goto(`/espace/commandes/${commande.id}`)
    const numero = (await client.getByRole('heading', { level: 1 }).innerText()).match(/C-\d{4}-\d{4}/)![0]
    await expect(client.getByRole('link', { name: /Télécharger le devis/ })).toBeVisible()
    await client.getByRole('button', { name: 'Accepter le devis' }).click()
    await expect(client.getByText('Votre accord est transmis à l’atelier')).toBeVisible()

    // 3. La direction voit le devis accepté et valide la commande
    await admin.goto(`/commandes/${commande.id}`)
    await expect(admin.getByRole('region', { name: 'Devis et factures' })).toContainText('Accepté')
    await admin.getByRole('button', { name: 'Valider la commande' }).click()
    await expect(admin.getByText('Commande passée à l’étape « Validée »')).toBeVisible()
    await client.reload()
    await expect(client.getByRole('region', { name: 'Suivi de la commande' }).locator('li[aria-current="step"]')).toContainText('Commande validée')

    // 4. L'atelier fabrique, puis livre
    const identifiant = `${uid}-at`
    const temp = await createUser(admin.request, baseURL!, { identifiant, nom: 'Plieur Parcours', role: 'atelier' })
    const atelier = await (await browser.newContext()).newPage()
    await apiLogin(atelier.request, baseURL!, identifiant, temp)
    await atelier.request.post('/api/auth/password', { data: { current: temp, next: NEW_PASSWORD }, headers: h })
    await atelier.goto('/fabrication')
    const carte = atelier.getByRole('article').filter({ hasText: numero })
    await carte.getByRole('button', { name: 'Lancer la fabrication' }).click()
    // L'étape se lit à la colonne, plus sur la carte
    const etape = () => atelier.locator('.etape').filter({ has: carte }).getByRole('heading', { level: 2 })
    await expect(etape()).toContainText('En fabrication')
    await carte.getByRole('button', { name: 'Marquer prête' }).click()
    await expect(etape()).toContainText('Prête')
    await carte.getByRole('button', { name: 'Marquer retirée' }).click()
    await expect(atelier.getByRole('article').filter({ hasText: numero })).toHaveCount(0)

    // 5. La direction facture et encaisse
    await admin.reload()
    await admin.getByRole('button', { name: 'Facturer' }).click()
    await expect(admin).toHaveURL(/\/factures\/[0-9a-f-]{36}$/)
    const facture = (await admin.getByRole('heading', { level: 1 }).innerText()).trim()
    expect(facture).toMatch(/^F-\d{4}-\d{4}$/)
    await admin.getByRole('button', { name: 'Enregistrer le paiement' }).click()
    await admin.getByLabel('Mode').selectOption('virement')
    await admin.getByRole('button', { name: /Enregistrer le paiement de/ }).click()
    await expect(admin.getByText('Paiement enregistré.')).toBeVisible()
    await expect(admin.locator('.identity .pill')).toHaveText('Payée')

    // 6. Le client voit sa facture payée et en télécharge le PDF
    await client.reload()
    const factures = client.getByRole('region', { name: 'Factures' })
    await expect(factures).toContainText(facture)
    await expect(factures).toContainText('Facture payée')
    const pdf = await client.request.get((await factures.getByRole('link', { name: 'PDF' }).getAttribute('href'))!)
    expect(pdf.status()).toBe(200)
    expect(pdf.headers()['content-type']).toBe('application/pdf')
    expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-')

    // 7. Un autre client n'y a jamais accès
    const autre = await (await browser.newContext()).newPage()
    expect((await autre.request.post('/api/espace/inscription', { data: { nom: 'Autre', email: `autre-${uid}@exemple.fr`, password: PASSWORD, consentement: true }, headers: h })).status()).toBe(201)
    expect((await autre.request.get(`/api/espace/commandes/${commande.id}`)).status()).toBe(404)
  })
})
