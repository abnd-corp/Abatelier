import { apiLogin, createUser, expect, NEW_PASSWORD, test } from './fixtures'
import type { APIRequestContext } from '@playwright/test'

async function addClient(request: APIRequestContext, baseURL: string, data: Record<string, unknown>) {
  const res = await request.post('/api/clients', { data, headers: { Origin: baseURL } })
  expect(res.status(), await res.text()).toBe(201)
  return (await res.json()).id as string
}

test.describe('Commandes', () => {
  test('la direction saisit une commande, l’atelier la fabrique sans voir le client', async ({ adminPage, browser, baseURL, uid }) => {
    const raison = `Toitures ${uid}`
    const clientId = await addClient(adminPage.request, baseURL!, { type: 'professionnel', raisonSociale: raison, adresse: '8 avenue de la Gare', codePostal: '42700', ville: 'Firminy' })

    // Depuis la fiche client
    await adminPage.goto(`/clients/${clientId}`)
    await adminPage.getByRole('link', { name: 'Nouvelle commande' }).click()
    await expect(adminPage).toHaveURL(`/commandes/nouvelle?client=${clientId}`)
    await expect(adminPage.getByText(`Client : ${raison}`)).toBeVisible()

    const piece = adminPage.getByRole('region', { name: 'Pièce 1' })
    await piece.getByLabel('Repère').fill('Mur sud')
    await piece.getByLabel('Quantité').fill('6')
    // Cote trop courte : signalée par le chiffrage en direct
    await piece.locator('#l0-cote0').fill('3')
    await expect(piece.getByRole('alert')).toContainText('Cote A')
    await expect(adminPage.getByRole('button', { name: 'Enregistrer la commande' })).toBeDisabled()
    await piece.locator('#l0-cote0').fill('20')
    await expect(piece.getByRole('alert')).toHaveCount(0)
    await expect(piece.locator('.line-price')).toContainText('HT')

    // Livraison à l'adresse de facturation
    await adminPage.getByLabel('Livraison sur chantier').check()
    await expect(adminPage.getByLabel('Ville')).toHaveValue('Firminy')
    const summary = adminPage.getByRole('complementary', { name: 'Montant de la commande' })
    await expect(summary).toContainText('Remise pro')
    await expect(summary).toContainText('Total TTC')
    await expect(adminPage.getByText(/km de l’atelier par la route/)).toBeVisible()
    await adminPage.getByRole('button', { name: 'Enregistrer la commande' }).click()

    // Fiche de la commande
    await expect(adminPage).toHaveURL(/\/commandes\/[0-9a-f-]{36}$/)
    const numero = (await adminPage.getByRole('heading', { level: 1 }).innerText()).trim()
    expect(numero).toMatch(/^C-\d{4}-\d{4}$/)
    await expect(adminPage.getByRole('navigation', { name: 'Fil d’Ariane' }).getByRole('listitem')).toHaveText(['Ventes', 'Commandes', numero])
    await expect(adminPage.getByText('6 × 3 000 mm')).toBeVisible()
    await adminPage.getByRole('button', { name: 'Valider la commande' }).click()
    await expect(adminPage.getByText('Commande passée à l’étape « Validée »')).toBeVisible()
    await expect(adminPage.getByText(/Prévue le/)).toBeVisible()
    await expect(adminPage.getByRole('button', { name: 'Modifier les pièces' })).toHaveCount(0)

    // L'atelier : la commande, jamais le client
    const identifiant = `${uid}-at`
    const temp = await createUser(adminPage.request, baseURL!, { identifiant, nom: 'Plieur Test', role: 'atelier' })
    const atelier = await (await browser.newContext()).newPage()
    await apiLogin(atelier.request, baseURL!, identifiant, temp)
    await atelier.request.post('/api/auth/password', { data: { current: temp, next: NEW_PASSWORD }, headers: { Origin: baseURL! } })
    await atelier.goto('/tableau-de-bord')
    const nav = atelier.getByRole('navigation', { name: 'Navigation principale' })
    await expect(nav.getByRole('link')).toHaveText(['Tableau de bord', 'Fabrication'])
    await nav.getByRole('link', { name: 'Fabrication' }).click()
    await atelier.getByRole('link', { name: numero, exact: true }).click()
    await expect(atelier.getByRole('heading', { level: 1 })).toHaveText(numero)
    await expect(atelier.getByText('6 × 3 000 mm')).toBeVisible()
    await expect(atelier.getByText(raison)).toHaveCount(0)
    await expect(atelier.getByText('Firminy')).toHaveCount(0)
    await expect(atelier.getByText(/€/)).toHaveCount(0)
    await atelier.getByRole('button', { name: 'Lancer la fabrication' }).click()
    await expect(atelier.getByText('Commande passée à l’étape « En fabrication »')).toBeVisible()
    // Fiche imprimable : un PDF ouvert dans un nouvel onglet, sans le client
    const fiche = atelier.getByRole('link', { name: 'Imprimer la fiche' })
    await expect(fiche).toHaveAttribute('target', '_blank')
    const pdf = await atelier.request.get((await fiche.getAttribute('href'))!)
    expect(pdf.status()).toBe(200)
    expect(pdf.headers()['content-type']).toBe('application/pdf')
    expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-')
    await atelier.getByRole('button', { name: 'Marquer prête' }).click()
    await expect(atelier.getByText('Commande passée à l’étape « Prête »')).toBeVisible()
    // Pas d'accès aux commandes ni aux clients, même en tapant l'adresse
    for (const path of ['/commandes', `/clients/${clientId}`]) {
      await atelier.goto(path)
      await expect(atelier).toHaveURL('/tableau-de-bord')
    }
    await atelier.context().close()

    // La direction voit les étapes faites par l'atelier, puis livre
    await adminPage.reload()
    await expect(adminPage.getByRole('region', { name: 'Suivi' })).toContainText('Plieur Test')
    await adminPage.getByRole('button', { name: 'Marquer livrée / retirée' }).click()
    await expect(adminPage.getByText('Commande passée à l’étape « Livrée / retirée »')).toBeVisible()

    // Sur la fiche client, et au journal
    await adminPage.goto(`/clients/${clientId}`)
    await expect(adminPage.getByRole('region', { name: 'Commandes' })).toContainText(numero)
    await expect(adminPage.getByRole('region', { name: 'Commandes' })).toContainText('Total dépensé')
    await adminPage.goto('/journal')
    await adminPage.getByRole('button', { name: 'Commandes', exact: true }).click()
    await expect(adminPage.getByRole('cell', { name: `A passé la commande ${numero} à « Livrée / retirée »` })).toBeVisible()
    await expect(adminPage.getByRole('cell', { name: new RegExp(`A enregistré la commande ${numero} de ${raison}`) })).toBeVisible()
    await expect(adminPage.getByRole('cell', { name: `A imprimé la fiche de fabrication de la commande ${numero}` })).toBeVisible()
  })

  test('une commande annulée garde sa raison', async ({ adminPage, baseURL, uid }) => {
    const clientId = await addClient(adminPage.request, baseURL!, { type: 'particulier', nom: `Annule${uid.slice(-4)}` })
    await adminPage.goto(`/commandes/nouvelle?client=${clientId}`)
    await expect(adminPage.getByRole('button', { name: 'Enregistrer la commande' })).toBeEnabled()
    await adminPage.getByRole('button', { name: 'Enregistrer la commande' }).click()
    await expect(adminPage).toHaveURL(/\/commandes\/[0-9a-f-]{36}$/)
    await adminPage.getByRole('button', { name: 'Annuler la commande' }).click()
    await adminPage.getByLabel('Raison de l’annulation').fill('Doublon')
    await adminPage.getByRole('button', { name: 'Confirmer l’annulation' }).click()
    await expect(adminPage.getByText('Commande annulée.')).toBeVisible()
    await expect(adminPage.getByText(/Annulée le .*: Doublon/)).toBeVisible()
    await adminPage.goto('/commandes?filtre=annulee')
    await expect(adminPage.getByRole('cell', { name: new RegExp(`Annule${uid.slice(-4)}`) })).toBeVisible()
  })
})
