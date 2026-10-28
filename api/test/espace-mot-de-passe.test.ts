import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '../src/db/index.js'
import { auditLog, clientAccounts, clientSessions, clients, emailTokens } from '../src/db/schema.js'
import { env } from '../src/env.js'
import { setTransport, type Transport } from '../src/mail.js'
import { buildApp, client, createUser, loginAs, resetDb, type App, type Client } from './helpers.js'

let app: App
let direction: Client
const sent: Parameters<Transport['sendMail']>[0][] = []

beforeEach(async () => {
  app = await buildApp()
})
afterEach(() => {
  setTransport(null)
  env.SMTP_HOST = undefined
  env.MAIL_FROM = undefined
  sent.length = 0
  return app.close()
})
beforeEach(async () => {
  await resetDb()
  await createUser({ identifiant: 'chef', role: 'direction' })
  direction = await loginAs(app, 'chef')
  sent.length = 0
  env.SMTP_HOST = 'smtp.test'
  env.MAIL_FROM = 'APS <contact@aps.test>'
  setTransport({
    async sendMail(o) {
      sent.push(o)
      return {}
    },
  })
})

const espace = () => client(app, { cookieName: 'aps_client' })
const entries = (action: string) => db.select().from(auditLog).where(eq(auditLog.action, action))
const MDP = 'Plieuse-numerique-2026'
const NOUVEAU = 'Cintreuse-hydraulique-2027'
const signup = (over: Record<string, unknown> = {}) => ({ prenom: 'Jean', nom: 'Dupont', email: 'jean@example.com', password: MDP, consentement: true, ...over })
/** Les e-mails partent en arrière-plan : on attend qu'ils soient là. */
const messages = async (n: number) => {
  await vi.waitFor(() => expect(sent.length).toBeGreaterThanOrEqual(n), { timeout: 3000 })
  return sent
}
const jetonDe = (m: { text: string }) => m.text.match(/jeton=([A-Za-z0-9_-]+)/)![1]!
/** Une fiche créée par l'atelier, sans espace client. */
async function fiche(email = 'jean@example.com') {
  const res = await direction.post('/api/clients', { type: 'particulier', prenom: 'Jean', nom: 'Dupont', email })
  expect(res.statusCode, res.body).toBe(201)
  return res.json().id as string
}
async function membre() {
  const c = espace()
  expect((await c.post('/api/espace/inscription', signup())).statusCode).toBe(201)
  return c
}

describe('Bienvenue', () => {
  it('envoie un message de bienvenue à la création de l’espace, sans publicité', async () => {
    await membre()
    const [m] = await messages(1)
    expect(m).toMatchObject({ to: ['jean@example.com'], subject: expect.stringContaining('Bienvenue') })
    expect(m!.html).toContain('Accéder à mon espace client')
    expect(m!.html).toContain('Nous n’enverrons jamais de publicité')
  })
})

describe('Mot de passe oublié', () => {
  it('envoie un lien valable une heure à l’adresse du compte, et ne garde que son empreinte', async () => {
    await membre()
    await messages(1)
    sent.length = 0
    const res = await espace().post('/api/espace/mot-de-passe-oublie', { email: 'Jean@Example.com' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true })
    const [m] = await messages(1)
    expect(m).toMatchObject({ to: ['jean@example.com'], subject: expect.stringContaining('Réinitialisation de votre mot de passe') })
    expect(m!.html).toContain('Choisir un nouveau mot de passe')
    expect(m!.text).toContain('1 heure')
    const jeton = jetonDe(m!)
    const [t] = await db.select().from(emailTokens)
    expect(t).toMatchObject({ purpose: 'reinitialisation', usedAt: null })
    // Le jeton n'est jamais gardé : l'empreinte n'est pas le jeton
    expect(t!.id).not.toBe(jeton)
    expect(t!.id).toMatch(/^[0-9a-f]{64}$/)
    expect(t!.expiresAt.getTime() - Date.now()).toBeGreaterThan(55 * 60 * 1000)
    expect(t!.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(60 * 60 * 1000)
    expect(await entries('espace.password_reset_requested')).toHaveLength(1)
  })

  it('répond exactement pareil quand l’adresse est inconnue, et n’envoie rien', async () => {
    await membre()
    await messages(1)
    sent.length = 0
    const connue = await espace().post('/api/espace/mot-de-passe-oublie', { email: 'jean@example.com' })
    const inconnue = await espace().post('/api/espace/mot-de-passe-oublie', { email: 'personne@example.com' })
    expect(inconnue.statusCode).toBe(connue.statusCode)
    expect(inconnue.json()).toEqual(connue.json())
    await messages(1)
    await new Promise((r) => setTimeout(r, 200))
    expect(sent).toHaveLength(1)
    expect(sent[0]!.to).toEqual(['jean@example.com'])
  })

  it('n’envoie pas plusieurs messages en moins d’une minute', async () => {
    await membre()
    await messages(1)
    sent.length = 0
    for (let i = 0; i < 3; i++) expect((await espace().post('/api/espace/mot-de-passe-oublie', { email: 'jean@example.com' })).statusCode).toBe(200)
    await messages(1)
    await new Promise((r) => setTimeout(r, 200))
    expect(sent).toHaveLength(1)
    expect(await db.select().from(emailTokens)).toHaveLength(1)
  })

  it('refuse une adresse mal formée, avec le champ concerné', async () => {
    const res = await espace().post('/api/espace/mot-de-passe-oublie', { email: 'pas une adresse' })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toMatchObject({ field: 'email' })
    expect((await espace().post('/api/espace/mot-de-passe-oublie', {})).statusCode).toBe(400)
  })

  it('ne fait rien pour un espace désactivé', async () => {
    await membre()
    await messages(1)
    sent.length = 0
    await db.update(clientAccounts).set({ disabledAt: new Date() })
    expect((await espace().post('/api/espace/mot-de-passe-oublie', { email: 'jean@example.com' })).statusCode).toBe(200)
    await new Promise((r) => setTimeout(r, 200))
    expect(sent).toHaveLength(0)
    expect(await db.select().from(emailTokens)).toHaveLength(0)
  })
})

describe('Choisir un nouveau mot de passe', () => {
  async function demander() {
    const c = await membre()
    await messages(1)
    sent.length = 0
    await espace().post('/api/espace/mot-de-passe-oublie', { email: 'jean@example.com' })
    const [m] = await messages(1)
    return { c, jeton: jetonDe(m!) }
  }

  it('change le mot de passe, déconnecte les appareils, prévient le client, et le lien ne sert qu’une fois', async () => {
    const { c, jeton } = await demander()
    expect((await c.get('/api/espace/session')).json().compte).not.toBeNull()
    sent.length = 0
    const res = await espace().post('/api/espace/nouveau-mot-de-passe', { jeton, password: NOUVEAU })
    expect(res.statusCode, res.body).toBe(200)
    // L'ancienne session est coupée, l'ancien mot de passe refusé, le nouveau accepté
    expect((await c.get('/api/espace/session')).json().compte).toBeNull()
    expect(await db.select().from(clientSessions)).toHaveLength(0)
    expect((await espace().post('/api/espace/connexion', { email: 'jean@example.com', password: MDP })).statusCode).toBe(401)
    expect((await espace().post('/api/espace/connexion', { email: 'jean@example.com', password: NOUVEAU })).statusCode).toBe(200)
    // Le client est prévenu par un message de sécurité
    const [m] = await messages(1)
    expect(m).toMatchObject({ to: ['jean@example.com'], subject: expect.stringContaining('mot de passe a été modifié') })
    expect(m!.html).toContain('Ce n’était pas moi')
    expect(await entries('espace.password_reset')).toHaveLength(1)
    // Un second passage avec le même lien est refusé
    const encore = await espace().post('/api/espace/nouveau-mot-de-passe', { jeton, password: 'Autre-mot-de-passe-2028' })
    expect(encore.statusCode).toBe(400)
    expect(encore.json()).toMatchObject({ field: 'jeton' })
    expect((await db.select().from(clientAccounts))[0]!.passwordChangedAt).not.toBeNull()
  })

  it('refuse un mot de passe trop faible sans consommer le lien', async () => {
    const { jeton } = await demander()
    const faible = await espace().post('/api/espace/nouveau-mot-de-passe', { jeton, password: '12345678' })
    expect(faible.statusCode).toBe(400)
    expect(faible.json()).toMatchObject({ field: 'password' })
    expect((await espace().post('/api/espace/nouveau-mot-de-passe', { jeton, password: NOUVEAU })).statusCode).toBe(200)
  })

  it('refuse un lien expiré, inconnu, mal formé, ou d’un autre usage', async () => {
    const { jeton } = await demander()
    const refus = async (j: string) => {
      const res = await espace().post('/api/espace/nouveau-mot-de-passe', { jeton: j, password: NOUVEAU })
      expect(res.statusCode, j).toBe(400)
      expect(res.json()).toMatchObject({ field: 'jeton' })
    }
    await refus('a'.repeat(43))
    await refus('court')
    await refus('<script>alert(1)</script>')
    await db.update(emailTokens).set({ expiresAt: new Date(Date.now() - 1000) })
    await refus(jeton)
    expect(await espace().post('/api/espace/jeton/verification', { jeton })).toMatchObject({ statusCode: 200 })
    expect((await espace().post('/api/espace/jeton/verification', { jeton })).json()).toEqual({ valide: false })
    // Un lien d'activation ne sert pas à changer un mot de passe
    await db.update(emailTokens).set({ expiresAt: new Date(Date.now() + 60_000), purpose: 'activation' })
    await refus(jeton)
  })

  it('un second lien demandé plus tard remplace le précédent', async () => {
    const { jeton } = await demander()
    await db.update(emailTokens).set({ createdAt: new Date(Date.now() - 5 * 60 * 1000) })
    sent.length = 0
    await espace().post('/api/espace/mot-de-passe-oublie', { email: 'jean@example.com' })
    const [m] = await messages(1)
    const nouveau = jetonDe(m!)
    expect(nouveau).not.toBe(jeton)
    expect((await espace().post('/api/espace/nouveau-mot-de-passe', { jeton, password: NOUVEAU })).statusCode).toBe(400)
    expect((await espace().post('/api/espace/nouveau-mot-de-passe', { jeton: nouveau, password: NOUVEAU })).statusCode).toBe(200)
  })

  it('lève le blocage de connexion après trop d’essais ratés', async () => {
    const { jeton } = await demander()
    for (let i = 0; i < 6; i++) await espace().post('/api/espace/connexion', { email: 'jean@example.com', password: 'mauvais-mot-de-passe' })
    expect((await espace().post('/api/espace/connexion', { email: 'jean@example.com', password: MDP })).statusCode).toBe(429)
    await espace().post('/api/espace/nouveau-mot-de-passe', { jeton, password: NOUVEAU })
    expect((await espace().post('/api/espace/connexion', { email: 'jean@example.com', password: NOUVEAU })).statusCode).toBe(200)
  })
})

describe('Activation d’un espace sur une fiche créée par l’atelier', () => {
  it('envoie un lien d’activation quand quelqu’un s’inscrit avec l’adresse d’une fiche existante, sans créer de doublon', async () => {
    const id = await fiche()
    const res = await espace().post('/api/espace/inscription', signup({ nom: 'Quelqu’un d’autre' }))
    expect(res.statusCode).toBe(409)
    expect(res.json()).toMatchObject({ field: 'email', error: expect.stringContaining('Mot de passe oublié') })
    // Aucun espace n'est créé, la fiche n'est pas modifiée
    expect(await db.select().from(clientAccounts)).toHaveLength(0)
    expect((await db.select().from(clients).where(eq(clients.id, id)))[0]!.nom).toBe('Dupont')
    const [m] = await messages(1)
    expect(m).toMatchObject({ to: ['jean@example.com'], subject: expect.stringContaining('Activez votre espace client') })
    expect(m!.text).toContain('7 jours')
    expect(await entries('espace.activation_sent')).toHaveLength(1)
  })

  it('le lien permet de choisir son mot de passe, rattache l’espace à la fiche existante et connecte le client', async () => {
    const id = await fiche()
    await espace().post('/api/espace/inscription', signup())
    const [m] = await messages(1)
    const jeton = jetonDe(m!)
    expect((await espace().post('/api/espace/jeton/verification', { jeton })).json()).toEqual({ valide: true, objet: 'activation' })
    sent.length = 0
    const c = espace()
    const res = await c.post('/api/espace/activation', { jeton, password: NOUVEAU })
    expect(res.statusCode, res.body).toBe(201)
    expect(res.json().compte).toMatchObject({ nom: 'Dupont', email: 'jean@example.com' })
    // L'espace est bien celui de la fiche existante, et le client est connecté
    expect((await db.select().from(clientAccounts))[0]!.clientId).toBe(id)
    expect((await c.get('/api/espace/session')).json().compte).toMatchObject({ nom: 'Dupont' })
    expect((await messages(1))[0]!.subject).toContain('Bienvenue')
    expect(await entries('espace.activated')).toHaveLength(1)
    // Le lien ne sert qu'une fois
    expect((await espace().post('/api/espace/activation', { jeton, password: NOUVEAU })).statusCode).toBe(400)
    expect((await espace().post('/api/espace/connexion', { email: 'jean@example.com', password: NOUVEAU })).statusCode).toBe(200)
  })

  it('« mot de passe oublié » sur une fiche sans espace envoie aussi un lien d’activation', async () => {
    await fiche()
    expect((await espace().post('/api/espace/mot-de-passe-oublie', { email: 'jean@example.com' })).statusCode).toBe(200)
    const [m] = await messages(1)
    expect(m!.subject).toContain('Activez votre espace client')
    const [t] = await db.select().from(emailTokens)
    expect(t!.purpose).toBe('activation')
    expect(t!.expiresAt.getTime() - Date.now()).toBeGreaterThan(6 * 24 * 60 * 60 * 1000)
  })

  it('une adresse qui a déjà un espace ne peut pas être réclamée : aucun lien d’activation n’est envoyé', async () => {
    await membre()
    await messages(1)
    sent.length = 0
    const res = await espace().post('/api/espace/inscription', signup({ password: 'Un-autre-mot-de-passe-2026' }))
    expect(res.statusCode).toBe(409)
    await new Promise((r) => setTimeout(r, 200))
    expect(sent).toHaveLength(0)
    expect(await db.select().from(emailTokens)).toHaveLength(0)
    // Même message d'erreur que pour une fiche sans espace : on ne révèle pas laquelle des deux situations
    await fiche('autre@example.com')
    const autre = await espace().post('/api/espace/inscription', signup({ email: 'autre@example.com' }))
    expect(autre.statusCode).toBe(res.statusCode)
    expect(autre.json()).toEqual(res.json())
  })

  it('refuse l’activation d’un espace déjà ouvert entre-temps, ou avec un lien de réinitialisation', async () => {
    await fiche()
    await espace().post('/api/espace/inscription', signup())
    const [m] = await messages(1)
    const jeton = jetonDe(m!)
    const [fi] = await db.select().from(clients)
    await db.insert(clientAccounts).values({ clientId: fi!.id, passwordHash: 'x' })
    const res = await espace().post('/api/espace/activation', { jeton, password: NOUVEAU })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toMatchObject({ field: 'jeton' })
    expect(await db.select().from(clientAccounts)).toHaveLength(1)
  })

  it('refuse un mot de passe trop faible à l’activation, sans consommer le lien', async () => {
    await fiche()
    await espace().post('/api/espace/inscription', signup())
    const [m] = await messages(1)
    const jeton = jetonDe(m!)
    const faible = await espace().post('/api/espace/activation', { jeton, password: 'abc' })
    expect(faible.statusCode).toBe(400)
    expect(faible.json()).toMatchObject({ field: 'password' })
    expect((await espace().post('/api/espace/activation', { jeton, password: NOUVEAU })).statusCode).toBe(201)
  })
})
