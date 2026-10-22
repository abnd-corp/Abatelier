import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import { db } from '../src/db/index.js'
import { loginAttempts, sessions } from '../src/db/schema.js'
import { auditActions, buildApp, client, createUser, loginAs, PASSWORD, resetDb, type App } from './helpers.js'

let app: App
// Application neuve à chaque test : la limite d'essais par IP repart de zéro
beforeEach(async () => {
  app = await buildApp()
})
afterEach(() => app.close())
beforeEach(resetDb)

const GENERIC = 'Identifiant ou mot de passe incorrect.'

describe('POST /api/auth/login', () => {
  it('connecte avec le bon mot de passe et ne renvoie jamais le hash', async () => {
    const u = await createUser({ identifiant: 'paul', role: 'direction' })
    const res = await client(app).post('/api/auth/login', { identifiant: 'paul', password: PASSWORD })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.user).toMatchObject({ id: u.id, identifiant: 'paul', role: 'direction', mustChangePassword: false })
    expect(body.user.permissions).toEqual([
      'users.manage',
      'employees.manage',
      'audit.read',
      'catalog.manage',
      'documents.manage',
      'clients.manage',
      'clients.read',
      'orders.manage',
      'orders.production',
      'billing.manage',
      'site.manage',
      'products.manage',
      'stock.manage',
    ])
    expect(body.user.role).toBe('direction')
    expect(res.body).not.toContain('argon2')
    expect(res.body).not.toContain('passwordHash')
  })

  it('ignore la casse et les espaces autour de l’identifiant', async () => {
    await createUser({ identifiant: 'paul' })
    const res = await client(app).post('/api/auth/login', { identifiant: '  Paul ', password: PASSWORD })
    expect(res.statusCode).toBe(200)
  })

  it('pose un cookie HttpOnly, SameSite=Lax, sans date sans « rester connecté »', async () => {
    await createUser({ identifiant: 'paul' })
    const res = await client(app).post('/api/auth/login', { identifiant: 'paul', password: PASSWORD })
    const cookie = res.cookies.find((c) => c.name === 'aps_session')!
    expect(cookie.httpOnly).toBe(true)
    expect(cookie.sameSite).toBe('Lax')
    expect(cookie.path).toBe('/')
    expect(cookie.expires).toBeUndefined()
  })

  it('pose un cookie de 30 jours avec « rester connecté »', async () => {
    await createUser({ identifiant: 'paul' })
    const res = await client(app).post('/api/auth/login', { identifiant: 'paul', password: PASSWORD, remember: true })
    const cookie = res.cookies.find((c) => c.name === 'aps_session')!
    const days = (new Date(cookie.expires!).getTime() - Date.now()) / 86400000
    expect(days).toBeGreaterThan(29.9)
    expect(days).toBeLessThan(30.1)
  })

  it('donne le même message pour un mauvais mot de passe et un identifiant inconnu', async () => {
    await createUser({ identifiant: 'paul' })
    const bad = await client(app).post('/api/auth/login', { identifiant: 'paul', password: 'faux' })
    const unknown = await client(app).post('/api/auth/login', { identifiant: 'personne', password: 'faux' })
    expect(bad.statusCode).toBe(401)
    expect(unknown.statusCode).toBe(401)
    expect(bad.json().error).toBe(GENERIC)
    expect(unknown.json().error).toBe(GENERIC)
  })

  it('refuse une requête incomplète', async () => {
    const res = await client(app).post('/api/auth/login', { identifiant: 'paul' })
    expect(res.statusCode).toBe(400)
  })

  it('traite une tentative d’injection SQL comme un identifiant ordinaire', async () => {
    await createUser({ identifiant: 'paul' })
    const res = await client(app).post('/api/auth/login', { identifiant: "paul' or '1'='1", password: "' or '1'='1" })
    expect(res.statusCode).toBe(401)
  })
})

describe('Verrouillage et délai progressif', () => {
  it('prévient avant le blocage puis bloque au 5e échec', async () => {
    await createUser({ identifiant: 'paul' })
    const c = client(app)
    const messages = []
    for (let i = 0; i < 5; i++) messages.push((await c.post('/api/auth/login', { identifiant: 'paul', password: 'faux' })).json().error)
    expect(messages[0]).toBe(GENERIC)
    expect(messages[2]).toContain('Encore 2 essais')
    expect(messages[3]).toContain('Encore 1 essai ')
    expect(messages[4]).toMatch(/Trop d’essais pour cet identifiant/)
  })

  it('refuse même le bon mot de passe pendant le blocage', async () => {
    await createUser({ identifiant: 'paul' })
    for (let i = 0; i < 5; i++) await client(app).post('/api/auth/login', { identifiant: 'paul', password: 'faux' })
    const res = await client(app).post('/api/auth/login', { identifiant: 'paul', password: PASSWORD })
    expect(res.statusCode).toBe(429)
    expect(await auditActions()).toContain('login.locked')
  })

  it('bloque aussi un identifiant inexistant (ne révèle pas quels comptes existent)', async () => {
    let last
    for (let i = 0; i < 5; i++) last = await client(app).post('/api/auth/login', { identifiant: 'fantome', password: 'faux' })
    expect(last!.statusCode).toBe(429)
  })

  it('ne bloque que l’identifiant visé', async () => {
    await createUser({ identifiant: 'paul' })
    await createUser({ identifiant: 'marie' })
    for (let i = 0; i < 5; i++) await client(app).post('/api/auth/login', { identifiant: 'paul', password: 'faux' })
    const res = await client(app).post('/api/auth/login', { identifiant: 'marie', password: PASSWORD })
    expect(res.statusCode).toBe(200)
  })

  it('débloque après le délai et remet le compteur à zéro', async () => {
    await createUser({ identifiant: 'paul' })
    for (let i = 0; i < 5; i++) await client(app).post('/api/auth/login', { identifiant: 'paul', password: 'faux' })
    await db.update(loginAttempts).set({ lockedUntil: sql`now() - interval '1 minute'`, lastFailedAt: sql`now() - interval '16 minutes'` })
    const res = await client(app).post('/api/auth/login', { identifiant: 'paul', password: PASSWORD })
    expect(res.statusCode).toBe(200)
    expect(await db.select().from(loginAttempts)).toHaveLength(0)
  })

  it('augmente le délai de réponse à chaque échec', async () => {
    const times = []
    for (let i = 0; i < 4; i++) {
      const t = performance.now()
      await client(app).post('/api/auth/login', { identifiant: 'lent', password: 'faux' })
      times.push(performance.now() - t)
    }
    // Base de 5 ms en test : 5, 10, 20, 40 ms
    expect(times[3]!).toBeGreaterThan(times[0]! + 20)
  })
})

describe('Limite par adresse IP', () => {
  it('répond 429 en français au-delà de la limite', async () => {
    const fresh = await buildApp()
    let res
    for (let i = 0; i <= 30; i++) res = await client(fresh).post('/api/auth/login', { identifiant: `ip${i}`, password: 'x' })
    await fresh.close()
    expect(res!.statusCode).toBe(429)
    expect(res!.json().error).toMatch(/^Trop de tentatives depuis cette adresse/)
  })
})

describe('Comptes désactivés', () => {
  it('refuse la connexion avec le bon mot de passe, avec un message clair', async () => {
    await createUser({ identifiant: 'paul', disabled: true })
    const res = await client(app).post('/api/auth/login', { identifiant: 'paul', password: PASSWORD })
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toMatch(/désactivé/)
  })

  it('ne révèle rien avec un mauvais mot de passe', async () => {
    await createUser({ identifiant: 'paul', disabled: true })
    const res = await client(app).post('/api/auth/login', { identifiant: 'paul', password: 'faux' })
    expect(res.json().error).toBe(GENERIC)
  })
})

describe('Session', () => {
  it('GET /me renvoie 401 sans session et l’utilisateur avec', async () => {
    await createUser({ identifiant: 'paul' })
    expect((await client(app).get('/api/auth/me')).statusCode).toBe(401)
    const c = await loginAs(app, 'paul')
    const res = await c.get('/api/auth/me')
    expect(res.statusCode).toBe(200)
    expect(res.json().user.identifiant).toBe('paul')
  })

  it('GET /session répond toujours 200 : null sans session, l’utilisateur avec', async () => {
    await createUser({ identifiant: 'paul' })
    const anon = await client(app).get('/api/auth/session')
    expect(anon.statusCode).toBe(200)
    expect(anon.json()).toEqual({ user: null })
    const c = await loginAs(app, 'paul')
    expect((await c.get('/api/auth/session')).json().user.identifiant).toBe('paul')
  })

  it('la déconnexion supprime la session en base et efface le cookie', async () => {
    await createUser({ identifiant: 'paul' })
    const c = await loginAs(app, 'paul')
    const old = c.cookie
    const res = await c.post('/api/auth/logout')
    expect(res.statusCode).toBe(204)
    expect(c.cookie).toBe('')
    expect(await db.select().from(sessions)).toHaveLength(0)
    c.cookie = old
    expect((await c.get('/api/auth/me')).statusCode).toBe(401)
  })

  it('refuse une session expirée et efface le cookie', async () => {
    await createUser({ identifiant: 'paul' })
    const c = await loginAs(app, 'paul')
    await db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) })
    const res = await c.get('/api/auth/me')
    expect(res.statusCode).toBe(401)
    expect(c.cookie).toBe('')
  })

  it('prolonge une session active (déconnexion d’inactivité glissante)', async () => {
    await createUser({ identifiant: 'paul' })
    const c = await loginAs(app, 'paul')
    const soon = new Date(Date.now() + 60_000)
    await db.update(sessions).set({ expiresAt: soon, lastSeenAt: new Date(Date.now() - 5 * 60_000) })
    await c.get('/api/auth/me')
    const [s] = await db.select().from(sessions)
    const hours = (s!.expiresAt.getTime() - Date.now()) / 3600000
    expect(hours).toBeGreaterThan(11.9)
    expect(hours).toBeLessThan(12.1)
  })

  it('refuse un cookie falsifié', async () => {
    const c = client(app)
    c.cookie = 'aps_session=nimportequoi'
    expect((await c.get('/api/auth/me')).statusCode).toBe(401)
  })

  it('enregistre la connexion dans le journal avec l’appareil', async () => {
    const u = await createUser({ identifiant: 'paul' })
    await loginAs(app, 'paul', PASSWORD, { userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Firefox/140.0' })
    const [s] = await db.select().from(sessions).where(eq(sessions.userId, u.id))
    expect(s!.userAgent).toContain('Firefox')
    expect(await auditActions(u.id)).toEqual(['login.success'])
  })
})
