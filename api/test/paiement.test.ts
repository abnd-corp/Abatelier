import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '../src/db/index.js'
import { auditLog, billingDocuments, colors, materials, orderEvents, orderLines, orders, payments, productVariants, products } from '../src/db/schema.js'
import { env } from '../src/env.js'
import { setTransport, type Transport } from '../src/mail.js'
import { pdfText, buildApp, client, createUser, loginAs, M, makePng, resetDb, seedModels, type App, type Client } from './helpers.js'

let app: App
let direction: Client
let visitor: Client
let ids: { couvertine: string; v1: string; v2: string; cachee: string; bavette: string; vb: string }
const mailSent: Parameters<Transport['sendMail']>[0][] = []
/** Les messages de la commande : sans le message de bienvenue, envoyé à la création de l'espace client. */
const commandeMails = () => mailSent.filter((m) => !m.subject.startsWith('Bienvenue'))

beforeEach(async () => {
  app = await buildApp()
})
afterEach(() => {
  vi.unstubAllGlobals()
  setTransport(null)
  env.PAYMENT_PROVIDER = 'none'
  env.STRIPE_SECRET_KEY = undefined
  env.STRIPE_WEBHOOK_SECRET = undefined
  env.SMTP_HOST = undefined
  env.MAIL_FROM = undefined
  env.MAIL_ALERT_TO = undefined
  mailSent.length = 0
  return app.close()
})
beforeEach(async () => {
  env.PAYMENT_PROVIDER = 'simulation'
  await resetDb()
  await createUser({ identifiant: 'chef', role: 'direction' })
  direction = await loginAs(app, 'chef')
  visitor = client(app)
  const prod = async (nom: string) => (await direction.post('/api/boutique/produits', { nom, categorie: 'Couvertine', description: `Description ${nom}` })).json().id as string
  const variante = async (id: string, libelle: string, prixTtc: number, actif = true) =>
    (await direction.post(`/api/boutique/produits/${id}/variantes`, { libelle, prixTtc, actif })).json().variante.id as string
  const couvertine = await prod('Couvertine blanche')
  const v1 = await variante(couvertine, '270 mm · 1 m', 21)
  const v2 = await variante(couvertine, '320 mm · 3 m', 84)
  await variante(couvertine, '320 mm · 2 m (épuisée)', 56, false)
  await direction.put(`/api/boutique/produits/${couvertine}/image?alt=Couvertine`, makePng(400, 300), { 'content-type': 'image/png' })
  expect((await direction.patch(`/api/boutique/produits/${couvertine}`, { actif: true })).statusCode).toBe(200)
  const cachee = await prod('Produit caché')
  await variante(cachee, 'unique', 10)
  const bavette = await prod('Bavette en préparation')
  const vb = await variante(bavette, '150 mm · 1 m', 15)
  ids = { couvertine, v1, v2, cachee, bavette, vb }
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
async function member(email = 'jean@example.com') {
  const c = espace()
  const res = await c.post('/api/espace/inscription', { prenom: 'Jean', nom: 'Dupont', email, password: 'Plieuse-numerique-2026', consentement: true })
  expect(res.statusCode, res.body).toBe(201)
  return c
}
const panier = (over: Record<string, unknown> = {}) => ({
  lignes: [
    { variantId: ids.v1, quantite: 2 },
    { variantId: ids.v2, quantite: 1 },
  ],
  livraison: { mode: 'retrait' },
  ...over,
})
/** Paye un panier avec le faux prestataire et renvoie la commande créée. */
async function pay(c: Client, body = panier()) {
  const res = await c.post('/api/espace/boutique/paiement', body)
  expect(res.statusCode, res.body).toBe(201)
  const { id } = res.json()
  const ok = await c.post(`/api/espace/boutique/paiements/${id}/simulation`, { issue: 'paye' })
  expect(ok.statusCode, ok.body).toBe(200)
  const status = (await c.get(`/api/espace/boutique/paiements/${id}`)).json()
  return { paymentId: id as string, order: status.commande as { id: string; numero: string } }
}

describe('La boutique publique', () => {
  it('ne montre que les produits actifs, avec leurs déclinaisons actives et des prix TTC, sans donnée interne', async () => {
    const res = await visitor.get('/api/public/boutique')
    expect(res.statusCode).toBe(200)
    expect(res.headers['set-cookie']).toBeUndefined()
    const { produits, paiement } = res.json()
    expect(paiement).toBe(true)
    expect(produits.map((p: { nom: string }) => p.nom)).toEqual(['Couvertine blanche'])
    expect(produits[0]).toMatchObject({
      categorie: 'Couvertine',
      description: 'Description Couvertine blanche',
      image: { alt: 'Couvertine', url: expect.stringMatching(/^\/api\/public\/boutique\/images\/[0-9a-f-]{36}\?v=\d+$/) },
    })
    expect(produits[0].variantes.map((v: { libelle: string; prixTtc: number }) => [v.libelle, v.prixTtc])).toEqual([
      ['270 mm · 1 m', 21],
      ['320 mm · 3 m', 84],
    ])
    expect(res.body).not.toMatch(/prixHt|actif|position|createdAt|prix_ht/)
  })

  it('sert la photo d’un produit en ligne, pas celle d’un produit caché', async () => {
    const img = await visitor.get(`/api/public/boutique/images/${ids.couvertine}`)
    expect(img.statusCode).toBe(200)
    expect(img.headers['content-type']).toBe('image/png')
    expect(img.headers['cache-control']).toContain('immutable')
    await direction.put(`/api/boutique/produits/${ids.cachee}/image`, makePng(400, 300), { 'content-type': 'image/png' })
    expect((await visitor.get(`/api/public/boutique/images/${ids.cachee}`)).statusCode).toBe(404)
    expect((await visitor.get('/api/public/boutique/images/pas-un-uuid')).statusCode).toBe(404)
  })

  it('un produit mis hors ligne disparaît tout de suite', async () => {
    await direction.patch(`/api/boutique/produits/${ids.couvertine}`, { actif: false })
    expect((await visitor.get('/api/public/boutique')).json().produits).toEqual([])
  })

  it('chiffre un panier avec les prix du serveur, et écarte ce qui n’est plus en vente', async () => {
    const res = await visitor.post(
      '/api/public/boutique/panier',
      panier({
        lignes: [
          { variantId: ids.v1, quantite: 2 },
          { variantId: ids.v2, quantite: 1 },
          { variantId: ids.vb, quantite: 1 },
        ],
      }),
    )
    expect(res.statusCode, res.body).toBe(200)
    const b = res.json()
    expect(b.lignes.map((l: { libelle: string; quantite: number; prixTtc: number; totalTtc: number }) => [l.libelle, l.quantite, l.prixTtc, l.totalTtc])).toEqual([
      ['270 mm · 1 m', 2, 21, 42],
      ['320 mm · 3 m', 1, 84, 84],
    ])
    expect(b.indisponibles).toEqual([ids.vb])
    expect(b.totals).toMatchObject({ ht: 105, tva: 21, ttc: 126, livraisonPrix: 0, tauxTva: 20 })
    // Un prix envoyé par le navigateur est ignoré
    const forged = await visitor.post('/api/public/boutique/panier', { ...panier(), prixTtc: 1, totals: { ttc: 1 } })
    expect(forged.json().totals.ttc).toBe(126)
    expect(await db.select().from(orders)).toHaveLength(0)
  })

  it('refuse un panier invalide, avec le champ concerné', async () => {
    const bad = async (b: object) => (await visitor.post('/api/public/boutique/panier', b)).json()
    expect(await bad(panier({ lignes: [] }))).toMatchObject({ error: expect.stringMatching(/panier est vide/) })
    expect(await bad(panier({ lignes: [{ variantId: ids.v1, quantite: 0 }] }))).toMatchObject({ field: 'lignes.0.quantite' })
    expect(await bad(panier({ lignes: [{ variantId: ids.v1, quantite: 1000 }] }))).toMatchObject({ field: 'lignes.0.quantite' })
    expect(await bad(panier({ lignes: [{ variantId: 'x', quantite: 1 }] }))).toMatchObject({ field: 'lignes.0.variantId' })
    expect(await bad(panier({ livraison: { mode: 'livraison', adresse: '', codePostal: '42', ville: '' } }))).toMatchObject({ field: expect.stringMatching(/^livraison/) })
    expect(await bad({})).toMatchObject({ error: expect.any(String) })
  })
})

describe('Payer son panier', () => {
  it('exige un compte client, et un prestataire de paiement', async () => {
    expect((await visitor.post('/api/espace/boutique/paiement', panier())).statusCode).toBe(401)
    const c = await member()
    env.PAYMENT_PROVIDER = 'none'
    const res = await c.post('/api/espace/boutique/paiement', panier())
    expect(res.statusCode).toBe(503)
    expect(res.json().error).toMatch(/pas encore ouvert/)
    expect(await db.select().from(payments)).toHaveLength(0)
    expect((await visitor.get('/api/public/boutique')).json().paiement).toBe(false)
  })

  it('fige le panier et le prix, ouvre la page de paiement, sans créer de commande avant le paiement', async () => {
    const c = await member()
    const res = await c.post('/api/espace/boutique/paiement', panier())
    expect(res.statusCode, res.body).toBe(201)
    const { id, url } = res.json()
    expect(url).toBe(`/paiement-simulation/${id}`)
    const [p] = await db.select().from(payments)
    expect(p).toMatchObject({ statut: 'attente', provider: 'simulation', montantTtc: 126, orderId: null })
    expect(p!.panier.lignes.map((l) => [l.produit, l.libelle, l.quantite])).toEqual([
      ['Couvertine blanche', '270 mm · 1 m', 2],
      ['Couvertine blanche', '320 mm · 3 m', 1],
    ])
    expect(await db.select().from(orders)).toHaveLength(0)
    expect((await entries('boutique.checkout_started')).length).toBe(1)
  })

  it('refuse un panier dont un article n’est plus en vente, ou invalide', async () => {
    const c = await member()
    const gone = await c.post(
      '/api/espace/boutique/paiement',
      panier({
        lignes: [
          { variantId: ids.v1, quantite: 1 },
          { variantId: ids.vb, quantite: 1 },
        ],
      }),
    )
    expect(gone.statusCode).toBe(409)
    expect(gone.json()).toMatchObject({ field: 'lignes', indisponibles: [ids.vb] })
    expect((await c.post('/api/espace/boutique/paiement', panier({ lignes: [] }))).statusCode).toBe(400)
    expect(await db.select().from(payments)).toHaveLength(0)
  })

  it('crée la commande au prix payé, déjà « Validée » pour l’atelier, quand le paiement est confirmé, et prévient la direction et le client', async () => {
    mailOn()
    const c = await member()
    const { paymentId, order } = await pay(c)
    expect(order.numero).toMatch(/^C-\d{4}-\d{4}$/)
    const [o] = await db.select().from(orders)
    expect(o).toMatchObject({ id: order.id, kind: 'boutique', statut: 'validee', ht: 105, tva: 21, ttc: 126, createdBy: null, livraisonMode: 'retrait' })
    expect(o!.datePrevue).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect((await db.select().from(orderEvents)).map((e) => [e.statut, e.userId])).toEqual([
      ['recue', null],
      ['validee', null],
    ])
    const lines = await db.select().from(orderLines)
    expect(lines.map((l) => [l.modeleLabel, l.materialLabel, l.quantite, l.total, l.cotes.length, l.variantId])).toEqual(
      expect.arrayContaining([
        ['Couvertine blanche', '270 mm · 1 m', 2, 35, 0, ids.v1],
        ['Couvertine blanche', '320 mm · 3 m', 1, 70, 0, ids.v2],
      ]),
    )
    const [p] = await db.select().from(payments)
    expect(p).toMatchObject({ id: paymentId, statut: 'paye', orderId: order.id })
    expect(p!.paidAt).not.toBeNull()
    const to = (m: (typeof mailSent)[number]) => m.to.join()
    expect(commandeMails().map(to).sort()).toEqual(['direction@aps.test', 'jean@example.com'])
    expect(commandeMails().find((m) => to(m) === 'jean@example.com')!.subject).toContain(order.numero)
    expect(commandeMails().find((m) => to(m) === 'direction@aps.test')!.text).toMatch(/déjà validée.*vous pouvez la refuser/s)
    expect((await entries('boutique.payment_confirmed'))[0]).toMatchObject({ targetId: order.id, userId: null })
    // Le client la voit dans son espace, avec son paiement
    const detail = (await c.get(`/api/espace/commandes/${order.id}`)).json()
    expect(detail.commande).toMatchObject({ kind: 'boutique', statut: 'validee', numero: order.numero })
    expect(detail.paiement).toMatchObject({ statut: 'paye', montantTtc: 126 })
    expect(JSON.stringify(detail)).not.toMatch(/providerRef|sim_|provider/)
    expect(detail.lignes[0]).toMatchObject({ cotes: [], modeleLabel: 'Couvertine blanche' })
    expect((await c.get('/api/espace/commandes')).json().commandes[0]).toMatchObject({ kind: 'boutique', devis: null })
  })

  it('ne crée qu’une commande même si la confirmation arrive deux fois, et garde le prix payé si le catalogue change', async () => {
    const c = await member()
    const { paymentId, order } = await pay(c)
    const again = await c.post(`/api/espace/boutique/paiements/${paymentId}/simulation`, { issue: 'paye' })
    expect(again.statusCode).toBe(409)
    expect(await db.select().from(orders)).toHaveLength(1)
    await direction.patch(`/api/boutique/variantes/${ids.v2}`, { prixTtc: 999 })
    expect((await direction.get(`/api/orders/${order.id}`)).json().order.ttc).toBe(126)
  })

  it('un paiement échoué ne crée aucune commande', async () => {
    const c = await member()
    const { id } = (await c.post('/api/espace/boutique/paiement', panier())).json()
    expect((await c.post(`/api/espace/boutique/paiements/${id}/simulation`, { issue: 'echec' })).json()).toEqual({ statut: 'echec' })
    expect((await c.get(`/api/espace/boutique/paiements/${id}`)).json()).toMatchObject({ statut: 'echec', commande: null })
    expect(await db.select().from(orders)).toHaveLength(0)
    expect((await c.post(`/api/espace/boutique/paiements/${id}/simulation`, { issue: 'paye' })).statusCode).toBe(409)
  })

  it('un client ne voit ni ne paie le paiement d’un autre, et la simulation n’existe pas avec un vrai prestataire', async () => {
    const a = await member()
    const b = await member('marie@example.com')
    const { id } = (await a.post('/api/espace/boutique/paiement', panier())).json()
    expect((await b.get(`/api/espace/boutique/paiements/${id}`)).statusCode).toBe(404)
    expect((await b.post(`/api/espace/boutique/paiements/${id}/simulation`, { issue: 'paye' })).statusCode).toBe(404)
    expect((await a.post(`/api/espace/boutique/paiements/${id}/simulation`, { issue: 'peut-être' })).statusCode).toBe(400)
    env.PAYMENT_PROVIDER = 'none'
    expect((await a.post(`/api/espace/boutique/paiements/${id}/simulation`, { issue: 'paye' })).statusCode).toBe(404)
    expect(await db.select().from(orders)).toHaveLength(0)
  })

  it('limite le nombre de paiements ouverts par heure', async () => {
    env.CONTACT_RATE_LIMIT = 2
    const limited = await buildApp()
    try {
      const c = client(limited, { cookieName: 'aps_client' })
      await c.post('/api/espace/inscription', { nom: 'Dupont', email: 'x@example.com', password: 'Plieuse-numerique-2026', consentement: true })
      for (let i = 0; i < 2; i++) expect((await c.post('/api/espace/boutique/paiement', panier())).statusCode).toBe(201)
      expect((await c.post('/api/espace/boutique/paiement', panier())).statusCode).toBe(429)
    } finally {
      env.CONTACT_RATE_LIMIT = 20
      await limited.close()
    }
  })
})

describe('Côté atelier', () => {
  it('la direction voit la commande boutique payée, l’atelier la prépare en voyant le nom du client mais ni son e-mail ni les prix, et sa fiche PDF se génère', async () => {
    const c = await member()
    const { order } = await pay(c)
    const list = (await direction.get('/api/orders?filtre=toutes')).json().orders
    expect(list[0]).toMatchObject({ id: order.id, kind: 'boutique', client: 'Jean Dupont' })
    const detail = (await direction.get(`/api/orders/${order.id}`)).json()
    expect(detail.paiement).toMatchObject({ statut: 'paye', montantTtc: 126, prestataire: 'simulation' })
    expect(JSON.stringify(detail)).not.toMatch(/providerRef|providerPayment|provider_/)
    // Déjà validée au paiement : l'atelier la voit sans que la direction n'ait rien à faire
    await createUser({ identifiant: 'paul', role: 'atelier' })
    const atelier = await loginAs(app, 'paul')
    const prod = (await atelier.get('/api/production')).json().orders
    expect(prod[0]).toMatchObject({ id: order.id, kind: 'boutique', pieces: 3, client: 'Jean Dupont' })
    const fiche = (await atelier.get(`/api/production/${order.id}`)).json()
    expect(fiche.order.client).toBe('Jean Dupont')
    expect(JSON.stringify(fiche)).not.toMatch(/jean@|prix|ttc/i)
    const pdf = await atelier.get(`/api/production/${order.id}/fiche.pdf`)
    expect(pdf.statusCode).toBe(200)
    const text = pdfText(pdf.rawPayload)
    expect(text).toContain('ARTICLE DE LA BOUTIQUE')
    expect(text).toContain('Client : Jean Dupont')
    expect(text).not.toMatch(/jean@|€/)
    expect(text).toContain('Couvertine blanche')
  })

  it('émet la facture directement réglée (carte), au centime du paiement, et refuse devis et annulation du paiement', async () => {
    const c = await member()
    const { order } = await pay(c)
    expect((await direction.post(`/api/billing/orders/${order.id}/devis`)).json().error).toMatch(/payée en ligne/)
    const f = await direction.post(`/api/billing/orders/${order.id}/facture`)
    expect(f.statusCode, f.body).toBe(201)
    const [doc] = await db.select().from(billingDocuments)
    expect(doc).toMatchObject({ type: 'facture', ttc: 126, ht: 105, modePaiement: 'carte' })
    expect(doc!.payeLe).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(doc!.lignes.map((l) => l.designation)).toEqual(['Couvertine blanche', 'Couvertine blanche'])
    expect((await direction.get(`/api/billing/${doc!.id}`)).json().document.statut).toBe('payee')
    const cancel = await direction.delete(`/api/billing/${doc!.id}/paiement`)
    expect(cancel.statusCode).toBe(409)
    expect(cancel.json().error).toMatch(/en ligne/)
    // Le client télécharge sa facture, déjà réglée
    const docs = (await c.get(`/api/espace/commandes/${order.id}`)).json().documents
    expect(docs[0]).toMatchObject({ type: 'facture', statut: 'payee' })
  })
})

describe('Refuser et rembourser', () => {
  it('refuse la commande, rembourse le client en totalité, le prévient avec le motif, et garde la trace', async () => {
    mailOn()
    const c = await member()
    const { order, paymentId } = await pay(c)
    mailSent.length = 0
    const res = await direction.post(`/api/orders/${order.id}/refus`, { motif: 'Longueur impossible à plier sur notre machine.' })
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json()).toEqual({ statut: 'annulee', rembourse: 126, avoir: null })
    const [p] = await db.select().from(payments)
    expect(p).toMatchObject({ id: paymentId, statut: 'rembourse', refundMotif: 'Longueur impossible à plier sur notre machine.' })
    expect(p!.refundRef).toBe(`sim_refund_${paymentId}`)
    expect((await db.select().from(orders))[0]!.statut).toBe('annulee')
    expect(mailSent).toHaveLength(1)
    expect(mailSent[0]!.to).toEqual(['jean@example.com'])
    expect(mailSent[0]!.text).toContain('Longueur impossible à plier')
    expect(mailSent[0]!.text).toMatch(/Montant remboursé : 126,00 € \(la totalité\)/)
    expect((await entries('order.refused'))[0]!.details).toMatchObject({ numero: order.numero, montant: 126, motif: 'Longueur impossible à plier sur notre machine.' })
    const detail = (await c.get(`/api/espace/commandes/${order.id}`)).json()
    expect(detail.commande.statut).toBe('annulee')
    expect(detail.paiement).toMatchObject({ statut: 'rembourse', refundMotif: 'Longueur impossible à plier sur notre machine.' })
    // Un deuxième refus est impossible
    expect((await direction.post(`/api/orders/${order.id}/refus`, { motif: 'Encore' })).statusCode).toBe(409)
  })

  it('annule d’abord la facture par un avoir quand elle est déjà émise', async () => {
    const c = await member()
    const { order } = await pay(c)
    const f = (await direction.post(`/api/billing/orders/${order.id}/facture`)).json()
    const res = await direction.post(`/api/orders/${order.id}/refus`, { motif: 'Matière en rupture chez le fournisseur.' })
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json().avoir).toMatch(/^A-\d{4}-\d{4}$/)
    const docs = await db.select().from(billingDocuments)
    expect(docs.map((d) => d.type).sort()).toEqual(['avoir', 'facture'])
    expect(docs.find((d) => d.type === 'avoir')).toMatchObject({ factureId: f.id, ttc: -126 })
  })

  it('exige un motif, et ne s’applique qu’à une commande payée en ligne, pas encore livrée', async () => {
    const c = await member()
    const { order } = await pay(c)
    expect((await direction.post(`/api/orders/${order.id}/refus`, {})).json()).toMatchObject({ field: 'motif' })
    expect((await direction.post(`/api/orders/${order.id}/refus`, { motif: '   ' })).statusCode).toBe(400)
    // L'annulation ordinaire est refusée : elle ne rembourserait personne
    const cancel = await direction.post(`/api/orders/${order.id}/status`, { statut: 'annulee', note: 'test' })
    expect(cancel.statusCode).toBe(409)
    expect(cancel.json().error).toMatch(/Refuser et rembourser/)
    for (const s of ['fabrication', 'prete', 'livree']) await direction.post(`/api/orders/${order.id}/status`, { statut: s })
    const late = await direction.post(`/api/orders/${order.id}/refus`, { motif: 'Trop tard' })
    expect(late.statusCode).toBe(409)
    expect(late.json().error).toMatch(/Livrée/)
    // Une commande sur mesure n'a pas de paiement en ligne à rembourser
    const [row] = await db.select().from(orders)
    await db.update(orders).set({ statut: 'recue' }).where(eq(orders.id, row!.id))
    await db.delete(payments)
    expect((await direction.post(`/api/orders/${order.id}/refus`, { motif: 'x' })).statusCode).toBe(409)
  })

  it('est réservé à la direction', async () => {
    const c = await member()
    const { order } = await pay(c)
    await createUser({ identifiant: 'paul', role: 'atelier' })
    await createUser({ identifiant: 'claire', role: 'rh' })
    for (const who of ['paul', 'claire']) expect((await (await loginAs(app, who)).post(`/api/orders/${order.id}/refus`, { motif: 'x' })).statusCode).toBe(403)
    expect((await c.post(`/api/orders/${order.id}/refus`, { motif: 'x' })).statusCode).toBe(401)
    expect((await visitor.post(`/api/orders/${order.id}/refus`, { motif: 'x' })).statusCode).toBe(401)
  })
})

describe('Stripe', () => {
  const SECRET = 'whsec_test_secret'
  const sign = (body: string, t = Math.floor(Date.now() / 1000), secret = SECRET) => `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`
  const post = (body: object, header?: string) => {
    const raw = JSON.stringify(body)
    return app.inject({
      method: 'POST',
      url: '/api/paiement/stripe',
      headers: { host: 'atelier.test', 'content-type': 'application/json', ...(header === undefined ? { 'stripe-signature': sign(raw) } : header ? { 'stripe-signature': header } : {}) },
      payload: raw,
    })
  }
  const stripeOn = () => {
    env.PAYMENT_PROVIDER = 'stripe'
    env.STRIPE_SECRET_KEY = 'sk_test_x'
    env.STRIPE_WEBHOOK_SECRET = SECRET
  }
  const calls: { url: string; init: RequestInit }[] = []
  const stubStripe = (
    reply: (url: string) => object | null = (url) => (url.includes('/checkout/sessions') ? { id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' } : { id: 're_1' }),
  ) => {
    calls.length = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, init })
        const body = reply(url)
        return new Response(JSON.stringify(body ?? { error: { message: 'refusé' } }), { status: body ? 200 : 402 })
      }),
    )
  }

  it('ouvre une session Stripe Checkout au montant exact en centimes, sans jamais envoyer de donnée de carte', async () => {
    stripeOn()
    stubStripe()
    const c = await member()
    const res = await c.post('/api/espace/boutique/paiement', panier())
    expect(res.statusCode, res.body).toBe(201)
    expect(res.json().url).toBe('https://checkout.stripe.com/c/pay/cs_test_1')
    const [{ url, init }] = calls as [(typeof calls)[number]]
    expect(url).toBe('https://api.stripe.com/v1/checkout/sessions')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk_test_x')
    const form = new URLSearchParams(init.body as string)
    expect(form.get('line_items[0][price_data][unit_amount]')).toBe('12600')
    expect(form.get('line_items[0][price_data][currency]')).toBe('eur')
    expect(form.get('mode')).toBe('payment')
    expect(form.get('customer_email')).toBe('jean@example.com')
    const [p] = await db.select().from(payments)
    expect(form.get('client_reference_id')).toBe(p!.id)
    expect(form.get('success_url')).toBe(`http://atelier.test/boutique/commande/${p!.id}`)
    expect(form.get('cancel_url')).toBe('http://atelier.test/panier?paiement=annule')
    expect(p).toMatchObject({ provider: 'stripe', providerRef: 'cs_test_1', statut: 'attente' })
    // Pas de page de simulation avec Stripe
    expect((await c.post(`/api/espace/boutique/paiements/${p!.id}/simulation`, { issue: 'paye' })).statusCode).toBe(404)
  })

  it('crée la commande quand Stripe confirme le paiement (signature valide), une seule fois', async () => {
    stripeOn()
    stubStripe()
    const c = await member()
    await c.post('/api/espace/boutique/paiement', panier())
    const [p] = await db.select().from(payments)
    const event = { type: 'checkout.session.completed', data: { object: { id: 'cs_test_1', client_reference_id: p!.id, payment_status: 'paid', payment_intent: 'pi_123' } } }
    // Stripe n'envoie pas d'en-tête Origin : la signature remplace le contrôle d'origine
    const res = await post(event)
    expect(res.statusCode, res.body).toBe(200)
    expect((await db.select().from(orders)).length).toBe(1)
    expect((await db.select().from(payments))[0]).toMatchObject({ statut: 'paye', providerPayment: 'pi_123' })
    expect((await post(event)).statusCode).toBe(200)
    expect((await db.select().from(orders)).length).toBe(1)
  })

  it('rembourse chez Stripe avec le bon paiement et le bon montant, et ne touche à rien si Stripe refuse', async () => {
    stripeOn()
    stubStripe()
    const c = await member()
    await c.post('/api/espace/boutique/paiement', panier())
    const [p] = await db.select().from(payments)
    await post({ type: 'checkout.session.completed', data: { object: { id: 'cs_test_1', client_reference_id: p!.id, payment_status: 'paid', payment_intent: 'pi_123' } } })
    const orderId = (await db.select().from(orders))[0]!.id

    stubStripe(() => null)
    const refused = await direction.post(`/api/orders/${orderId}/refus`, { motif: 'Impossible' })
    expect(refused.statusCode).toBe(502)
    expect(refused.json().error).toMatch(/remboursement a été refusé/)
    expect((await db.select().from(payments))[0]!.statut).toBe('paye')
    expect((await db.select().from(orders))[0]!.statut).toBe('validee')

    stubStripe()
    const ok = await direction.post(`/api/orders/${orderId}/refus`, { motif: 'Impossible' })
    expect(ok.statusCode, ok.body).toBe(200)
    const [{ url, init }] = calls as [(typeof calls)[number]]
    expect(url).toBe('https://api.stripe.com/v1/refunds')
    const form = new URLSearchParams(init.body as string)
    expect(form.get('payment_intent')).toBe('pi_123')
    expect(form.get('amount')).toBe('12600')
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe(`refund-${p!.id}`)
    expect((await db.select().from(payments))[0]).toMatchObject({ statut: 'rembourse', refundRef: 're_1' })
  })

  it('refuse une notification mal signée, périmée, ou pour une autre session', async () => {
    stripeOn()
    stubStripe()
    const c = await member()
    await c.post('/api/espace/boutique/paiement', panier())
    const [p] = await db.select().from(payments)
    const event = { type: 'checkout.session.completed', data: { object: { id: 'cs_test_1', client_reference_id: p!.id, payment_status: 'paid', payment_intent: 'pi_123' } } }
    const raw = JSON.stringify(event)
    expect((await post(event, '')).statusCode).toBe(400)
    expect((await post(event, sign(raw, Math.floor(Date.now() / 1000), 'whsec_autre'))).statusCode).toBe(400)
    expect((await post(event, sign(raw, Math.floor(Date.now() / 1000) - 3600))).statusCode).toBe(400)
    expect((await post(event, 't=abc,v1=zz')).statusCode).toBe(400)
    // Signature valide mais session qui n'est pas la nôtre : ignorée
    const other = { ...event, data: { object: { ...event.data.object, id: 'cs_autre' } } }
    expect((await post(other)).statusCode).toBe(200)
    // Paiement non réglé : ignoré
    const unpaid = { ...event, data: { object: { ...event.data.object, payment_status: 'unpaid' } } }
    expect((await post(unpaid)).statusCode).toBe(200)
    expect(await db.select().from(orders)).toHaveLength(0)
    expect((await db.select().from(payments))[0]!.statut).toBe('attente')
    // Session expirée : le paiement est abandonné
    await post({ type: 'checkout.session.expired', data: { object: { id: 'cs_test_1', client_reference_id: p!.id } } })
    expect((await db.select().from(payments))[0]!.statut).toBe('echec')
  })

  it('la route des notifications n’existe pas hors Stripe', async () => {
    expect((await post({ type: 'x', data: { object: {} } })).statusCode).toBe(404)
  })

  it('dit quand Stripe ne répond pas, sans détail technique, et abandonne le paiement', async () => {
    stripeOn()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED 10.0.0.1')
      }),
    )
    const c = await member()
    const res = await c.post('/api/espace/boutique/paiement', panier())
    expect(res.statusCode).toBe(502)
    expect(res.json().error).toMatch(/ne répond pas/)
    expect(res.body).not.toMatch(/ECONNREFUSED|10\.0/)
    expect((await db.select().from(payments))[0]!.statut).toBe('echec')
  })
})

describe('Données de la boutique', () => {
  it('une déclinaison vendue reste lisible dans la commande même supprimée du catalogue', async () => {
    const c = await member()
    const { order } = await pay(c)
    await direction.patch(`/api/boutique/produits/${ids.couvertine}`, { actif: false })
    await direction.delete(`/api/boutique/produits/${ids.couvertine}`)
    expect(await db.select().from(products).where(eq(products.id, ids.couvertine))).toHaveLength(0)
    expect(await db.select().from(productVariants).where(eq(productVariants.id, ids.v1))).toHaveLength(0)
    const lines = (await direction.get(`/api/orders/${order.id}`)).json().lignes
    expect(lines[0]).toMatchObject({ modeleLabel: 'Couvertine blanche', variantId: null })
  })
})

describe('Commande sur mesure payée depuis le configurateur', () => {
  let sm: { alu: string; anthracite: string }
  beforeEach(async () => {
    await seedModels()
    const [alu] = await db.insert(materials).values({ nom: 'Aluminium', epaisseur: 1.5, prixM2: 62, retourMin: 10 }).returning()
    const [anthracite] = await db.insert(colors).values({ nom: 'Gris anthracite', reference: 'RAL 7016', hex: '#383e42' }).returning()
    sm = { alu: alu!.id, anthracite: anthracite!.id }
  })
  const piece = () => ({
    repere: 'Mur sud',
    modelId: M.couvertine,
    materialId: sm.alu,
    colorId: sm.anthracite,
    cotes: [20, 70, 300, 70, 20],
    angles: [135, 90, 90, 135],
    longueur: 3000,
    quantite: 4,
    accessoires: [],
  })
  const commande = (over: Record<string, unknown> = {}) => ({ lignes: [piece()], livraison: { mode: 'retrait' }, notes: 'Pose en mars', ...over })

  it('exige un compte et un prestataire de paiement, et valide la saisie avec le champ concerné', async () => {
    expect((await visitor.post('/api/espace/commande', commande())).statusCode).toBe(401)
    const c = await member()
    env.PAYMENT_PROVIDER = 'none'
    expect((await c.post('/api/espace/commande', commande())).statusCode).toBe(503)
    env.PAYMENT_PROVIDER = 'simulation'
    const bad = await c.post('/api/espace/commande', commande({ lignes: [{ ...piece(), longueur: 99999 }] }))
    expect(bad.statusCode).toBe(400)
    expect(bad.json().field).toMatch(/^lignes\.0\.longueur/)
    expect((await c.post('/api/espace/commande', commande({ lignes: [] }))).statusCode).toBe(400)
    expect(await db.select().from(payments)).toHaveLength(0)
  })

  it('fige le prix du configurateur, ne crée rien avant le paiement, puis une commande sur mesure déjà « Validée »', async () => {
    mailOn()
    const c = await member()
    const quoted = (await visitor.post('/api/public/configurateur/chiffrage', commande())).json()
    const res = await c.post('/api/espace/commande', commande())
    expect(res.statusCode, res.body).toBe(201)
    const { id, url } = res.json()
    expect(url).toBe(`/paiement-simulation/${id}`)
    const [p] = await db.select().from(payments)
    expect(p!.montantTtc).toBe(quoted.totals.ttc)
    expect(await db.select().from(orders)).toHaveLength(0)
    expect((await c.get(`/api/espace/boutique/paiements/${id}`)).json()).toMatchObject({ statut: 'attente', commande: null, surMesure: true })

    expect((await c.post(`/api/espace/boutique/paiements/${id}/simulation`, { issue: 'paye' })).statusCode).toBe(200)
    const [o] = await db.select().from(orders)
    expect(o).toMatchObject({ kind: 'sur_mesure', statut: 'validee', ttc: quoted.totals.ttc, ht: quoted.totals.ht, notes: 'Pose en mars' })
    const lines = await db.select().from(orderLines)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ modeleLabel: 'Couvertine', repere: 'Mur sud', quantite: 4, longueur: 3000 })
    expect((await db.select().from(orderEvents)).map((e) => e.statut)).toEqual(['recue', 'validee'])
    // L'atelier la voit dans Fabrication, avec ses pièces, sans le client
    await createUser({ identifiant: 'plieur', role: 'atelier' })
    const atelier = await loginAs(app, 'plieur')
    expect((await atelier.get('/api/production')).json().orders.map((x: { numero: string }) => x.numero)).toEqual([o!.numero])
    const fab = await atelier.post(`/api/production/${o!.id}/status`, { statut: 'fabrication' })
    expect(fab.statusCode, fab.body).toBe(200)
    // Le client voit son suivi, la direction et le client sont prévenus
    const suivi = (await c.get(`/api/espace/commandes/${o!.id}`)).json()
    expect(suivi.commande).toMatchObject({ kind: 'sur_mesure', statut: 'fabrication' })
    expect(suivi.paiement).toMatchObject({ statut: 'paye' })
    expect(commandeMails().map((m) => m.subject)).toEqual([expect.stringContaining('Commande sur mesure payée'), expect.stringContaining('est confirmée')])
    expect(commandeMails()[0]!.text).toContain('depuis le configurateur')
    expect(await entries('boutique.payment_confirmed')).toHaveLength(1)
  })

  it('un paiement abandonné ne crée rien, et la direction peut refuser et rembourser la commande payée', async () => {
    const c = await member()
    const { id } = (await c.post('/api/espace/commande', commande())).json()
    await c.post(`/api/espace/boutique/paiements/${id}/simulation`, { issue: 'echec' })
    expect(await db.select().from(orders)).toHaveLength(0)
    const again = (await c.post('/api/espace/commande', commande())).json()
    await c.post(`/api/espace/boutique/paiements/${again.id}/simulation`, { issue: 'paye' })
    const [o] = await db.select().from(orders)
    const refus = await direction.post(`/api/orders/${o!.id}/refus`, { motif: 'Pièce impossible à plier.' })
    expect(refus.statusCode, refus.body).toBe(200)
    expect((await db.select().from(payments).where(eq(payments.id, again.id)))[0]!.statut).toBe('rembourse')
  })
})
