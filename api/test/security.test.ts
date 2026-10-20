import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '../src/db/index.js'
import { sessions, users } from '../src/db/schema.js'
import { buildApp, client, createUser, HOST, loginAs, resetDb, type App } from './helpers.js'

let app: App
// Application neuve à chaque test : la limite d'essais par IP repart de zéro
beforeEach(async () => {
  app = await buildApp()
})
afterEach(() => app.close())
beforeEach(resetDb)

// Seules routes accessibles sans être connecté. Toute nouvelle route publique doit être ajoutée ici consciemment.
const PUBLIC = ['GET /api/health', 'GET /api/auth/session', 'POST /api/auth/login', 'POST /api/auth/logout', 'GET /api/public/site', 'GET /api/public/photos/:id', 'GET /api/public/avis', 'GET /api/public/configurateur', 'POST /api/public/configurateur/chiffrage', 'POST /api/public/contact', 'GET /api/public/boutique', 'GET /api/public/boutique/images/:id', 'POST /api/public/boutique/panier', 'POST /api/paiement/stripe', 'GET /api/public/robots.txt', 'GET /api/public/sitemap.xml', 'POST /api/espace/inscription', 'POST /api/espace/connexion', 'POST /api/espace/deconnexion', 'GET /api/espace/session']
const UUID = '00000000-0000-4000-8000-000000000000'
// Notifications signées d'un prestataire extérieur : pas de navigateur, donc pas d'en-tête Origin (voir le test dédié plus bas)
const WEBHOOKS = ['POST /api/paiement/stripe']
const routes = () =>
  app.routeList.map((r) => ({ ...r, path: r.url.replace(/:[a-zA-Z]+/g, UUID), key: `${r.method} ${r.url}` }))

describe('Contrôle d’accès', () => {
  it('liste au moins les routes connues (garde-fou du test lui-même)', () => {
    expect(routes().length).toBeGreaterThanOrEqual(12)
  })

  it('toutes les routes non publiques exigent une session', async () => {
    const failures = []
    for (const r of routes().filter((r) => !PUBLIC.includes(r.key))) {
      const res = await app.inject({ method: r.method as 'GET', url: r.path, headers: { host: HOST, origin: `http://${HOST}` }, payload: r.method === 'GET' ? undefined : {} })
      if (res.statusCode !== 401) failures.push(`${r.key} → ${res.statusCode}`)
    }
    expect(failures).toEqual([])
  })
})

describe('Protection CSRF', () => {
  const mutating = () => routes().filter((r) => r.method !== 'GET' && !WEBHOOKS.includes(r.key))

  it('refuse toute modification sans en-tête Origin, même connecté', async () => {
    await createUser({ identifiant: 'chef', role: 'direction' })
    const c = await loginAs(app, 'chef')
    for (const r of mutating()) {
      const res = await app.inject({ method: r.method as 'POST', url: r.path, headers: { host: HOST, cookie: c.cookie }, payload: {} })
      expect(res.statusCode, r.key).toBe(403)
    }
  })

  it('refuse une modification venant d’un autre site', async () => {
    await createUser({ identifiant: 'chef', role: 'direction' })
    const c = await loginAs(app, 'chef')
    for (const r of mutating()) {
      const res = await app.inject({
        method: r.method as 'POST',
        url: r.path,
        headers: { host: HOST, cookie: c.cookie, origin: 'https://site-pirate.example' },
        payload: {},
      })
      expect(res.statusCode, r.key).toBe(403)
    }
  })

  it('accepte le Referer du même site quand Origin est absent', async () => {
    await createUser({ identifiant: 'paul' })
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { host: HOST, referer: `http://${HOST}/connexion` },
      payload: { identifiant: 'paul', password: 'Plieuse-numerique-2026' },
    })
    expect(res.statusCode).toBe(200)
  })
})

describe('Notifications de paiement', () => {
  it('n’acceptent rien sans signature valide, même sans en-tête Origin', async () => {
    for (const w of WEBHOOKS) {
      const [method, url] = w.split(' ') as ['POST', string]
      const res = await app.inject({ method, url, headers: { host: HOST, 'content-type': 'application/json' }, payload: '{}' })
      // 404 : prestataire non configuré ; 400 : signature absente ou fausse. Jamais 200, jamais 403 d'origine.
      expect([400, 404], w).toContain(res.statusCode)
    }
  })
})

describe('Stockage des secrets', () => {
  it('hache les mots de passe avec Argon2id', async () => {
    const u = await createUser({ identifiant: 'paul' })
    const [row] = await db.select().from(users).where(eq(users.id, u.id))
    expect(row!.passwordHash).toMatch(/^\$argon2id\$/)
  })

  it('ne stocke que l’empreinte SHA-256 du jeton de session', async () => {
    await createUser({ identifiant: 'paul' })
    const c = await loginAs(app, 'paul')
    const token = c.cookie.split('=')[1]!
    const [s] = await db.select().from(sessions)
    expect(s!.id).not.toBe(token)
    expect(s!.id).toBe(createHash('sha256').update(token).digest('hex'))
    expect(token.length).toBeGreaterThanOrEqual(43)
  })
})

describe('Réponses', () => {
  it('interdit la mise en cache des réponses de l’API', async () => {
    const res = await client(app).get('/api/health')
    expect(res.headers['cache-control']).toBe('no-store')
  })

  it('refuse un corps trop volumineux', async () => {
    const res = await client(app).post('/api/auth/login', { identifiant: 'x'.repeat(200 * 1024), password: 'x' })
    expect(res.statusCode).toBe(413)
  })

  it('répond en français, sans détail technique, à un JSON invalide', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { host: HOST, origin: `http://${HOST}`, 'content-type': 'application/json' },
      payload: '{pas du json',
    })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({ error: 'Requête invalide.' })
  })
})
