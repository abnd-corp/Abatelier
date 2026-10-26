import { apiLogin, createUser, expect, NEW_PASSWORD, test } from './fixtures'

test.describe('Mon compte', () => {
  test('voir ses appareils et déconnecter les autres', async ({ adminPage, browser, baseURL, uid }) => {
    const temp = await createUser(adminPage.request, baseURL!, { identifiant: uid, nom: `Appareils ${uid.slice(-4)}` })

    // L'employé change son mot de passe puis se connecte sur un second appareil
    const pc = await (await browser.newContext()).newPage()
    await apiLogin(pc.request, baseURL!, uid, temp)
    const change = await pc.request.post('/api/auth/password', { data: { current: temp, next: NEW_PASSWORD }, headers: { Origin: baseURL! } })
    expect(change.status()).toBe(200)
    const phone = await (await browser.newContext()).newPage()
    await apiLogin(phone.request, baseURL!, uid, NEW_PASSWORD)

    await pc.goto('/mon-compte')
    const sessions = pc.locator('.sessions li')
    await expect(sessions).toHaveCount(2)
    await expect(sessions.filter({ hasText: 'Cet appareil' })).toHaveCount(1)

    await pc.getByRole('button', { name: 'Déconnecter les autres' }).click()
    await expect(sessions).toHaveCount(1)

    await phone.goto('/tableau-de-bord')
    await expect(phone).toHaveURL(/\/connexion/)
    await pc.context().close()
    await phone.context().close()
  })
})

test.describe('Mon compte : un seul appareil', () => {
  test('déconnecte un appareil précis, et /api/auth/me suit la session', async ({ adminPage, browser, baseURL, uid }) => {
    const temp = await createUser(adminPage.request, baseURL!, { identifiant: uid, nom: `Un appareil ${uid.slice(-4)}` })
    const pc = await (await browser.newContext()).newPage()
    await apiLogin(pc.request, baseURL!, uid, temp)
    await pc.request.post('/api/auth/password', { data: { current: temp, next: NEW_PASSWORD }, headers: { Origin: baseURL! } })
    const phone = await (await browser.newContext()).newPage()
    await apiLogin(phone.request, baseURL!, uid, NEW_PASSWORD)
    expect((await phone.request.get('/api/auth/me')).status()).toBe(200)

    await pc.goto('/mon-compte')
    const sessions = pc.locator('.sessions li')
    await expect(sessions).toHaveCount(2)
    await sessions.filter({ hasNotText: 'Cet appareil' }).getByRole('button', { name: 'Déconnecter' }).click()
    await expect(sessions).toHaveCount(1)
    expect((await phone.request.get('/api/auth/me')).status()).toBe(401)
    expect((await pc.request.get('/api/auth/me')).status()).toBe(200)
    await pc.context().close()
    await phone.context().close()
  })
})

test.describe('Journal d’activité', () => {
  test('montre la création d’un compte et les échecs de connexion', async ({ adminPage, baseURL, uid, request }) => {
    const nom = `Journal ${uid.slice(-5)}`
    await createUser(adminPage.request, baseURL!, { identifiant: uid, nom })
    await request.post('/api/auth/login', { data: { identifiant: uid, password: 'faux' }, headers: { Origin: baseURL! } })

    await adminPage.goto('/journal')
    await expect(adminPage.getByRole('cell', { name: `A créé le compte de ${nom} (atelier)` })).toBeVisible()

    await adminPage.getByRole('button', { name: 'Échecs' }).click()
    await expect(adminPage.getByRole('row', { name: new RegExp(uid) }).first()).toContainText('Mot de passe incorrect')
    await expect(adminPage.getByRole('cell', { name: /A créé le compte/ })).toHaveCount(0)
  })
})
