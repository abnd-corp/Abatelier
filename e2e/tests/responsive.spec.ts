import type { Page } from '@playwright/test'
import { ADMIN, expect, test, uiLogin } from './fixtures'

// Tourne sur ordinateur (Chromium, Firefox), téléphone et tablette : voir playwright.config.ts

const PAGES = [
  { path: '/tableau-de-bord', heading: /^Bonjour/ },
  { path: '/salaries', heading: 'Salariés' },
  { path: '/salaries/nouveau', heading: 'Nouveau salarié' },
  { path: '/utilisateurs', heading: 'Comptes' },
  { path: '/journal', heading: 'Journal d’activité' },
  { path: '/catalogue', heading: 'Tarifs et catalogue' },
  { path: '/catalogue?onglet=coloris', heading: 'Tarifs et catalogue' },
  { path: '/catalogue?onglet=modeles', heading: 'Tarifs et catalogue' },
  { path: '/catalogue?onglet=accessoires', heading: 'Tarifs et catalogue' },
  { path: '/catalogue?onglet=livraison', heading: 'Tarifs et catalogue' },
  { path: '/catalogue?onglet=faconnage', heading: 'Tarifs et catalogue' },
  { path: '/modeles-documents', heading: 'Modèles de documents' },
  { path: '/modeles-documents?onglet=modele', heading: 'Modèles de documents' },
  { path: '/modeles-documents?onglet=numerotation', heading: 'Modèles de documents' },
  { path: '/clients', heading: 'Clients' },
  { path: '/commandes', heading: 'Commandes' },
  { path: '/commandes/nouvelle', heading: 'Nouvelle commande' },
  { path: '/fabrication', heading: 'Fabrication' },
  { path: '/factures', heading: 'Devis et factures' },
  { path: '/factures?type=devis', heading: 'Devis et factures' },
  { path: '/site-vitrine', heading: 'Site vitrine' },
  { path: '/clients/nouveau', heading: 'Nouveau client' },
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

  test('/clients/:id : fiche client lisible, pas de défilement horizontal', async ({ adminPage, baseURL, uid }) => {
    const res = await adminPage.request.post('/api/clients', {
      data: { type: 'professionnel', raisonSociale: `Couverture Très Longue Raison Sociale ${uid}`, prenom: 'Luc', nom: 'Morel', email: `${uid}@exemple.fr`, adresse: '8 avenue de la Gare', codePostal: '42700', ville: 'Firminy' },
      headers: { Origin: baseURL! },
    })
    const { id } = await res.json()
    await adminPage.request.post(`/api/clients/${id}/sites`, { data: { libelle: 'Maison Rivière', adresse: '12 chemin du Bois', codePostal: '42240', ville: 'Unieux' }, headers: { Origin: baseURL! } })
    await adminPage.goto(`/clients/${id}`)
    await expect(adminPage.getByRole('heading', { level: 1 })).toBeInViewport()
    await expect(adminPage.getByText('Maison Rivière', { exact: true })).toBeVisible()
    expect(await noHorizontalScroll(adminPage)).toBe(true)
  })

  test('commande : saisie, fiche et fabrication lisibles, pas de défilement horizontal', async ({ adminPage, baseURL, uid }) => {
    const headers = { Origin: baseURL! }
    const client = await (await adminPage.request.post('/api/clients', { data: { type: 'particulier', nom: `Resp${uid.slice(-4)}` }, headers })).json()
    await adminPage.goto(`/commandes/nouvelle?client=${client.id}`)
    await expect(adminPage.getByRole('region', { name: 'Pièce 1' })).toBeVisible()
    await expect(adminPage.getByRole('button', { name: 'Enregistrer la commande' })).toBeEnabled()
    expect(await noHorizontalScroll(adminPage)).toBe(true)
    await adminPage.getByRole('button', { name: 'Enregistrer la commande' }).click()
    await expect(adminPage).toHaveURL(/\/commandes\/[0-9a-f-]{36}$/)
    await expect(adminPage.getByRole('heading', { level: 1 })).toBeInViewport()
    expect(await noHorizontalScroll(adminPage)).toBe(true)
    const id = adminPage.url().split('/').pop()!
    await adminPage.request.post(`/api/orders/${id}/status`, { data: { statut: 'validee' }, headers })
    await adminPage.goto(`/fabrication/${id}`)
    await expect(adminPage.getByRole('heading', { level: 1 })).toBeInViewport()
    expect(await noHorizontalScroll(adminPage)).toBe(true)
  })

  test('devis et facture : fiche lisible, pas de défilement horizontal', async ({ adminPage, baseURL, uid }) => {
    const headers = { Origin: baseURL! }
    const client = await (await adminPage.request.post('/api/clients', { data: { type: 'professionnel', raisonSociale: `Couverture Très Longue Raison Sociale ${uid}`, adresse: '8 avenue de la Gare', codePostal: '42700', ville: 'Firminy' }, headers })).json()
    const catalog = await (await adminPage.request.get('/api/orders/catalog')).json()
    const m = catalog.models[0]
    const ligne = { repere: 'Mur sud', modelId: m.id, materialId: catalog.materials[0].id, colorId: catalog.colors[0].id, cotes: m.cotes, angles: m.angles, longueur: m.longueur, quantite: m.quantite, accessoires: [] }
    const order = await (await adminPage.request.post('/api/orders', { data: { clientId: client.id, lignes: [ligne], livraison: { mode: 'retrait' } }, headers })).json()
    await adminPage.request.post(`/api/orders/${order.id}/status`, { data: { statut: 'validee' }, headers })
    const facture = await (await adminPage.request.post(`/api/billing/orders/${order.id}/facture`, { headers })).json()
    await adminPage.goto(`/factures/${facture.id}`)
    await expect(adminPage.getByRole('heading', { level: 1 })).toBeInViewport()
    await expect(adminPage.getByRole('button', { name: 'Enregistrer le paiement' })).toBeVisible()
    expect(await noHorizontalScroll(adminPage)).toBe(true)
    await adminPage.getByRole('button', { name: 'Enregistrer le paiement' }).click()
    await expect(adminPage.getByLabel('Date du paiement')).toBeVisible()
    expect(await noHorizontalScroll(adminPage)).toBe(true)
    // La commande, avec sa section devis et factures
    await adminPage.goto(`/commandes/${order.id}`)
    await expect(adminPage.getByRole('region', { name: 'Devis et factures' })).toContainText(facture.numero)
    expect(await noHorizontalScroll(adminPage)).toBe(true)
  })

  test('le menu est accessible sur tous les écrans', async ({ adminPage }) => {
    await adminPage.goto('/tableau-de-bord')
    // isDrawer() ne patiente pas : on attend que la page soit affichée avant de choisir le cas tiroir ou menu fixe
    await expect(adminPage.getByRole('heading', { level: 1 })).toBeVisible()
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
