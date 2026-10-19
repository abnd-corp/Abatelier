import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { ADMIN, apiLogin } from '../tests/fixtures'

const OUT = new URL('../../apercus/', import.meta.url).pathname

const PAGES = [
  { name: '1-connexion', path: '/connexion', anonymous: true },
  { name: '2-tableau-de-bord', path: '/' },
  { name: '3-salaries', path: '/salaries' },
  { name: '4-fiche-salarie', path: 'FICHE' },
  { name: '5-nouveau-salarie', path: '/salaries/nouveau' },
  { name: '6-comptes', path: '/utilisateurs' },
  { name: '7-journal', path: '/journal' },
  { name: '8-mon-compte', path: '/mon-compte' },
  { name: '9-menu-ouvert', path: '/salaries', openMenu: true },
  { name: '10-catalogue-matieres', path: '/catalogue' },
  { name: '11-catalogue-coloris', path: '/catalogue?onglet=coloris' },
  { name: '12-catalogue-faconnage', path: '/catalogue?onglet=faconnage' },
  { name: '12b-catalogue-modeles', path: '/catalogue?onglet=modeles' },
  { name: '12c-modele-edition', path: '/catalogue?onglet=modeles', editModel: true },
  { name: '13-catalogue-accessoires', path: '/catalogue?onglet=accessoires' },
  { name: '14-catalogue-livraison', path: '/catalogue?onglet=livraison' },
  { name: '15-documents-entreprise', path: '/modeles-documents' },
  { name: '16-documents-modele', path: '/modeles-documents?onglet=modele' },
  { name: '17-documents-numerotation', path: '/modeles-documents?onglet=numerotation' },
  { name: '18-clients', path: '/clients' },
  { name: '19-fiche-client', path: 'FICHE_CLIENT' },
  { name: '20-nouveau-client', path: '/clients/nouveau' },
  { name: '21-commandes', path: '/commandes?filtre=toutes' },
  { name: '22-nouvelle-commande', path: 'NOUVELLE_COMMANDE' },
  { name: '22b-piece-en-3d', path: 'NOUVELLE_COMMANDE', view3d: true },
  { name: '23-fiche-commande', path: 'FICHE_COMMANDE' },
  { name: '24-fabrication', path: '/fabrication' },
  { name: '25-fiche-fabrication', path: 'FICHE_FABRICATION' },
]

test('captures', async ({ page, baseURL }, info) => {
  test.setTimeout(120_000)
  await apiLogin(page.request, baseURL!, ADMIN.identifiant, ADMIN.password)
  const list = (await (await page.request.get('/api/employees?statut=tous')).json()).employees as { id: string; prenom: string }[]
  const ficheId = list.find((e) => e.prenom === 'Paul')!.id
  const clients = (await (await page.request.get('/api/clients?q=forez')).json()).clients as { id: string }[]
  const clientId = clients[0]!.id
  const orders = (await (await page.request.get('/api/orders?filtre=toutes')).json()).orders as { id: string; statut: string }[]
  const orderId = orders.find((o) => o.statut === 'fabrication')!.id
  const SPECIAL: Record<string, string> = {
    FICHE: `/salaries/${ficheId}`,
    FICHE_CLIENT: `/clients/${clientId}`,
    NOUVELLE_COMMANDE: `/commandes/nouvelle?client=${clientId}`,
    FICHE_COMMANDE: `/commandes/${orderId}`,
    FICHE_FABRICATION: `/fabrication/${orderId}`,
  }

  const dir = `${OUT}${info.project.name}`
  mkdirSync(dir, { recursive: true })

  for (const p of PAGES) {
    const target = SPECIAL[p.path] ?? p.path
    if (p.anonymous) {
      const anon = await page.context().browser()!.newContext({ ...info.project.use, baseURL })
      const ap = await anon.newPage()
      await ap.goto(target)
      await ap.waitForLoadState('networkidle')
      await ap.screenshot({ path: `${dir}/${p.name}.png`, fullPage: true })
      await anon.close()
      continue
    }
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto(target)
    await page.waitForLoadState('networkidle')
    if (p.openMenu) {
      const burger = page.getByRole('button', { name: 'Ouvrir le menu' })
      if (!(await burger.isVisible())) continue // menu déjà visible sur grand écran
      await burger.click()
      await page.waitForTimeout(300)
    }
    await expect(page.locator('h1').first()).toBeVisible()
    // L'aperçu PDF se dessine après le chargement : on attend sa première page
    if (p.path.startsWith('/modeles-documents')) await page.getByRole('img', { name: /Aperçu du devis, page 1/ }).waitFor()
    // Le chiffrage se fait après la saisie : on attend le total
    if (p.path === 'NOUVELLE_COMMANDE') await page.getByText('Total TTC').waitFor()
    if (p.editModel) await page.getByRole('button', { name: 'Modifier Couvertine' }).click()
    // Vue 3D de la première pièce, arrêtée (sans rotation) pour une capture stable
    if (p.view3d) {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.getByRole('region', { name: 'Pièce 1' }).getByRole('button', { name: '3D' }).click()
      await page.getByRole('img', { name: 'Pièce 1 en 3D' }).waitFor()
      await page.waitForTimeout(500)
    }
    await page.screenshot({ path: `${dir}/${p.name}.png`, fullPage: !p.openMenu })
  }
})

test.afterAll(() => {
  // Galerie : une colonne par format d'écran, une ligne par page
  const sets = readdirSync(OUT, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()
  const pages = PAGES.map((p) => p.name)
  const rows = pages
    .map(
      (p) =>
        `<h2>${p.replace(/^\d-/, '').replace(/-/g, ' ')}</h2><div class="row">${sets
          .map((s) => {
            const file = `${s}/${p}.png`
            return readdirSync(`${OUT}${s}`).includes(`${p}.png`) ? `<figure><a href="${file}"><img src="${file}" loading="lazy"></a><figcaption>${s}</figcaption></figure>` : ''
          })
          .join('')}</div>`,
    )
    .join('')
  writeFileSync(
    `${OUT}index.html`,
    `<!doctype html><meta charset="utf-8"><title>Aperçu des rendus</title>
<style>body{font-family:system-ui,sans-serif;margin:24px;background:#f3f4f6}h1{margin:0 0 4px}h2{text-transform:capitalize;margin:32px 0 10px}
.row{display:flex;gap:16px;overflow-x:auto;align-items:flex-start;padding-bottom:8px}figure{margin:0;flex:none}
img{max-height:520px;border:1px solid #ccc;border-radius:6px;background:#fff;display:block}figcaption{font-size:12px;color:#555;margin-top:4px}</style>
<h1>Aperçu des rendus</h1><p>Généré le ${new Date().toLocaleString('fr-FR')}. Cliquez sur une image pour la voir en grand.</p>${rows}`,
  )
})
