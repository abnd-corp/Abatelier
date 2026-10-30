import { expect, test } from './fixtures'
import type { Page } from '@playwright/test'

// Connexion à l'espace client avec Google. La pile de test utilise le faux Google : l'identité est donnée dans l'adresse de départ
// (simule=e-mail:prénom:nom), ajoutée ici à la requête du bouton, comme Google la renverrait.
const MOT_DE_PASSE = 'Plieuse-numerique-2026'

async function faireRepondreGoogle(page: Page, identite: string) {
  await page.route('**/api/espace/google/debut*', (route) => route.continue({ url: `${route.request().url()}&simule=${encodeURIComponent(identite)}` }))
}

test.describe('Espace client : connexion avec Google', () => {
  test('un nouveau client crée son espace avec Google en choisissant professionnel, puis s’y reconnecte en un clic', async ({ page, uid }) => {
    const email = `${uid}-google@exemple.fr`
    await faireRepondreGoogle(page, `${email}:Marie:Martin${uid.slice(-4)}`)
    await page.goto('/espace/connexion')
    await page.getByRole('link', { name: 'Continuer avec Google' }).click()

    // Dernière étape : Google a donné le nom et l'adresse, le client dit qui il est
    await expect(page).toHaveURL(/\/espace\/google-inscription/)
    await expect(page.getByRole('heading', { level: 1, name: 'Presque terminé' })).toBeVisible()
    await expect(page.getByText(email)).toBeVisible()
    await page.getByLabel('Un professionnel').check()
    // Sans consentement, puis sans raison sociale : les erreurs s'affichent à côté du champ
    await page.getByRole('button', { name: 'Créer mon espace' }).click()
    await expect(page.getByText('Cochez la case')).toBeVisible()
    await page.getByLabel(/J’accepte que mes données/).check()
    await page.getByRole('button', { name: 'Créer mon espace' }).click()
    await expect(page.getByLabel('Raison sociale *')).toHaveAttribute('aria-invalid', 'true')
    await page.getByLabel('Raison sociale *').fill(`Toitures ${uid.slice(-4)}`)
    await page.getByRole('button', { name: 'Créer mon espace' }).click()

    await expect(page).toHaveURL('/espace')
    await expect(page.getByRole('heading', { level: 1, name: /^Bonjour/ })).toContainText('Martin')

    // Il se déconnecte, puis revient directement dans son espace avec Google (aucune nouvelle question)
    await page.getByRole('button', { name: 'Me déconnecter' }).click()
    await page.goto('/espace/connexion')
    await page.getByRole('link', { name: 'Continuer avec Google' }).click()
    await expect(page).toHaveURL('/espace')
    await expect(page.getByRole('heading', { level: 1, name: /^Bonjour/ })).toContainText('Martin')

    // Pas de mot de passe : la fermeture de l'espace se confirme avec l'adresse e-mail
    await page.getByRole('button', { name: 'Fermer mon espace…' }).click()
    await expect(page.getByLabel('Mot de passe pour confirmer')).toHaveCount(0)
    await page.getByLabel('Votre adresse e-mail, pour confirmer').fill('autre@exemple.fr')
    await page.getByRole('button', { name: 'Fermer définitivement mon espace' }).click()
    await expect(page.getByRole('alert')).toContainText('Adresse e-mail incorrecte')
  })

  test('un client qui a déjà un espace avec mot de passe y entre avec Google, sans doublon, et garde son mot de passe', async ({ browser, baseURL, page, uid }) => {
    const email = `${uid}-deja@exemple.fr`
    const ouverture = await (await browser.newContext()).newPage()
    const res = await ouverture.request.post('/api/espace/inscription', { data: { nom: `Deja${uid.slice(-5)}`, email, password: MOT_DE_PASSE, consentement: true }, headers: { Origin: baseURL! } })
    expect(res.status(), await res.text()).toBe(201)

    await faireRepondreGoogle(page, `${email.toUpperCase()}:Jean:Deja${uid.slice(-5)}`)
    await page.goto('/espace/connexion?redirect=%2Fespace%2Fprofil')
    await page.getByRole('link', { name: 'Continuer avec Google' }).click()
    // Retour sur la page demandée, directement connecté
    await expect(page).toHaveURL('/espace/profil')
    await expect(page.getByRole('heading', { level: 1, name: 'Mes informations' })).toBeVisible()

    // Le mot de passe fonctionne toujours
    const second = await (await browser.newContext()).newPage()
    await second.goto('/espace/connexion')
    await second.getByLabel('Adresse e-mail').fill(email)
    await second.locator('#auth-password').fill(MOT_DE_PASSE)
    await second.getByRole('button', { name: 'Me connecter' }).click()
    await expect(second).toHaveURL('/espace')
  })

  test('un retour de Google qui échoue ramène à la connexion avec un message, sans rien créer', async ({ page }) => {
    // Retour sans être passé par le bouton : aucun état en cookie
    await page.goto('/api/espace/google/retour?code=fake:pirate@exemple.fr&state=abc')
    await expect(page).toHaveURL(/\/espace\/connexion\?google=echec/)
    await expect(page.getByRole('alert')).toContainText('n’a pas abouti')
    await expect(page.getByRole('link', { name: 'Continuer avec Google' })).toBeVisible()
  })
})
