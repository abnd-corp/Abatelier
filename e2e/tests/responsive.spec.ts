import type { Page } from '@playwright/test'
import { ADMIN, expect, test, uiLogin } from './fixtures'

// Tourne sur ordinateur (Chromium, Firefox), téléphone et tablette : voir playwright.config.ts

const PAGES = [
  { path: '/', heading: /^Bonjour/ },
  { path: '/salaries', heading: 'Salariés' },
  { path: '/salaries/nouveau', heading: 'Nouveau salarié' },
  { path: '/utilisateurs', heading: 'Comptes' },
  { path: '/journal', heading: 'Journal d’activité' },
  { path: '/catalogue', heading: 'Tarifs et catalogue' },
  { path: '/catalogue?onglet=coloris', heading: 'Tarifs et catalogue' },
  { path: '/catalogue?onglet=accessoires', heading: 'Tarifs et catalogue' },
  { path: '/catalogue?onglet=livraison', heading: 'Tarifs et catalogue' },
  { path: '/catalogue?onglet=faconnage', heading: 'Tarifs et catalogue' },
  { path: '/mon-compte', heading: 'Mon compte' },
]

/** Aucun élément ne doit faire défiler la page sur le côté (les tableaux défilent dans leur carte). */
const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)

/** Le menu est-il affiché en permanence (ordinateur) ou dans un tiroir (téléphone, tablette en portrait) ? */
const isDrawer = (page: Page) => page.getByRole('button', { name: 'Ouvrir le menu' }).isVisible()

test.describe('Responsive @responsive', () => {
  test('la page de connexion tient dans l’écran et fonctionne', async ({ page }) => {
    await page.goto('/connexion')
    await expect(page.getByRole('heading', { name: 'Connexion' })).toBeInViewport()
    expect(await noHorizontalScroll(page)).toBe(true)
    await uiLogin(page, ADMIN.identifiant, ADMIN.password)
    await expect(page.getByRole('heading', { name: /^Bonjour/ })).toBeVisible()
  })

  for (const p of PAGES) {
    test(`${p.path} : titre visible, pas de défilement horizontal`, async ({ adminPage }) => {
      await adminPage.goto(p.path)
      await expect(adminPage.getByRole('heading', { level: 1, name: p.heading })).toBeInViewport()
      expect(await noHorizontalScroll(adminPage)).toBe(true)
    })
  }

  test('le menu est accessible sur tous les écrans', async ({ adminPage }) => {
    await adminPage.goto('/')
    const nav = adminPage.getByRole('navigation', { name: 'Navigation principale' })
    if (await isDrawer(adminPage)) {
      await expect(nav).not.toBeInViewport()
      await adminPage.getByRole('button', { name: 'Ouvrir le menu' }).click()
      await expect(nav).toBeInViewport()
    }
    await nav.getByRole('link', { name: 'Salariés' }).click()
    await expect(adminPage).toHaveURL('/salaries')
    await expect(adminPage.getByRole('heading', { level: 1, name: 'Salariés' })).toBeVisible()
    if (await isDrawer(adminPage)) await expect(nav).not.toBeInViewport()
  })

  test('les boutons principaux sont assez grands pour le doigt', async ({ adminPage }, info) => {
    test.skip(!info.project.use.hasTouch, 'Seulement sur écran tactile')
    await adminPage.goto('/salaries')
    for (const target of [adminPage.getByRole('link', { name: 'Ajouter un salarié' }), adminPage.getByRole('button', { name: 'Ouvrir le menu' })]) {
      const box = (await target.boundingBox())!
      expect(box.height).toBeGreaterThanOrEqual(44)
    }
  })

  test('le formulaire d’ajout se remplit sans zoom ni débordement', async ({ adminPage }, info) => {
    await adminPage.goto('/salaries/nouveau')
    const prenom = adminPage.getByRole('textbox', { name: 'Prénom', exact: true })
    await prenom.fill('Test')
    if (info.project.use.hasTouch) {
      // En dessous de 16 px, Safari zoome sur le champ : on vérifie la taille du texte
      const size = await prenom.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
      expect(size).toBeGreaterThanOrEqual(16)
    }
    await expect(adminPage.getByRole('button', { name: 'Enregistrer le salarié' })).toBeInViewport()
    expect(await noHorizontalScroll(adminPage)).toBe(true)
  })
})
