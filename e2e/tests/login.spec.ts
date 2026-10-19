import { ADMIN, expect, test, uiLogin } from './fixtures'

test.describe('Page de connexion', () => {
  test('protège l’application et garde la page demandée', async ({ page }) => {
    await page.goto('/mon-compte')
    await expect(page).toHaveURL(/\/connexion\?redirect=(%2F|\/)mon-compte$/)
    await expect(page).toHaveTitle('Connexion · Atelier · Alu Pliage Service')
    await expect(page.getByRole('img', { name: 'Alu Pliage Service' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible()
  })

  test('l’œil affiche et masque le mot de passe', async ({ page }) => {
    await page.goto('/connexion')
    const field = page.getByLabel('Mot de passe', { exact: true })
    await field.fill('secret')
    await expect(field).toHaveAttribute('type', 'password')
    await page.getByRole('button', { name: 'Afficher le mot de passe' }).click()
    await expect(field).toHaveAttribute('type', 'text')
    await page.getByRole('button', { name: 'Masquer le mot de passe' }).click()
    await expect(field).toHaveAttribute('type', 'password')
  })

  test('affiche une erreur pour de mauvais identifiants', async ({ page, uid }) => {
    await uiLogin(page, uid, 'mauvais-mot-de-passe')
    await expect(page.getByRole('alert')).toHaveText('Identifiant ou mot de passe incorrect.')
    await expect(page.getByLabel('Mot de passe', { exact: true })).toHaveValue('')
    await expect(page).toHaveURL(/\/connexion/)
  })

  test('bloque l’identifiant après 5 échecs', async ({ page, uid }) => {
    await page.goto('/connexion')
    await page.getByLabel('Identifiant').fill(uid)
    for (let i = 0; i < 5; i++) {
      await page.getByLabel('Mot de passe', { exact: true }).fill('faux')
      await page.getByRole('button', { name: 'Se connecter' }).click()
      await expect(page.getByRole('alert')).toBeVisible()
    }
    await expect(page.getByRole('alert')).toContainText('Trop d’essais pour cet identifiant')
  })

  test('connecte, garde la session au rechargement, puis déconnecte', async ({ page }) => {
    await uiLogin(page, ADMIN.identifiant, ADMIN.password)
    await expect(page).toHaveURL('/')
    await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible()

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible()

    await page.getByRole('button', { name: 'Se déconnecter' }).click()
    await expect(page).toHaveURL('/connexion')
    await page.goto('/')
    await expect(page).toHaveURL(/\/connexion/)
  })

  test('revient sur la page demandée après connexion', async ({ page }) => {
    await page.goto('/journal')
    await page.getByLabel('Identifiant').fill(ADMIN.identifiant)
    await page.getByLabel('Mot de passe', { exact: true }).fill(ADMIN.password)
    await page.getByRole('button', { name: 'Se connecter' }).click()
    await expect(page).toHaveURL('/journal')
    await expect(page.getByRole('heading', { name: 'Journal d’activité' })).toBeVisible()
  })
})
