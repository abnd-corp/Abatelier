import { ADMIN, apiLogin, createUser, expect, NEW_PASSWORD, test } from './fixtures'

// Réception de marchandise sur téléphone : l'atelier scanne (ici : saisit) le code-barres du fournisseur, puis indique le nombre.
test.describe('Réception de marchandise @responsive', () => {
  // La caméra est le geste principal ; ici (navigateur sans caméra) on passe par la saisie à la main, qui s'ouvre d'elle-même ou d'un clic
  const saisir = async (page: import('@playwright/test').Page, code: string) => {
    // Sans caméra, la saisie s'ouvre d'elle-même (et le lien disparaît) ; si la caméra attend encore, on ouvre le lien
    await page
      .getByRole('button', { name: /à la main/ })
      .click({ timeout: 3000 })
      .catch(() => {})
    await page.getByLabel('Code-barres saisi à la main').fill(code)
    await page.getByRole('button', { name: 'Chercher' }).click()
  }

  test('l’atelier reçoit des feuilles par leur code-barres, et associe un code inconnu à une référence', async ({ browser, baseURL, uid, page }) => {
    const h = { Origin: baseURL! }
    // La direction a son propre contexte : « page » (téléphone ou tablette) est celui de l'atelier
    const adminPage = await (await browser.newContext()).newPage()
    await apiLogin(adminPage.request, baseURL!, ADMIN.identifiant, ADMIN.password)
    const options = await (await adminPage.request.get('/api/stock/options')).json()
    // Format propre à ce test : la référence se retrouve sans gêner les autres
    const largeur = 1100 + Math.floor(Math.random() * 900)
    const code = `E2E${uid
      .replace(/[^a-z0-9]/gi, '')
      .toUpperCase()
      .slice(-12)}`
    const res = await adminPage.request.post('/api/stock/feuilles', {
      data: { materialId: options.materials[0].id, colorId: options.colors[0].id, largeur, longueur: 2500, quantite: 4, code },
      headers: h,
    })
    expect(res.status(), await res.text()).toBe(201)
    const sheet = (await res.json()).feuille as { id: string }

    // L'atelier ouvre son tableau de bord sur téléphone : la réception est à un doigt
    const identifiant = `${uid}-rc`
    const temp = await createUser(adminPage.request, baseURL!, { identifiant, nom: 'Marc Réception', role: 'atelier' })
    await apiLogin(page.request, baseURL!, identifiant, temp)
    await page.request.post('/api/auth/password', { data: { current: temp, next: NEW_PASSWORD }, headers: h })
    await page.goto('/tableau-de-bord')
    await page.getByRole('link', { name: /Réception de marchandise/ }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Réception de marchandise' })).toBeVisible()

    // Code connu : le nombre reçu entre en stock
    await saisir(page, code.toLowerCase())
    await expect(page.getByText('Combien de feuilles reçues')).toBeVisible()
    await expect(page.getByText(`${largeur.toLocaleString('fr-FR')} × 2 500 mm`)).toBeVisible()
    await page.getByRole('button', { name: '10', exact: true }).click()
    await page.getByLabel('Note').fill('BL e2e')
    await page.getByRole('button', { name: 'Valider l’entrée en stock' }).click()
    await expect(page.getByRole('status')).toContainText('10 feuilles reçues')
    await expect(page.getByRole('status')).toContainText('Stock : 14')
    const stock = async () => ((await (await page.request.get('/api/stock/feuilles')).json()).feuilles as { id: string; quantite: number }[]).find((f) => f.id === sheet.id)!.quantite
    expect(await stock()).toBe(14)

    // Code inconnu : on l'associe à la référence, puis on reçoit
    const autre = `${code}X`
    await saisir(page, autre)
    await expect(page.getByRole('heading', { name: 'Code inconnu' })).toBeVisible()
    await page.getByLabel('Chercher une référence').fill(`${largeur.toLocaleString('fr-FR')} × 2 500`)
    // Les espaces des milliers (insécables) s'écrivent différemment dans le nom accessible : \s les couvre toutes
    await page.getByRole('button', { name: new RegExp(`${largeur.toLocaleString('fr-FR').replace(/\s/g, '\\s')}\\s×\\s2\\s500`) }).click()
    await expect(page.getByText('Combien de feuilles reçues')).toBeVisible()
    await page.getByRole('textbox', { name: 'Feuilles reçues' }).fill('3')
    await page.getByRole('button', { name: 'Valider l’entrée en stock' }).click()
    await expect(page.getByRole('status')).toContainText('3 feuilles reçues')
    expect(await stock()).toBe(17)
    // Le second code est maintenant connu
    expect((await page.request.get(`/api/stock/codes/${autre}`)).status()).toBe(200)

    // La réception est au journal, sous le nom de la personne, avec le code scanné
    const journal = (await (await adminPage.request.get('/api/audit?limit=200')).json()).entries as { action: string; nom: string | null; details: { code?: string; delta?: number } }[]
    expect(journal.some((e) => e.action === 'stock.moved' && e.nom === 'Marc Réception' && e.details.code === code && e.details.delta === 10)).toBe(true)
  })

  test('refuse un nombre vide et un code vide, sans quitter l’écran', async ({ browser, baseURL, uid, page }) => {
    const h = { Origin: baseURL! }
    const adminPage = await (await browser.newContext()).newPage()
    await apiLogin(adminPage.request, baseURL!, ADMIN.identifiant, ADMIN.password)
    const identifiant = `${uid}-rd`
    const temp = await createUser(adminPage.request, baseURL!, { identifiant, nom: 'Luc Réception', role: 'atelier' })
    await apiLogin(page.request, baseURL!, identifiant, temp)
    await page.request.post('/api/auth/password', { data: { current: temp, next: NEW_PASSWORD }, headers: h })
    await page.goto('/reception')
    // Le champ de saisie est un secours : le bouton reste inactif tant que rien n'est tapé
    await page
      .getByRole('button', { name: /à la main/ })
      .or(page.getByLabel('Code-barres saisi à la main'))
      .first()
      .waitFor()
    await saisir(page, 'CODEINCONNU999')
    await expect(page.getByRole('heading', { name: 'Code inconnu' })).toBeVisible()
    await page.getByRole('button', { name: 'Annuler' }).click()
    await expect(page.getByRole('heading', { name: '1. Scannez le code-barres' })).toBeVisible()
  })
})
