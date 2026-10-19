import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '../src/db/index.js'
import { users } from '../src/db/schema.js'
import { checkPasswordPolicy, generateTempPassword } from '../src/auth/password-policy.js'
import { auditActions, buildApp, client, createUser, loginAs, PASSWORD, resetDb, type App } from './helpers.js'

let app: App
// Application neuve à chaque test : la limite d'essais par IP repart de zéro
beforeEach(async () => {
  app = await buildApp()
})
afterEach(() => app.close())
beforeEach(resetDb)

const NEW = 'Cintreuse-rouge-2026'

describe('Règles de mot de passe', () => {
  it.each([
    ['court123', /au moins 12/],
    ['Azerty2024!!', /trop courant/],
    ['motdepasse123', /trop courant/],
    ['aaaaaaaaaaab', /répétés/],
    ['jean-dupont-2026', /identifiant ou votre nom/],
  ])('refuse « %s »', (pw, msg) => {
    expect(checkPasswordPolicy(pw, { identifiant: 'jdupont', nom: 'Jean Dupont' })).toMatch(msg)
  })

  it('accepte une phrase de passe', () => {
    expect(checkPasswordPolicy('tole pliee bleu marine', { identifiant: 'paul', nom: 'Paul Martin' })).toBeNull()
  })

  it('génère des mots de passe temporaires lisibles, uniques et conformes', () => {
    const all = new Set(Array.from({ length: 50 }, generateTempPassword))
    expect(all.size).toBe(50)
    for (const pw of all) {
      expect(pw).toMatch(/^[A-Za-z0-9]{4}(-[A-Za-z0-9]{4}){3}$/)
      expect(pw).not.toMatch(/[0O1lI]/)
      expect(checkPasswordPolicy(pw)).toBeNull()
    }
  })
})

describe('POST /api/auth/password', () => {
  it('change le mot de passe : l’ancien ne marche plus, le nouveau oui', async () => {
    await createUser({ identifiant: 'paul' })
    const c = await loginAs(app, 'paul')
    const res = await c.post('/api/auth/password', { current: PASSWORD, next: NEW })
    expect(res.statusCode).toBe(200)
    expect((await client(app).post('/api/auth/login', { identifiant: 'paul', password: PASSWORD })).statusCode).toBe(401)
    expect((await client(app).post('/api/auth/login', { identifiant: 'paul', password: NEW })).statusCode).toBe(200)
  })

  it('déconnecte les autres appareils mais garde la session en cours', async () => {
    const u = await createUser({ identifiant: 'paul' })
    const pc = await loginAs(app, 'paul')
    const phone = await loginAs(app, 'paul')
    const res = await pc.post('/api/auth/password', { current: PASSWORD, next: NEW })
    expect(res.json().closedSessions).toBe(1)
    expect((await pc.get('/api/auth/me')).statusCode).toBe(200)
    expect((await phone.get('/api/auth/me')).statusCode).toBe(401)
    expect(await auditActions(u.id)).toContain('password.changed')
  })

  it('refuse si le mot de passe actuel est faux', async () => {
    await createUser({ identifiant: 'paul' })
    const c = await loginAs(app, 'paul')
    const res = await c.post('/api/auth/password', { current: 'faux', next: NEW })
    expect(res.statusCode).toBe(400)
    expect(res.json().field).toBe('current')
  })

  it('refuse un nouveau mot de passe identique ou trop faible', async () => {
    await createUser({ identifiant: 'paul' })
    const c = await loginAs(app, 'paul')
    expect((await c.post('/api/auth/password', { current: PASSWORD, next: PASSWORD })).json().field).toBe('next')
    expect((await c.post('/api/auth/password', { current: PASSWORD, next: 'azerty' })).statusCode).toBe(400)
  })

  it('exige d’être connecté', async () => {
    expect((await client(app).post('/api/auth/password', { current: 'a', next: NEW })).statusCode).toBe(401)
  })
})

describe('Mot de passe temporaire', () => {
  it('bloque l’application tant que le mot de passe n’est pas changé', async () => {
    await createUser({ identifiant: 'chef', role: 'admin', mustChangePassword: true })
    const c = await loginAs(app, 'chef')
    expect((await c.get('/api/auth/me')).statusCode).toBe(200)
    expect((await c.get('/api/auth/sessions')).statusCode).toBe(200)
    const blocked = await c.get('/api/users')
    expect(blocked.statusCode).toBe(403)
    expect(blocked.json().code).toBe('PASSWORD_CHANGE_REQUIRED')
  })

  it('débloque après le changement', async () => {
    const u = await createUser({ identifiant: 'chef', role: 'admin', mustChangePassword: true })
    const c = await loginAs(app, 'chef')
    const res = await c.post('/api/auth/password', { current: PASSWORD, next: NEW })
    expect(res.json().user.mustChangePassword).toBe(false)
    expect((await c.get('/api/users')).statusCode).toBe(200)
    const [row] = await db.select().from(users).where(eq(users.id, u.id))
    expect(row!.mustChangePassword).toBe(false)
    expect(row!.passwordChangedAt).not.toBeNull()
  })
})
