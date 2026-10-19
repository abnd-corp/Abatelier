import { ADMIN, expect, test, uiLogin } from './fixtures'

test.describe('Sécurité dans le navigateur', () => {
  test('la page envoie les en-têtes de sécurité', async ({ request }) => {
    const res = await request.get('/connexion')
    const h = res.headers()
    expect(h['content-security-policy']).toContain("default-src 'self'")
    expect(h['content-security-policy']).toContain("frame-ancestors 'none'")
    expect(h['x-frame-options']).toBe('DENY')
    expect(h['x-content-type-options']).toBe('nosniff')
    expect(h['referrer-policy']).toBe('same-origin')
    expect(h['server']).not.toMatch(/\d/)
  })

  test('aucune erreur ni violation CSP, et aucun appel à un site externe', async ({ page, baseURL }) => {
    const errors: string[] = []
    const external: string[] = []
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('request', (r) => !r.url().startsWith(baseURL!) && !r.url().startsWith('data:') && external.push(r.url()))

    await uiLogin(page, ADMIN.identifiant, ADMIN.password)
    await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible()
    for (const link of ['Utilisateurs', 'Journal']) {
      await page.getByRole('link', { name: link }).click()
      await expect(page.getByRole('table')).toBeVisible()
    }
    expect(errors).toEqual([])
    expect(external).toEqual([])
  })

  test('les polices du site sont bien chargées (servies par le site, la CSP bloquerait les autres)', async ({ page }) => {
    await page.goto('/connexion')
    await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible()
    const loaded = await page.evaluate(async () => {
      await document.fonts.ready
      return [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, ''))
    })
    expect(loaded).toEqual(expect.arrayContaining(['Archivo Variable', 'Instrument Sans Variable']))
  })

  test('le cookie de session est invisible pour JavaScript', async ({ page, context }) => {
    await uiLogin(page, ADMIN.identifiant, ADMIN.password)
    await expect(page).toHaveURL('/')
    const cookie = (await context.cookies()).find((c) => c.name.endsWith('aps_session'))!
    expect(cookie.httpOnly).toBe(true)
    expect(cookie.sameSite).toBe('Lax')
    expect(await page.evaluate(() => document.cookie)).not.toContain('aps_session')
  })

  test('l’API refuse une requête envoyée depuis un autre site', async ({ adminPage }) => {
    const res = await adminPage.request.post('/api/users', {
      data: { identifiant: 'pirate', nom: 'Pirate', role: 'admin' },
      headers: { Origin: 'https://site-pirate.example' },
    })
    expect(res.status()).toBe(403)
  })

  test('le site refuse d’être affiché dans une iframe d’un autre site', async ({ page, baseURL }) => {
    await page.setContent(`<iframe src="${baseURL}/connexion" style="width:400px;height:400px"></iframe>`)
    // Le navigateur bloque le contenu (frame-ancestors 'none') : aucun champ de connexion n'apparaît.
    // Chromium garde une frame vide, Firefox n'en expose parfois aucune : on inspecte celles qui existent.
    await page.waitForTimeout(1500)
    const counts = await Promise.all(
      page.frames().slice(1).map((f) => Promise.race([f.locator('#identifiant').count(), new Promise<number>((r) => setTimeout(() => r(0), 3000))])),
    )
    expect(counts.every((n) => n === 0)).toBe(true)
  })
})
