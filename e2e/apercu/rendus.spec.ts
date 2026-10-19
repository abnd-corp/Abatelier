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
  { name: '13-catalogue-accessoires', path: '/catalogue?onglet=accessoires' },
  { name: '14-catalogue-livraison', path: '/catalogue?onglet=livraison' },
  { name: '15-documents-entreprise', path: '/modeles-documents' },
  { name: '16-documents-modele', path: '/modeles-documents?onglet=modele' },
  { name: '17-documents-numerotation', path: '/modeles-documents?onglet=numerotation' },
]

test('captures', async ({ page, baseURL }, info) => {
  test.setTimeout(120_000)
  await apiLogin(page.request, baseURL!, ADMIN.identifiant, ADMIN.password)
  const list = (await (await page.request.get('/api/employees?statut=tous')).json()).employees as { id: string; prenom: string }[]
  const ficheId = list.find((e) => e.prenom === 'Paul')!.id

  const dir = `${OUT}${info.project.name}`
  mkdirSync(dir, { recursive: true })

  for (const p of PAGES) {
    const target = p.path === 'FICHE' ? `/salaries/${ficheId}` : p.path
    if (p.anonymous) {
      const anon = await page.context().browser()!.newContext({ ...info.project.use, baseURL })
      const ap = await anon.newPage()
      await ap.goto(target)
      await ap.waitForLoadState('networkidle')
      await ap.screenshot({ path: `${dir}/${p.name}.png`, fullPage: true })
      await anon.close()
      continue
    }
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
