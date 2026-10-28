import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from '../src/db/index.js'
import { auditLog, billingDocuments, clientAccounts, clientSessions, clients, colors, loginAttempts, materials, orders, contactRequests } from '../src/db/schema.js'
import { env } from '../src/env.js'
import { setTransport, type Transport } from '../src/mail.js'
import { buildApp, client, createUser, loginAs, M, PASSWORD, resetDb, seedModels, type App, type Client } from './helpers.js'

let app: App
let direction: Client
let visitor: Client
let ids: { alu: string; anthracite: string }
const mailSent: Parameters<Transport['sendMail']>[0][] = []

beforeEach(async () => {
  app = await buildApp()
})
afterEach(() => {
  vi.useRealTimers()
  setTransport(null)
  env.SMTP_HOST = undefined
  env.MAIL_FROM = undefined
  env.MAIL_ALERT_TO = undefined
  mailSent.length = 0
  return app.close()
})
beforeEach(async () => {
  await resetDb()
  await seedModels()
  await createUser({ identifiant: 'chef', role: 'direction' })
  direction = await loginAs(app, 'chef')
  visitor = espace()
  const [alu] = await db.insert(materials).values({ nom: 'Aluminium', epaisseur: 1.5, prixM2: 62, retourMin: 10 }).returning()
  const [anthracite] = await db.insert(colors).values({ nom: 'Gris anthracite', reference: 'RAL 7016', hex: '#383e42' }).returning()
  ids = { alu: alu!.id, anthracite: anthracite!.id }
})

const espace = () => client(app, { cookieName: 'aps_client' })
const entries = (action: string) => db.select().from(auditLog).where(eq(auditLog.action, action))
const mailOn = () => {
  env.SMTP_HOST = 'smtp.test'
  env.MAIL_FROM = 'APS <contact@aps.test>'
  env.MAIL_ALERT_TO = 'direction@aps.test'
  setTransport({
    async sendMail(o) {
      mailSent.push(o)
      return {}
    },
  })
}
const signup = (over: Record<string, unknown> = {}) => ({
  prenom: 'Jean',
  nom: 'Dupont',
  email: 'Jean@Example.com',
  telephone: '06 12 34 56 78',
  password: 'Plieuse-numerique-2026',
  consentement: true,
  ...over,
})
/** Un client avec son espace, déjà connecté. */
async function member(over: Record<string, unknown> = {}) {
  const c = espace()
  const res = await c.post('/api/espace/inscription', signup(over))
  expect(res.statusCode, res.body).toBe(201)
  return c
}
const piece = (over: Record<string, unknown> = {}) => ({
  repere: 'Mur sud',
  modelId: M.couvertine,
  materialId: ids.alu,
  colorId: ids.anthracite,
  cotes: [20, 70, 300, 70, 20],
  angles: [135, 90, 90, 135],
  longueur: 3000,
  quantite: 4,
  accessoires: [],
  ...over,
})
const config = (over: Record<string, unknown> = {}) => ({ lignes: [piece()], livraison: { mode: 'retrait' }, ...over })
async function demander(c: Client, over: Record<string, unknown> = {}) {
  const res = await c.post('/api/espace/devis', config(over))
  expect(res.statusCode, res.body).toBe(201)
  return res.json() as { id: string; numero: string; devis: { id: string; numero: string } | null }
}

describe('Création du compte', () => {
  it('crée la fiche client, le compte et la session, sans jamais stocker le mot de passe ni le jeton en clair', async () => {
    const res = await visitor.post('/api/espace/inscription', signup())
    expect(res.statusCode, res.body).toBe(201)
    expect(res.json().compte).toEqual({ prenom: 'Jean', nom: 'Dupont', email: 'jean@example.com', telephone: '06 12 34 56 78', type: 'particulier', proVerifie: false })
    expect(res.body).not.toMatch(/password|hash/i)
    const [c] = await db.select().from(clients)
    expect(c).toMatchObject({ type: 'particulier', origine: 'site', email: 'jean@example.com' })
    const [a] = await db.select().from(clientAccounts)
    expect(a!.clientId).toBe(c!.id)
    expect(a!.passwordHash).toMatch(/^\$argon2id\$/)
    const token = visitor.cookie.split('=')[1]!
    const [s] = await db.select().from(clientSessions)
    expect(s!.id).toBe(createHash('sha256').update(token).digest('hex'))
    // La session est active tout de suite
    expect((await visitor.get('/api/espace/session')).json().compte).toMatchObject({ email: 'jean@example.com' })
    const [e] = await entries('espace.registered')
    expect(e).toMatchObject({ userId: null, targetType: 'client', targetId: c!.id })
    expect(JSON.stringify(e!.details)).not.toContain('Plieuse')
  })

  it('valide les champs : nom, e-mail, mot de passe, consentement', async () => {
    const post = (o: Record<string, unknown>) => visitor.post('/api/espace/inscription', signup(o))
    expect((await post({ nom: '' })).json()).toMatchObject({ field: 'nom' })
    expect((await post({ email: 'pas-un-mail' })).json()).toMatchObject({ field: 'email' })
    expect((await post({ telephone: 'abc' })).json()).toMatchObject({ field: 'telephone' })
    expect((await post({ consentement: false })).json()).toMatchObject({ field: 'consentement' })
    expect((await post({ password: 'court' })).json()).toMatchObject({ field: 'password', error: expect.stringMatching(/au moins 12/) })
    expect((await post({ password: 'motdepasse123' })).json()).toMatchObject({ field: 'password' })
    expect(await db.select().from(clientAccounts)).toHaveLength(0)
    expect(await db.select().from(clients)).toHaveLength(0)
  })

  it('ignore les robots (champ caché rempli)', async () => {
    expect((await visitor.post('/api/espace/inscription', signup({ site: 'http://spam.example' }))).statusCode).toBe(201)
    expect(await db.select().from(clients)).toHaveLength(0)
    expect(visitor.cookie).toBe('')
  })

  it('refuse une adresse déjà connue, qu’elle ait un compte ou seulement une fiche de l’atelier, avec le même message', async () => {
    await member()
    const again = await espace().post('/api/espace/inscription', signup({ email: 'JEAN@example.com' }))
    expect(again.statusCode).toBe(409)
    await direction.post('/api/clients', { type: 'particulier', prenom: 'Marie', nom: 'Martin', email: 'marie@example.com' })
    const known = await espace().post('/api/espace/inscription', signup({ email: 'marie@example.com' }))
    expect(known.statusCode).toBe(409)
    expect(known.json()).toEqual(again.json())
    // Aucun accès aux données d'une fiche existante sans preuve de l'adresse
    expect(await db.select().from(clientAccounts)).toHaveLength(1)
  })

  it('limite les créations de compte par adresse IP', async () => {
    env.CONTACT_RATE_LIMIT = 2
    const limited = await buildApp()
    try {
      const c = client(limited, { cookieName: 'aps_client' })
      for (let i = 0; i < 2; i++) expect((await c.post('/api/espace/inscription', signup({ email: `a${i}@example.com` }))).statusCode).toBe(201)
      expect((await c.post('/api/espace/inscription', signup({ email: 'a3@example.com' }))).statusCode).toBe(429)
    } finally {
      env.CONTACT_RATE_LIMIT = 20
      await limited.close()
    }
  })
})

describe('Particulier ou professionnel, et mes informations', () => {
  it('à la création : particulier par défaut, ou professionnel avec sa raison sociale obligatoire, jamais reconnu d’office', async () => {
    const p = await member()
    expect((await p.get('/api/espace/session')).json().compte).toMatchObject({ type: 'particulier', proVerifie: false })
    expect((await espace().post('/api/espace/inscription', signup({ email: 'pro@example.com', type: 'professionnel' }))).json()).toMatchObject({
      field: 'raisonSociale',
      error: expect.stringContaining('raison sociale'),
    })
    expect((await espace().post('/api/espace/inscription', signup({ email: 'x@example.com', type: 'artisan' }))).json().field).toBe('type')
    const pro = espace()
    const res = await pro.post('/api/espace/inscription', signup({ email: 'pro@example.com', type: 'professionnel', raisonSociale: 'Toitures du Forez' }))
    expect(res.statusCode, res.body).toBe(201)
    expect(res.json().compte).toMatchObject({ type: 'professionnel', proVerifie: false })
    const [fiche] = await db.select().from(clients).where(eq(clients.email, 'pro@example.com'))
    expect(fiche).toMatchObject({ type: 'professionnel', raisonSociale: 'Toitures du Forez', proVerifie: false, origine: 'site' })
    // Un particulier n'enregistre pas de raison sociale, même envoyée
    await espace().post('/api/espace/inscription', signup({ email: 'part@example.com', raisonSociale: 'Ignorée' }))
    expect((await db.select().from(clients).where(eq(clients.email, 'part@example.com')))[0]!.raisonSociale).toBeNull()
    expect((await entries('espace.registered')).map((e) => (e.details as { type: string }).type).sort()).toEqual(['particulier', 'particulier', 'professionnel'])
  })

  it('un professionnel déclaré n’a pas la remise pro tant que l’atelier ne l’a pas validé', async () => {
    const pro = await member({ email: 'pro@example.com', type: 'professionnel', raisonSociale: 'Toitures du Forez' })
    const plein = (await pro.post('/api/espace/devis', config({ lignes: [piece({ quantite: 1 })] }))).json()
    const [avant] = await db.select().from(orders).where(eq(orders.id, plein.id))
    expect(avant!.remisePro).toBe(0)
    const [fiche] = await db.select().from(clients).where(eq(clients.email, 'pro@example.com'))
    expect((await direction.patch(`/api/clients/${fiche!.id}`, { proVerifie: true })).statusCode).toBe(200)
    const remise = (await pro.post('/api/espace/devis', config({ lignes: [piece({ quantite: 1 })] }))).json()
    const [apres] = await db.select().from(orders).where(eq(orders.id, remise.id))
    expect(apres!.remisePro).toBeGreaterThan(0)
    expect((await pro.get('/api/espace/session')).json().compte.proVerifie).toBe(true)
  })

  it('lit et modifie ses informations (adresse, téléphone, SIRET), sans pouvoir changer d’e-mail ni de droits', async () => {
    const c = await member()
    expect((await espace().get('/api/espace/profil')).statusCode).toBe(401)
    expect((await c.get('/api/espace/profil')).json().profil).toMatchObject({ type: 'particulier', prenom: 'Jean', nom: 'Dupont', email: 'jean@example.com', adresse: null })
    const res = await c.patch('/api/espace/profil', {
      adresse: '3 rue des Lilas',
      codePostal: '42490',
      ville: 'Fraisses',
      telephone: '06 11 22 33 44',
      email: 'autre@example.com',
      proVerifie: true,
      notes: 'x',
    })
    expect(res.statusCode, res.body).toBe(200)
    const [fiche] = await db.select().from(clients)
    expect(fiche).toMatchObject({ adresse: '3 rue des Lilas', codePostal: '42490', ville: 'Fraisses', email: 'jean@example.com', proVerifie: false, notes: null })
    expect((await entries('espace.profile_updated'))[0]!.details).toMatchObject({ champs: ['téléphone', 'adresse', 'code postal', 'ville'] })
    // Aucune donnée sensible dans la réponse
    expect(res.body).not.toMatch(/passwordHash|notes|origine/)
  })

  it('passer professionnel exige la raison sociale et ne donne pas la remise ; repasser particulier efface les champs pro', async () => {
    const c = await member()
    const bad = await c.patch('/api/espace/profil', { type: 'professionnel' })
    expect(bad.statusCode).toBe(400)
    expect(bad.json().field).toBe('raisonSociale')
    const ok = await c.patch('/api/espace/profil', { type: 'professionnel', raisonSociale: 'Zinguerie Ondaine', siret: '73282932000074', tvaIntra: 'FR12345678901' })
    expect(ok.statusCode, ok.body).toBe(200)
    expect(ok.json().profil).toMatchObject({ type: 'professionnel', raisonSociale: 'Zinguerie Ondaine', proVerifie: false })
    expect((await c.patch('/api/espace/profil', { siret: '12345678901234' })).json().field).toBe('siret')
    expect((await c.patch('/api/espace/profil', { codePostal: '4249' })).json().field).toBe('codePostal')
    const back = await c.patch('/api/espace/profil', { type: 'particulier' })
    expect(back.json().profil).toMatchObject({ type: 'particulier', raisonSociale: null, siret: null, tvaIntra: null, proVerifie: false })
    expect((await c.patch('/api/espace/profil', { nom: '' })).json().field).toBe('nom')
  })

  it('la direction valide ou retire le statut professionnel, noté au journal ; une fiche créée par l’atelier est reconnue d’office', async () => {
    const id = (await direction.post('/api/clients', { type: 'professionnel', raisonSociale: 'Atelier pro' })).json().id
    expect((await db.select().from(clients).where(eq(clients.id, id)))[0]!.proVerifie).toBe(true)
    expect((await direction.patch(`/api/clients/${id}`, { proVerifie: false })).statusCode).toBe(200)
    expect((await db.select().from(clients).where(eq(clients.id, id)))[0]!.proVerifie).toBe(false)
    const part = (await direction.post('/api/clients', { type: 'particulier', nom: 'Martin' })).json().id
    await direction.patch(`/api/clients/${part}`, { proVerifie: true })
    expect((await db.select().from(clients).where(eq(clients.id, part)))[0]!.proVerifie).toBe(false)
    // Un particulier de l'atelier qui passe professionnel l'est d'office
    await direction.patch(`/api/clients/${part}`, { type: 'professionnel', raisonSociale: 'Martin SARL' })
    expect((await db.select().from(clients).where(eq(clients.id, part)))[0]!.proVerifie).toBe(true)
    expect((await entries('client.updated')).some((e) => JSON.stringify(e.details).includes('statut professionnel'))).toBe(true)
  })
})

describe('Connexion', () => {
  it('connecte avec l’adresse e-mail (casse ignorée) et se déconnecte', async () => {
    await member()
    const c = espace()
    const res = await c.post('/api/espace/connexion', { email: 'JEAN@example.com', password: 'Plieuse-numerique-2026' })
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json().compte).toMatchObject({ email: 'jean@example.com' })
    expect((await c.get('/api/espace/commandes')).statusCode).toBe(200)
    expect((await entries('espace.login')).length).toBe(1)
    expect((await c.post('/api/espace/deconnexion')).statusCode).toBe(204)
    expect((await c.get('/api/espace/commandes')).statusCode).toBe(401)
    expect((await c.get('/api/espace/session')).json()).toEqual({ compte: null })
  })

  it('refuse un mauvais mot de passe ou une adresse inconnue avec le même message, puis bloque après 5 échecs', async () => {
    env.LOGIN_DELAY_BASE_MS = 0
    await member()
    const c = espace()
    const bad = await c.post('/api/espace/connexion', { email: 'jean@example.com', password: 'mauvais-mot-de-passe' })
    const unknown = await c.post('/api/espace/connexion', { email: 'inconnu@example.com', password: 'mauvais-mot-de-passe' })
    expect(bad.statusCode).toBe(401)
    expect(unknown.statusCode).toBe(401)
    expect(bad.json().error.split('.')[0]).toBe(unknown.json().error.split('.')[0])
    for (let i = 0; i < 4; i++) await c.post('/api/espace/connexion', { email: 'jean@example.com', password: 'mauvais-mot-de-passe' })
    const locked = await c.post('/api/espace/connexion', { email: 'jean@example.com', password: 'Plieuse-numerique-2026' })
    expect(locked.statusCode).toBe(429)
    expect(await entries('espace.login_failed')).not.toHaveLength(0)
    await db.delete(loginAttempts)
  })

  it('refuse un espace désactivé, et coupe la session en cours', async () => {
    const c = await member()
    await db.update(clientAccounts).set({ disabledAt: new Date() })
    expect((await c.get('/api/espace/commandes')).statusCode).toBe(401)
    const res = await espace().post('/api/espace/connexion', { email: 'jean@example.com', password: 'Plieuse-numerique-2026' })
    expect(res.statusCode).toBe(403)
  })

  it('sépare l’espace client de l’atelier : aucun des deux cookies n’ouvre l’autre', async () => {
    const c = await member()
    for (const url of ['/api/auth/me', '/api/clients', '/api/orders', '/api/billing', '/api/production/orders']) expect((await c.get(url)).statusCode, url).toBe(401)
    // Le cookie de l'atelier ne donne pas accès à l'espace client
    const staff = client(app, { cookieName: 'aps_session' })
    await staff.post('/api/auth/login', { identifiant: 'chef', password: PASSWORD })
    expect((await staff.get('/api/espace/commandes')).statusCode).toBe(401)
    expect((await staff.get('/api/espace/session')).json().compte).toBeNull()
  })
})

describe('Fermeture du compte', () => {
  it('exige une session et le mot de passe', async () => {
    expect((await espace().post('/api/espace/compte/fermeture', { password: 'x' })).statusCode).toBe(401)
    const c = await member()
    expect((await c.post('/api/espace/compte/fermeture', {})).statusCode).toBe(400)
    const bad = await c.post('/api/espace/compte/fermeture', { password: 'Mauvais-mot-de-passe-1' })
    expect(bad.statusCode).toBe(403)
    expect(bad.json().field).toBe('password')
    expect((await c.get('/api/espace/session')).json().compte).not.toBeNull()
  })

  it('refuse tant qu’une commande est en cours', async () => {
    const c = await member()
    await demander(c)
    const res = await c.post('/api/espace/compte/fermeture', { password: 'Plieuse-numerique-2026' })
    expect(res.statusCode).toBe(409)
    expect(res.json().error).toContain('en cours')
  })

  it('anonymise la fiche, garde les factures, coupe la session et le note au journal', async () => {
    const c = await member()
    const o = await demander(c, { notes: 'Note du client' })
    await direction.post(`/api/orders/${o.id}/status`, { statut: 'annulee', note: 'Client injoignable' })
    const res = await c.post('/api/espace/compte/fermeture', { password: 'Plieuse-numerique-2026' })
    expect(res.statusCode, res.body).toBe(204)

    const [fiche] = await db.select().from(clients).where(eq(clients.email, 'jean@example.com'))
    expect(fiche).toBeUndefined()
    const [anon] = await db.select().from(clients)
    expect(anon).toMatchObject({ nom: 'Client supprimé', prenom: null, email: null, telephone: null })
    expect(anon!.archivedAt).not.toBeNull()
    expect(await db.select().from(clientAccounts)).toHaveLength(0)
    expect(await db.select().from(clientSessions)).toHaveLength(0)
    const [cmd] = await db.select().from(orders)
    expect(cmd!.notes).toBeNull()
    // Le devis émis est conservé tel quel
    expect(await db.select().from(billingDocuments)).toHaveLength(1)
    expect((await c.get('/api/espace/commandes')).statusCode).toBe(401)
    expect(JSON.stringify(await db.select().from(auditLog))).not.toContain('Jean Dupont')
    const [closed] = await entries('espace.account_closed')
    expect(closed).toMatchObject({ targetId: anon!.id })
  })

  it('libère l’adresse e-mail et efface les demandes de contact de cette adresse', async () => {
    const c = await member()
    await db.insert(contactRequests).values({ nom: 'Jean Dupont', email: 'jean@example.com', telephone: '0612345678', objet: 'Question', message: 'Mon adresse est 3 rue X' })
    expect((await c.post('/api/espace/compte/fermeture', { password: 'Plieuse-numerique-2026' })).statusCode).toBe(204)
    const [req] = await db.select().from(contactRequests)
    expect(req).toMatchObject({ nom: 'Client supprimé', telephone: null, message: '[supprimé]' })
    // Elle peut recréer un espace avec la même adresse
    expect((await espace().post('/api/espace/inscription', signup())).statusCode).toBe(201)
  })
})

describe('Demander un devis', () => {
  it('exige un compte', async () => {
    expect((await visitor.post('/api/espace/devis', config())).statusCode).toBe(401)
    expect(await db.select().from(orders)).toHaveLength(0)
  })

  it('crée la commande et le devis PDF numéroté tout de suite, au prix du configurateur, et prévient la direction', async () => {
    mailOn()
    const c = await member()
    // Le message de bienvenue part en arrière-plan : on l'attend, puis on ne garde que l'alerte à la direction
    await vi.waitFor(() => expect(mailSent.map((m) => m.subject).join()).toContain('Bienvenue'))
    mailSent.length = 0
    const expected = (await visitor.post('/api/public/configurateur/chiffrage', config())).json().totals
    // Le client ne peut pas imposer son prix ni son client
    const res = await c.post('/api/espace/devis', { ...config(), ttc: 1, clientId: '00000000-0000-4000-8000-000000000000' })
    expect(res.statusCode, res.body).toBe(201)
    const { id, numero, devis } = res.json()
    expect(numero).toMatch(/^C-\d{4}-\d{4}$/)
    expect(devis.numero).toMatch(/^D-\d{4}-\d{4}$/)
    const [o] = await db.select().from(orders)
    expect(o).toMatchObject({ id, statut: 'recue', ttc: expected.ttc, ht: expected.ht, createdBy: null })
    const [client0] = await db.select().from(clients)
    expect(o!.clientId).toBe(client0!.id)
    const [d] = await db.select().from(billingDocuments)
    expect(d).toMatchObject({ type: 'devis', orderId: id, createdBy: null })
    expect(d!.pdf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(mailSent).toHaveLength(1)
    expect(mailSent[0]!.to).toEqual(['direction@aps.test'])
    expect(mailSent[0]!.subject).toContain('Jean Dupont')
    expect(mailSent[0]!.text).toContain(numero)
    expect(mailSent[0]!.text).toContain(devis.numero)
    // La direction retrouve la commande dans l'atelier
    expect((await direction.get(`/api/orders/${id}`)).json().order.numero).toBe(numero)
    const [e] = await entries('order.created')
    expect(e).toMatchObject({ userId: null, targetId: id })
    expect(e!.details).toMatchObject({ origine: 'espace', numero })
    expect((await entries('billing.devis_created'))[0]!.details).toMatchObject({ numero: devis.numero, origine: 'espace' })
  })

  it('refuse ce que la plieuse ne sait pas faire, avec le champ concerné', async () => {
    const c = await member()
    const bad = async (body: object) => (await c.post('/api/espace/devis', body)).json()
    expect(await bad(config({ lignes: [piece({ longueur: 99999 })] }))).toMatchObject({ field: expect.stringMatching(/^lignes\.0\.longueur/) })
    expect(await bad(config({ lignes: [] }))).toMatchObject({ error: expect.stringMatching(/au moins une pièce/) })
    expect(await bad({})).toMatchObject({ error: expect.any(String) })
    expect(await db.select().from(orders)).toHaveLength(0)
  })

  it('garde la précision du client, et limite à 10 devis par jour', async () => {
    const c = await member()
    const first = await demander(c, { notes: 'Pose prévue en mars.' })
    expect((await direction.get(`/api/orders/${first.id}`)).json().order.notes).toBe('Pose prévue en mars.')
    for (let i = 1; i < 10; i++) await demander(c)
    const res = await c.post('/api/espace/devis', config())
    expect(res.statusCode).toBe(429)
    expect(res.json().error).toMatch(/10 devis/)
    expect(await db.select().from(orders)).toHaveLength(10)
  })
})

describe('Commandes et suivi', () => {
  it('liste les commandes du client avec leur étape, et le suivi avance quand l’atelier valide', async () => {
    const c = await member()
    const o = await demander(c)
    let list = (await c.get('/api/espace/commandes')).json().commandes
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ id: o.id, numero: o.numero, statut: 'recue', statutLabel: 'Reçue', devis: { numero: o.devis!.numero, statut: expect.stringMatching(/^emis/) }, facture: null })

    expect((await direction.post(`/api/orders/${o.id}/status`, { statut: 'validee', note: 'Vérifié avec le client, cote B à confirmer.' })).statusCode).toBe(200)
    expect((await direction.post(`/api/orders/${o.id}/status`, { statut: 'fabrication' })).statusCode).toBe(200)
    const detail = (await c.get(`/api/espace/commandes/${o.id}`)).json()
    expect(detail.commande).toMatchObject({ numero: o.numero, statut: 'fabrication', statutLabel: 'En fabrication' })
    expect(detail.commande.datePrevue).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(detail.etapes.map((e: { statut: string }) => e.statut)).toEqual(['recue', 'validee', 'fabrication'])
    expect(detail.lignes[0]).toMatchObject({ repere: 'Mur sud', modeleLabel: 'Couvertine', cotes: [20, 70, 300, 70, 20], quantite: 4 })
    expect(detail.documents[0]).toMatchObject({ type: 'devis', numero: o.devis!.numero })
    list = (await c.get('/api/espace/commandes')).json().commandes
    expect(list[0]).toMatchObject({ statut: 'fabrication' })
  })

  it('ne montre ni notes internes, ni nom de salarié, ni donnée d’un autre client', async () => {
    const c = await member()
    const o = await demander(c, { notes: 'Note du client' })
    await direction.post(`/api/orders/${o.id}/status`, { statut: 'validee', note: 'SECRET INTERNE' })
    const res = await c.get(`/api/espace/commandes/${o.id}`)
    expect(res.body).not.toMatch(/SECRET INTERNE|Note du client|Utilisateur|chef|createdBy|passwordHash/)
    // Une autre cliente ne voit rien
    const marie = await member({ email: 'marie@example.com', prenom: 'Marie', nom: 'Martin' })
    expect((await marie.get('/api/espace/commandes')).json().commandes).toEqual([])
    expect((await marie.get(`/api/espace/commandes/${o.id}`)).statusCode).toBe(404)
    expect((await marie.get(`/api/espace/documents/${o.devis!.id}/pdf`)).statusCode).toBe(404)
    expect((await marie.post(`/api/espace/documents/${o.devis!.id}/reponse`, { reponse: 'accepte' })).statusCode).toBe(404)
    expect((await c.get('/api/espace/commandes/pas-un-uuid')).statusCode).toBe(404)
  })

  it('télécharge le PDF du devis, en le notant au journal', async () => {
    const c = await member()
    const o = await demander(c)
    const res = await c.get(`/api/espace/documents/${o.devis!.id}/pdf`)
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('application/pdf')
    expect(res.headers['content-disposition']).toContain(`${o.devis!.numero}.pdf`)
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.rawPayload.subarray(0, 5).toString()).toBe('%PDF-')
    expect((await entries('espace.document_downloaded')).length).toBe(1)
  })

  it('voit la facture une fois émise par l’atelier', async () => {
    const c = await member()
    const o = await demander(c)
    await direction.post(`/api/orders/${o.id}/status`, { statut: 'validee' })
    const f = await direction.post(`/api/billing/orders/${o.id}/facture`)
    expect(f.statusCode, f.body).toBe(201)
    const list = (await c.get('/api/espace/commandes')).json().commandes
    expect(list[0].facture).toMatchObject({ numero: f.json().numero })
    expect((await c.get(`/api/espace/documents/${f.json().id}/pdf`)).statusCode).toBe(200)
  })
})

describe('Réponse au devis', () => {
  it('accepte le devis : l’atelier est prévenu et valide ensuite la commande', async () => {
    mailOn()
    const c = await member()
    const o = await demander(c)
    mailSent.length = 0
    const res = await c.post(`/api/espace/documents/${o.devis!.id}/reponse`, { reponse: 'accepte' })
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json()).toEqual({ statut: 'accepte' })
    const [d] = await db.select().from(billingDocuments)
    expect(d).toMatchObject({ reponse: 'accepte' })
    expect(d!.reponseLe).not.toBeNull()
    // L'acceptation ne lance pas la fabrication
    expect((await db.select().from(orders))[0]!.statut).toBe('recue')
    expect(mailSent).toHaveLength(1)
    expect(mailSent[0]!.subject).toContain('accepté')
    expect((await entries('espace.devis_answered'))[0]!.details).toMatchObject({ reponse: 'accepte', numero: o.devis!.numero })
    const detail = (await c.get(`/api/espace/commandes/${o.id}`)).json()
    expect(detail.documents[0].statut).toBe('accepte')
    expect((await c.post(`/api/espace/documents/${o.devis!.id}/reponse`, { reponse: 'refuse' })).statusCode).toBe(409)
  })

  it('refuse le devis, valide la réponse, et ne répond pas à autre chose qu’un devis', async () => {
    const c = await member()
    const o = await demander(c)
    expect((await c.post(`/api/espace/documents/${o.devis!.id}/reponse`, { reponse: 'peut-etre' })).statusCode).toBe(400)
    expect((await c.post(`/api/espace/documents/${o.devis!.id}/reponse`, { reponse: 'refuse' })).json()).toEqual({ statut: 'refuse' })
    await direction.post(`/api/orders/${o.id}/status`, { statut: 'validee' })
    const f = await direction.post(`/api/billing/orders/${o.id}/facture`)
    const res = await c.post(`/api/espace/documents/${f.json().id}/reponse`, { reponse: 'accepte' })
    expect(res.statusCode).toBe(409)
  })

  it('refuse d’accepter un devis expiré ou une commande annulée', async () => {
    const c = await member()
    const o = await demander(c)
    const o2 = await demander(c)
    await direction.post(`/api/orders/${o2.id}/status`, { statut: 'annulee', note: 'Abandon' })
    expect((await c.post(`/api/espace/documents/${o2.devis!.id}/reponse`, { reponse: 'accepte' })).json().error).toMatch(/annulée/)
    // Un an plus tard : la session a expiré, le devis aussi (on peut encore le refuser)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(Date.now() + 400 * 86_400_000))
    const later = espace()
    expect((await later.post('/api/espace/connexion', { email: 'jean@example.com', password: 'Plieuse-numerique-2026' })).statusCode).toBe(200)
    const res = await later.post(`/api/espace/documents/${o.devis!.id}/reponse`, { reponse: 'accepte' })
    expect(res.statusCode).toBe(409)
    expect(res.json().error).toMatch(/expiré/)
    expect((await later.post(`/api/espace/documents/${o.devis!.id}/reponse`, { reponse: 'refuse' })).statusCode).toBe(200)
  })
})
