import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp, client, createUser, loginAs, resetDb, type App, type Client } from './helpers.js'

let app: App
let admin: Client
let adminId: string
// Application neuve à chaque test : la limite d'essais par IP repart de zéro
beforeEach(async () => {
  app = await buildApp()
})
afterEach(() => app.close())
beforeEach(async () => {
  await resetDb()
  adminId = (await createUser({ identifiant: 'chef', nom: 'Le Chef', role: 'admin' })).id
  admin = await loginAs(app, 'chef')
})

describe('GET /api/audit', () => {
  it('est réservé aux administrateurs', async () => {
    await createUser({ identifiant: 'paul' })
    const paul = await loginAs(app, 'paul')
    expect((await paul.get('/api/audit')).statusCode).toBe(403)
    expect((await client(app).get('/api/audit')).statusCode).toBe(401)
  })

  it('montre qui a fait quoi, du plus récent au plus ancien', async () => {
    const created = (await admin.post('/api/users', { identifiant: 'paul', nom: 'Paul Martin', role: 'atelier' })).json()
    const entries = (await admin.get('/api/audit')).json().entries
    expect(entries.map((e: { action: string }) => e.action)).toEqual(['user.created', 'login.success'])
    expect(entries[0]).toMatchObject({ nom: 'Le Chef', identifiant: 'chef', targetId: created.id, targetName: 'Paul Martin' })
    expect(entries[0].details).toMatchObject({ identifiant: 'paul', role: 'atelier' })
  })

  it('filtre les échecs', async () => {
    await client(app).post('/api/auth/login', { identifiant: 'chef', password: 'faux' })
    await client(app).post('/api/auth/login', { identifiant: 'inconnu', password: 'faux' })
    const entries = (await admin.get('/api/audit?type=failures')).json().entries
    expect(entries).toHaveLength(2)
    expect(entries.every((e: { action: string }) => e.action === 'login.failed')).toBe(true)
    // L'échec sur un compte existant est rattaché à la personne, l'autre garde l'identifiant tapé
    expect(entries.map((e: { identifiant: string; userId: string | null }) => [e.identifiant, e.userId])).toEqual([
      ['inconnu', null],
      ['chef', adminId],
    ])
  })

  it('filtre par personne', async () => {
    const u = await createUser({ identifiant: 'paul' })
    await loginAs(app, 'paul')
    const entries = (await admin.get(`/api/audit?userId=${u.id}`)).json().entries
    expect(entries.map((e: { action: string }) => e.action)).toEqual(['login.success'])
  })

  it('pagine sans doublon', async () => {
    for (let i = 0; i < 4; i++) await loginAs(app, 'chef')
    const first = (await admin.get('/api/audit?limit=3')).json()
    expect(first.entries).toHaveLength(3)
    expect(first.nextBefore).not.toBeNull()
    const second = (await admin.get(`/api/audit?limit=3&before=${first.nextBefore}`)).json()
    expect(second.entries).toHaveLength(2)
    expect(second.nextBefore).toBeNull()
    const ids = [...first.entries, ...second.entries].map((e: { id: number }) => e.id)
    expect(new Set(ids).size).toBe(5)
  })

  it('refuse un filtre invalide', async () => {
    expect((await admin.get('/api/audit?type=tout')).statusCode).toBe(400)
    expect((await admin.get('/api/audit?userId=abc')).statusCode).toBe(400)
  })
})
