import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp, client, createUser, loginAs, auditActions, PASSWORD, resetDb, type App, type Client } from './helpers.js'

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

const UUID = '00000000-0000-4000-8000-000000000000'

describe('Accès', () => {
  it('refuse toutes les routes de gestion au rôle atelier', async () => {
    const u = await createUser({ identifiant: 'paul' })
    const c = await loginAs(app, 'paul')
    const responses = await Promise.all([
      c.get('/api/users'),
      c.post('/api/users', { identifiant: 'x', nom: 'X', role: 'admin' }),
      c.patch(`/api/users/${u.id}`, { role: 'admin' }),
      c.post(`/api/users/${adminId}/disable`),
      c.post(`/api/users/${u.id}/enable`),
      c.post(`/api/users/${adminId}/reset-password`),
    ])
    for (const r of responses) expect(r.statusCode).toBe(403)
  })

  it('ne renvoie jamais de hash dans la liste', async () => {
    const res = await admin.get('/api/users')
    expect(res.statusCode).toBe(200)
    expect(res.body).not.toMatch(/argon2|password_hash|passwordHash/)
  })
})

describe('Création', () => {
  it('crée un compte avec un mot de passe temporaire à changer', async () => {
    const res = await admin.post('/api/users', { identifiant: 'Paul', nom: 'Paul Martin', role: 'atelier' })
    expect(res.statusCode).toBe(201)
    const { tempPassword } = res.json()
    expect(tempPassword).toMatch(/^[A-Za-z0-9]{4}(-[A-Za-z0-9]{4}){3}$/)
    const login = await client(app).post('/api/auth/login', { identifiant: 'paul', password: tempPassword })
    expect(login.statusCode).toBe(200)
    expect(login.json().user).toMatchObject({ nom: 'Paul Martin', mustChangePassword: true, permissions: [] })
    expect(await auditActions(adminId)).toContain('user.created')
  })

  it('refuse un identifiant déjà pris, quelle que soit la casse', async () => {
    await createUser({ identifiant: 'paul' })
    const res = await admin.post('/api/users', { identifiant: 'PAUL', nom: 'Autre', role: 'atelier' })
    expect(res.statusCode).toBe(409)
  })

  it.each([
    [{ identifiant: 'Paul Martin', nom: 'P', role: 'atelier' }, /identifiant/i],
    [{ identifiant: 'ab', nom: 'P', role: 'atelier' }, /identifiant/i],
    [{ identifiant: 'paul', nom: '  ', role: 'atelier' }, /nom/i],
    [{ identifiant: 'paul', nom: 'P', role: 'superadmin' }, /.+/],
  ])('refuse des données invalides (%o)', async (body, msg) => {
    const res = await admin.post('/api/users', body)
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(msg)
  })
})

describe('Modification', () => {
  it('change le rôle et le nom, et le note dans le journal', async () => {
    const u = await createUser({ identifiant: 'paul', nom: 'Paul' })
    const res = await admin.patch(`/api/users/${u.id}`, { role: 'admin', nom: 'Paul Martin' })
    expect(res.statusCode).toBe(200)
    const paul = await loginAs(app, 'paul')
    expect((await paul.get('/api/auth/me')).json().user).toMatchObject({ role: 'admin', nom: 'Paul Martin' })
    expect(await auditActions(adminId)).toContain('user.updated')
  })

  it('empêche de retirer le rôle au dernier administrateur', async () => {
    const res = await admin.patch(`/api/users/${adminId}`, { role: 'atelier' })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/au moins un administrateur/)
  })

  it('répond 404 pour un utilisateur inconnu ou un id invalide', async () => {
    expect((await admin.patch(`/api/users/${UUID}`, { nom: 'X' })).statusCode).toBe(404)
    expect((await admin.patch('/api/users/123', { nom: 'X' })).statusCode).toBe(404)
  })
})

describe('Départ d’un employé', () => {
  it('désactiver déconnecte partout et empêche la connexion', async () => {
    const u = await createUser({ identifiant: 'paul' })
    const paul = await loginAs(app, 'paul')
    expect((await admin.post(`/api/users/${u.id}/disable`)).statusCode).toBe(200)
    expect((await paul.get('/api/auth/me')).statusCode).toBe(401)
    expect((await client(app).post('/api/auth/login', { identifiant: 'paul', password: PASSWORD })).statusCode).toBe(403)
    expect(await auditActions(adminId)).toContain('user.disabled')
  })

  it('réactiver permet de se reconnecter', async () => {
    const u = await createUser({ identifiant: 'paul', disabled: true })
    expect((await admin.post(`/api/users/${u.id}/enable`)).statusCode).toBe(200)
    expect((await client(app).post('/api/auth/login', { identifiant: 'paul', password: PASSWORD })).statusCode).toBe(200)
  })

  it('interdit de se désactiver soi-même', async () => {
    const res = await admin.post(`/api/users/${adminId}/disable`)
    expect(res.statusCode).toBe(400)
  })

  it('permet de désactiver un autre admin tant qu’il en reste un', async () => {
    const other = await createUser({ identifiant: 'adjoint', role: 'admin' })
    expect((await admin.post(`/api/users/${other.id}/disable`)).statusCode).toBe(200)
  })
})

describe('Réinitialisation du mot de passe', () => {
  it('donne un nouveau mot de passe temporaire et déconnecte la personne', async () => {
    const u = await createUser({ identifiant: 'paul' })
    const paul = await loginAs(app, 'paul')
    const res = await admin.post(`/api/users/${u.id}/reset-password`)
    expect(res.statusCode).toBe(200)
    expect((await paul.get('/api/auth/me')).statusCode).toBe(401)
    expect((await client(app).post('/api/auth/login', { identifiant: 'paul', password: PASSWORD })).statusCode).toBe(401)
    const login = await client(app).post('/api/auth/login', { identifiant: 'paul', password: res.json().tempPassword })
    expect(login.json().user.mustChangePassword).toBe(true)
  })

  it('refuse pour son propre compte (il faut passer par « Mon compte »)', async () => {
    expect((await admin.post(`/api/users/${adminId}/reset-password`)).statusCode).toBe(400)
  })
})
