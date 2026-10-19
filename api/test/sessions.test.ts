import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { auditActions, buildApp, createUser, loginAs, resetDb, type App } from './helpers.js'

let app: App
// Application neuve à chaque test : la limite d'essais par IP repart de zéro
beforeEach(async () => {
  app = await buildApp()
})
afterEach(() => app.close())
beforeEach(resetDb)

const FIREFOX = 'Mozilla/5.0 (X11; Linux x86_64) Firefox/140.0'
const ANDROID = 'Mozilla/5.0 (Linux; Android 15) Chrome/140.0 Mobile'

describe('Appareils connectés', () => {
  it('liste les sessions avec l’appareil et marque celle en cours', async () => {
    await createUser({ identifiant: 'paul' })
    const pc = await loginAs(app, 'paul', undefined, { userAgent: FIREFOX })
    await loginAs(app, 'paul', undefined, { userAgent: ANDROID, remember: true })
    const list = (await pc.get('/api/auth/sessions')).json().sessions
    expect(list).toHaveLength(2)
    const current = list.find((s: { current: boolean }) => s.current)
    expect(current.device).toBe('Firefox sur Linux')
    expect(list.find((s: { current: boolean }) => !s.current)).toMatchObject({ device: 'Chrome sur Android', remember: true })
  })

  it('déconnecte un autre appareil', async () => {
    const u = await createUser({ identifiant: 'paul' })
    const pc = await loginAs(app, 'paul')
    const phone = await loginAs(app, 'paul', undefined, { userAgent: ANDROID })
    const other = (await pc.get('/api/auth/sessions')).json().sessions.find((s: { current: boolean }) => !s.current)
    expect((await pc.delete(`/api/auth/sessions/${other.id}`)).statusCode).toBe(204)
    expect((await phone.get('/api/auth/me')).statusCode).toBe(401)
    expect(await auditActions(u.id)).toContain('session.revoked')
  })

  it('ne permet pas de fermer la session en cours par cette route', async () => {
    await createUser({ identifiant: 'paul' })
    const pc = await loginAs(app, 'paul')
    const mine = (await pc.get('/api/auth/sessions')).json().sessions[0]
    expect((await pc.delete(`/api/auth/sessions/${mine.id}`)).statusCode).toBe(404)
    expect((await pc.get('/api/auth/me')).statusCode).toBe(200)
  })

  it('ne permet pas de fermer la session de quelqu’un d’autre', async () => {
    await createUser({ identifiant: 'paul' })
    await createUser({ identifiant: 'marie' })
    const paul = await loginAs(app, 'paul')
    const marie = await loginAs(app, 'marie')
    const marieSession = (await marie.get('/api/auth/sessions')).json().sessions[0]
    expect((await paul.delete(`/api/auth/sessions/${marieSession.id}`)).statusCode).toBe(404)
    expect((await marie.get('/api/auth/me')).statusCode).toBe(200)
  })

  it('répond 404 pour un identifiant de session invalide', async () => {
    await createUser({ identifiant: 'paul' })
    const pc = await loginAs(app, 'paul')
    expect((await pc.delete('/api/auth/sessions/pas-un-uuid')).statusCode).toBe(404)
  })

  it('déconnecte tous les autres appareils d’un coup', async () => {
    await createUser({ identifiant: 'paul' })
    const pc = await loginAs(app, 'paul')
    const a = await loginAs(app, 'paul')
    const b = await loginAs(app, 'paul')
    expect((await pc.delete('/api/auth/sessions')).json().closedSessions).toBe(2)
    expect((await a.get('/api/auth/me')).statusCode).toBe(401)
    expect((await b.get('/api/auth/me')).statusCode).toBe(401)
    expect((await pc.get('/api/auth/me')).statusCode).toBe(200)
  })
})
