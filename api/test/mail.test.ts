import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '../src/db/index.js'
import { accessories, auditLog, billingDocuments, colors, contactRequests, emailLog, materials } from '../src/db/schema.js'
import { env } from '../src/env.js'
import { isMailConfigured, setTransport, type Transport } from '../src/mail.js'
import { buildApp, client, createUser, loginAs, M, resetDb, seedModels, type App, type Client } from './helpers.js'

let app: App
let direction: Client
let visitor: Client
type Sent = Parameters<Transport['sendMail']>[0]
let sent: Sent[]
let failWith: unknown = null

beforeEach(async () => {
  app = await buildApp()
})
afterEach(() => {
  setTransport(null)
  env.SMTP_HOST = undefined
  env.MAIL_FROM = undefined
  env.MAIL_ALERT_TO = undefined
  failWith = null
  vi.restoreAllMocks()
  return app.close()
})
beforeEach(async () => {
  await resetDb()
  await seedModels()
  await createUser({ identifiant: 'chef', role: 'direction' })
  direction = await loginAs(app, 'chef')
  visitor = client(app)
  sent = []
})

/** Active l'envoi avec un faux serveur qui garde les messages (ou échoue si on le demande). */
function mailOn(over: { alertTo?: string } = {}) {
  env.SMTP_HOST = 'smtp.test'
  env.MAIL_FROM = 'Alu Pliage Service <contact@aps.test>'
  env.MAIL_ALERT_TO = over.alertTo
  setTransport({
    async sendMail(options) {
      if (failWith) throw failWith
      sent.push(options)
      return {}
    },
  })
}
const entries = (action: string) => db.select().from(auditLog).where(eq(auditLog.action, action))
const log = () => db.select().from(emailLog).orderBy(emailLog.at)
const contact = (over: Record<string, unknown> = {}) => ({ nom: 'Jean Dupont', email: 'jean@example.com', objet: 'Couvertine 3 m', message: 'Bonjour, un devis svp.', consentement: true, telephone: '06 12 34 56 78', ...over })
const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n')

describe('Configuration', () => {
  it('est désactivée sans serveur ni expéditeur', () => {
    expect(isMailConfigured()).toBe(false)
    env.SMTP_HOST = 'smtp.test'
    expect(isMailConfigured()).toBe(false)
    env.MAIL_FROM = 'a@b.test'
    expect(isMailConfigured()).toBe(true)
  })

  it('donne l’état de la messagerie à la direction seulement, sans aucun secret', async () => {
    mailOn({ alertTo: 'direction@aps.test, compta@aps.test' })
    env.SMTP_PASSWORD = 'mot-de-passe-secret'
    const res = await direction.get('/api/mail/status')
    expect(res.json()).toMatchObject({ configure: true, expediteur: 'Alu Pliage Service <contact@aps.test>', alertes: ['direction@aps.test', 'compta@aps.test'] })
    expect(res.body).not.toContain('mot-de-passe-secret')
    expect(res.body).not.toContain('smtp.test')
    env.SMTP_PASSWORD = undefined
    expect((await visitor.get('/api/mail/status')).statusCode).toBe(401)
    await createUser({ identifiant: 'paul', role: 'atelier' })
    expect((await (await loginAs(app, 'paul')).get('/api/mail/status')).statusCode).toBe(403)
  })

  it('utilise l’e-mail de l’entreprise quand aucune adresse d’alerte n’est fixée', async () => {
    mailOn()
    await direction.patch('/api/documents/company', { raisonSociale: 'APS', formeJuridique: '', capital: '', adresse: '42490 Fraisses', telephone: '', email: 'contact@aps.test', siteWeb: '', siret: '', rcs: '', tvaIntra: '', iban: '', bic: '' })
    expect((await direction.get('/api/mail/status')).json().alertes).toEqual(['contact@aps.test'])
  })
})

describe('Message d’essai', () => {
  it('envoie un message d’essai, le note dans le journal des e-mails et celui d’activité', async () => {
    mailOn()
    const res = await direction.post('/api/mail/test', { to: 'moi@example.com' })
    expect(res.statusCode).toBe(200)
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ from: 'Alu Pliage Service <contact@aps.test>', to: ['moi@example.com'] })
    expect(sent[0]!.subject).toMatch(/Essai d’envoi/)
    expect(await log()).toMatchObject([{ kind: 'test', destinataires: 'moi@example.com', statut: 'envoye', erreur: null }])
    expect(await entries('mail.test')).toHaveLength(1)
  })

  it('refuse une adresse invalide, et dit clairement quand rien n’est configuré', async () => {
    mailOn()
    expect((await direction.post('/api/mail/test', { to: 'pas-un-mail' })).json()).toMatchObject({ field: 'to', error: expect.stringMatching(/invalide/) })
    env.SMTP_HOST = undefined
    const res = await direction.post('/api/mail/test', { to: 'moi@example.com' })
    expect(res.statusCode).toBe(503)
    expect(res.json().error).toMatch(/pas configuré/)
    expect(sent).toHaveLength(0)
  })

  it('rapporte l’échec sans détail technique, et le garde dans le journal des e-mails', async () => {
    mailOn()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    failWith = Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:587 user=secret'), { code: 'ECONNREFUSED' })
    const res = await direction.post('/api/mail/test', { to: 'moi@example.com' })
    expect(res.statusCode).toBe(502)
    expect(res.json().error).toContain('serveur de messagerie injoignable')
    expect(res.body).not.toMatch(/10\.0\.0\.5|secret/)
    expect(await log()).toMatchObject([{ statut: 'echec', erreur: 'serveur de messagerie injoignable' }])
    expect(await entries('mail.test')).toHaveLength(0)
  })

  it('est réservé à la direction', async () => {
    mailOn()
    expect((await visitor.post('/api/mail/test', { to: 'a@b.test' })).statusCode).toBe(401)
    await createUser({ identifiant: 'claire', role: 'rh' })
    expect((await (await loginAs(app, 'claire')).post('/api/mail/test', { to: 'a@b.test' })).statusCode).toBe(403)
    expect(sent).toHaveLength(0)
  })
})

describe('Alerte de demande de contact', () => {
  it('prévient la direction, avec la réponse directe au visiteur', async () => {
    mailOn({ alertTo: 'direction@aps.test' })
    const res = await visitor.post('/api/public/contact', contact({ fichier: { nom: 'plan.pdf', contenu: pdf.toString('base64') } }))
    expect(res.statusCode).toBe(201)
    expect(sent).toHaveLength(1)
    const mail = sent[0]!
    expect(mail.to).toEqual(['direction@aps.test'])
    expect(mail.replyTo).toBe('jean@example.com')
    expect(mail.subject).toBe('Nouvelle demande de contact : Couvertine 3 m')
    expect(mail.text).toContain('Bonjour, un devis svp.')
    expect(mail.text).toContain('Plan joint : plan.pdf')
    expect(mail.text).toContain('06 12 34 56 78')
    expect(mail.text).toContain('http://atelier.test/site-vitrine')
    // Le plan n'est pas envoyé en pièce jointe : il vient d'un inconnu, on le télécharge depuis l'atelier
    expect(mail.attachments).toBeUndefined()
    expect(await log()).toMatchObject([{ kind: 'contact', destinataires: 'direction@aps.test', statut: 'envoye' }])
  })

  it('n’envoie rien sans messagerie ou sans destinataire, mais garde la demande', async () => {
    expect((await visitor.post('/api/public/contact', contact())).statusCode).toBe(201)
    mailOn()
    expect((await visitor.post('/api/public/contact', contact())).statusCode).toBe(201)
    expect(sent).toHaveLength(0)
    expect(await db.select().from(contactRequests)).toHaveLength(2)
  })

  it('garde la demande même si la messagerie est en panne', async () => {
    mailOn({ alertTo: 'direction@aps.test' })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    failWith = Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })
    const res = await visitor.post('/api/public/contact', contact())
    expect(res.statusCode).toBe(201)
    expect(await db.select().from(contactRequests)).toHaveLength(1)
    expect(await log()).toMatchObject([{ statut: 'echec' }])
  })

  it('ne laisse pas un robot déclencher d’e-mail', async () => {
    mailOn({ alertTo: 'direction@aps.test' })
    await visitor.post('/api/public/contact', contact({ site: 'http://spam.example' }))
    expect(sent).toHaveLength(0)
  })
})

describe('Envoi d’un devis ou d’une facture', () => {
  let ids: { alu: string; anthracite: string; dupont: string }
  beforeEach(async () => {
    const [alu] = await db.insert(materials).values({ nom: 'Aluminium', epaisseur: 1.5, prixM2: 62, retourMin: 10 }).returning()
    const [anthracite] = await db.insert(colors).values({ nom: 'Gris anthracite', reference: 'RAL 7016', hex: '#383e42' }).returning()
    await db.insert(accessories).values({ nom: 'Bouchon', prix: 6.9, modeles: [M.couvertine] })
    const dupont = (await direction.post('/api/clients', { type: 'particulier', prenom: 'Jean', nom: 'Dupont', email: 'jean@example.com', adresse: '3 rue des Lilas', codePostal: '42490', ville: 'Fraisses' })).json().id
    ids = { alu: alu!.id, anthracite: anthracite!.id, dupont }
  })
  const doc = async (kind: 'devis' | 'facture') => {
    const o = (await direction.post('/api/orders', { clientId: ids.dupont, lignes: [{ modelId: M.couvertine, materialId: ids.alu, colorId: ids.anthracite, cotes: [20, 70, 300, 70, 20], angles: [135, 90, 90, 135], longueur: 3000, quantite: 4, accessoires: [] }], livraison: { mode: 'retrait' } })).json()
    await direction.post(`/api/orders/${o.id}/status`, { statut: 'validee' })
    return (await direction.post(`/api/billing/orders/${o.id}/${kind}`)).json() as { id: string; numero: string }
  }

  it('propose un message prêt à envoyer : adresse du client, objet, montant et échéance', async () => {
    mailOn()
    const d = await doc('devis')
    const res = (await direction.get(`/api/billing/${d.id}/email`)).json()
    expect(res).toMatchObject({ configure: true, to: 'jean@example.com', fichier: `${d.numero}.pdf` })
    expect(res.sujet).toBe(`Devis ${d.numero} — Alu Pliage Service`)
    expect(res.message).toContain('Bonjour Jean Dupont,')
    expect(res.message).toContain(`notre devis ${d.numero}`)
    expect(res.message).toMatch(/valable jusqu’au \d{2}\/\d{2}\/\d{4}/)
    expect(res.message).toContain('Cordialement')
  })

  it('met l’IBAN dans le message d’une facture quand il est renseigné', async () => {
    mailOn()
    await direction.patch('/api/documents/company', { raisonSociale: 'APS', formeJuridique: '', capital: '', adresse: '42490 Fraisses', telephone: '', email: '', siteWeb: '', siret: '', rcs: '', tvaIntra: '', iban: 'FR76 3000 6000 0112 3456 7890 189', bic: 'AGRIFRPP' })
    const f = await doc('facture')
    const res = (await direction.get(`/api/billing/${f.id}/email`)).json()
    expect(res.message).toContain('IBAN : FR76 3000 6000 0112 3456 7890 189')
    expect(res.message).toContain(`référence`)
  })

  it('envoie le PDF en pièce jointe, marque le document comme envoyé et le note', async () => {
    mailOn()
    const f = await doc('facture')
    const res = await direction.post(`/api/billing/${f.id}/email`, { to: 'jean@example.com, compta@example.com', sujet: `Facture ${f.numero}`, message: 'Bonjour, voici la facture.' })
    expect(res.statusCode, res.body).toBe(200)
    expect(sent).toHaveLength(1)
    const mail = sent[0]!
    expect(mail.to).toEqual(['jean@example.com', 'compta@example.com'])
    expect(mail.attachments).toHaveLength(1)
    expect(mail.attachments![0]).toMatchObject({ filename: `${f.numero}.pdf`, contentType: 'application/pdf' })
    expect(mail.attachments![0]!.content.subarray(0, 5).toString()).toBe('%PDF-')
    const [row] = await db.select().from(billingDocuments).where(eq(billingDocuments.id, f.id))
    expect(row!.envoyeLe).not.toBeNull()
    expect((await direction.get(`/api/billing/${f.id}`)).json().document.statut).toBe('envoyee')
    const [e] = await entries('billing.emailed')
    expect(e!.details).toEqual({ numero: f.numero, client: 'Jean Dupont', destinataires: 2 })
    expect(JSON.stringify(e!.details)).not.toContain('@')
    expect(await log()).toMatchObject([{ kind: 'document', targetId: f.id, statut: 'envoye' }])
  })

  it('ne change pas la date d’envoi quand on renvoie le message', async () => {
    mailOn()
    const f = await doc('facture')
    const body = { to: 'jean@example.com', sujet: 'Rappel', message: 'Bonjour' }
    await direction.post(`/api/billing/${f.id}/email`, body)
    const [first] = await db.select().from(billingDocuments).where(eq(billingDocuments.id, f.id))
    await direction.post(`/api/billing/${f.id}/email`, body)
    const [second] = await db.select().from(billingDocuments).where(eq(billingDocuments.id, f.id))
    expect(second!.envoyeLe).toEqual(first!.envoyeLe)
    expect(sent).toHaveLength(2)
  })

  it('valide les adresses, l’objet et le message', async () => {
    mailOn()
    const f = await doc('facture')
    const post = (b: object) => direction.post(`/api/billing/${f.id}/email`, b)
    const ok = { to: 'jean@example.com', sujet: 'Facture', message: 'Bonjour' }
    expect((await post({ ...ok, to: '' })).json().field).toBe('to')
    expect((await post({ ...ok, to: 'pas-un-mail' })).json()).toMatchObject({ field: 'to', error: expect.stringMatching(/invalide/) })
    expect((await post({ ...ok, to: 'a@b.fr,c@d.fr,e@f.fr,g@h.fr' })).json().error).toMatch(/3 destinataires/)
    expect((await post({ ...ok, sujet: 'Facture\nBcc: pirate@example.com' })).json()).toMatchObject({ field: 'sujet', error: expect.stringMatching(/une seule ligne/) })
    expect((await post({ ...ok, message: '  ' })).json().field).toBe('message')
    expect(sent).toHaveLength(0)
    expect((await entries('billing.emailed')).length).toBe(0)
  })

  it('ne marque pas le document comme envoyé quand l’envoi échoue', async () => {
    mailOn()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    failWith = Object.assign(new Error('refus'), { responseCode: 550 })
    const f = await doc('facture')
    const res = await direction.post(`/api/billing/${f.id}/email`, { to: 'jean@example.com', sujet: 'Facture', message: 'Bonjour' })
    expect(res.statusCode).toBe(502)
    expect(res.json().error).toMatch(/message refusé par le serveur de messagerie/)
    const [row] = await db.select().from(billingDocuments).where(eq(billingDocuments.id, f.id))
    expect(row!.envoyeLe).toBeNull()
    expect(await log()).toMatchObject([{ statut: 'echec' }])
  })

  it('répond 503 sans messagerie, et 404 pour un document inconnu', async () => {
    const f = await doc('facture')
    const res = await direction.post(`/api/billing/${f.id}/email`, { to: 'jean@example.com', sujet: 'Facture', message: 'Bonjour' })
    expect(res.statusCode).toBe(503)
    expect((await direction.get(`/api/billing/${f.id}/email`)).json().configure).toBe(false)
    mailOn()
    const unknown = '00000000-0000-4000-8000-000000000000'
    expect((await direction.post(`/api/billing/${unknown}/email`, { to: 'a@b.fr', sujet: 'x', message: 'y' })).statusCode).toBe(404)
  })

  it('est réservé à la direction', async () => {
    mailOn()
    const f = await doc('facture')
    for (const role of ['rh', 'atelier'] as const) {
      await createUser({ identifiant: role, role })
      const c = await loginAs(app, role)
      expect((await c.post(`/api/billing/${f.id}/email`, { to: 'a@b.fr', sujet: 'x', message: 'y' })).statusCode, role).toBe(403)
      expect((await c.get(`/api/billing/${f.id}/email`)).statusCode, role).toBe(403)
    }
    expect(sent).toHaveLength(0)
  })
})
