import type { Browser } from '@playwright/test'
import { apiLogin, createUser, expect, NEW_PASSWORD, test } from './fixtures'

// Matériaux : la direction définit les feuilles (matière, coloris, format) et leurs codes-barres, l'atelier les reconnaît au scan
test.describe('Matériaux', () => {
  const connecte = async (browser: Browser, baseURL: string, identifiant: string, temp: string) => {
    const page = await (await browser.newContext()).newPage()
    await apiLogin(page.request, baseURL, identifiant, temp)
    await page.request.post('/api/auth/password', { data: { current: temp, next: NEW_PASSWORD }, headers: { Origin: baseURL } })
    return page
  }

  test('la direction définit une référence et son code-barres, l’atelier la reconnaît à la réception', async ({ adminPage, browser, baseURL, uid }) => {
    const dir = await connecte(
      browser,
      baseURL!,
      `${uid}-d`,
      await createUser(adminPage.request, baseURL!, { identifiant: `${uid}-d`, nom: 'Camille Direction', sections: ['direction'], admin: false }),
    )
    const largeur = 1100 + Math.floor(Math.random() * 900)
    const format = `${largeur.toLocaleString('fr-FR')} × 2 500 mm`
    const code = `MAT${uid
      .replace(/[^a-z0-9]/gi, '')
      .toUpperCase()
      .slice(-12)}`

    // La direction a la page Matériaux, sans les pages de l'atelier
    await dir.goto('/tableau-de-bord')
    const nav = dir.getByRole('navigation', { name: 'Navigation principale' })
    await nav.getByRole('link', { name: 'Matériaux' }).click()
    await expect(dir.getByRole('heading', { level: 1, name: 'Matériaux' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Réception' })).toHaveCount(0)

    // Elle ajoute la référence avec le code de l'emballage
    await dir.getByRole('button', { name: 'Ajouter une référence' }).click()
    await dir.getByLabel('Matière et épaisseur').selectOption({ index: 1 })
    await dir.getByLabel('Coloris').selectOption({ index: 1 })
    await dir.getByLabel('Largeur (mm)').fill(String(largeur))
    await dir.getByLabel('Longueur (mm)').fill('2500')
    await dir.getByLabel('Code-barres du fournisseur').fill(code.toLowerCase())
    await dir.getByRole('button', { name: 'Ajouter la référence' }).click()
    await expect(dir.getByRole('status')).toContainText('Référence ajoutée')
    const ligne = dir.locator('ul.refs > li', { hasText: format })
    await expect(ligne).toContainText('0 en stock')
    await expect(ligne.getByRole('button', { name: /^Codes-barres/ })).toContainText('(1)')

    // Elle retrouve la référence par son code
    await dir.getByLabel('Chercher une référence ou un code').fill(code.toLowerCase())
    await expect(dir.locator('ul.refs > li')).toHaveCount(1)

    // L'atelier scanne (ici : saisit) ce code : la référence est reconnue
    const atelier = await connecte(browser, baseURL!, `${uid}-a`, await createUser(adminPage.request, baseURL!, { identifiant: `${uid}-a`, nom: 'Lucas Atelier', role: 'atelier' }))
    await atelier.goto('/reception')
    await atelier
      .getByRole('button', { name: /à la main/ })
      .click({ timeout: 3000 })
      .catch(() => {})
    await atelier.getByLabel('Code-barres saisi à la main').fill(code)
    await atelier.getByRole('button', { name: 'Chercher' }).click()
    await expect(atelier.getByText('Combien de feuilles reçues')).toBeVisible()
    await expect(atelier.locator('#trouve-titre ~ .ref').getByText(format)).toBeVisible()

    // L'atelier n'a pas la page Matériaux
    await atelier.goto('/materiaux')
    await expect(atelier).toHaveURL('/tableau-de-bord')

    // La direction retire le code, puis archive la référence (aucune feuille en stock) : elle ne se supprime jamais
    await dir.getByLabel('Chercher une référence ou un code').fill('')
    await ligne.getByRole('button', { name: /^Codes-barres/ }).click()
    await ligne.getByRole('button', { name: new RegExp(`Retirer le code ${code}`) }).click()
    await expect(ligne.getByText('Aucun code-barres')).toBeVisible()
    await expect(ligne.getByRole('button', { name: /^Supprimer/ })).toHaveCount(0)
    await ligne.getByRole('button', { name: /^Archiver la référence/ }).click()
    await expect(dir.locator('ul.refs > li', { hasText: format })).toHaveCount(0)

    // Archivée, elle se retrouve dans la liste des archivées, d'où on peut la désarchiver
    await dir.getByRole('button', { name: 'Voir les archivées' }).click()
    await expect(ligne).toBeVisible()
    await ligne.getByRole('button', { name: /^Désarchiver la référence/ }).click()
    await dir.getByRole('button', { name: 'Voir les références en service' }).click()
    await expect(ligne).toBeVisible()
    await dir.context().close()
    await atelier.context().close()
  })

  test('refuse un code déjà pris et une référence incomplète, sans quitter la page', async ({ adminPage, browser, baseURL, uid }) => {
    const dir = await connecte(browser, baseURL!, `${uid}-e`, await createUser(adminPage.request, baseURL!, { identifiant: `${uid}-e`, nom: 'Marie Direction', sections: ['direction'], admin: false }))
    const code = `DBL${uid
      .replace(/[^a-z0-9]/gi, '')
      .toUpperCase()
      .slice(-12)}`
    const options = await (await dir.request.get('/api/stock/options')).json()
    const res = await dir.request.post('/api/stock/feuilles', {
      data: { materialId: options.materials[0].id, colorId: null, largeur: 1000 + Math.floor(Math.random() * 900), longueur: 2200, quantite: 0, code },
      headers: { Origin: baseURL! },
    })
    expect(res.status(), await res.text()).toBe(201)

    await dir.goto('/materiaux')
    await dir.getByRole('button', { name: 'Ajouter une référence' }).click()
    // Sans matière, le bouton reste inactif
    await expect(dir.getByRole('button', { name: 'Ajouter la référence' })).toBeDisabled()
    await dir.getByLabel('Matière et épaisseur').selectOption({ index: 1 })
    await dir.getByLabel('Largeur (mm)').fill('1337')
    await dir.getByLabel('Code-barres du fournisseur').fill(code)
    await dir.getByRole('button', { name: 'Ajouter la référence' }).click()
    await expect(dir.getByText('déjà associé à une autre référence')).toBeVisible()
    await expect(dir.getByRole('button', { name: 'Ajouter la référence' })).toBeVisible()
    await dir.context().close()
  })
})
