import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '../src/db/index.js'
import { accessories, auditLog, billingDocuments, colors, materials, orders } from '../src/db/schema.js'
import { yearOf } from '../src/documents.js'
import { totals } from '../src/pdf.js'
import { buildApp, createUser, loginAs, M, pdfText, pdfTextEmbedded, resetDb, seedModels, type App, type Client } from './helpers.js'

let app: App
let direction: Client
let ids: { alu: string; anthracite: string; bouchon: string; dupont: string; toitures: string }
const YEAR = yearOf(new Date())

beforeEach(async () => {
  app = await buildApp()
})
afterEach(() => {
  vi.useRealTimers()
  return app.close()
})
beforeEach(async () => {
  await resetDb()
  await seedModels()
  await createUser({ identifiant: 'chef', role: 'direction' })
  direction = await loginAs(app, 'chef')
  const [alu] = await db.insert(materials).values({ nom: 'Aluminium', epaisseur: 1.5, prixM2: 62, retourMin: 10 }).returning()
  const [anthracite] = await db.insert(colors).values({ nom: 'Gris anthracite', reference: 'RAL 7016', hex: '#383e42' }).returning()
  const [bouchon] = await db.insert(accessories).values({ nom: 'Bouchon de couvertine', prix: 6.9, modeles: [M.couvertine] }).returning()
  const dupont = (await direction.post('/api/clients', { type: 'particulier', prenom: 'Jean', nom: 'Dupont', adresse: '3 rue des Lilas', codePostal: '42490', ville: 'Fraisses' })).json().id
  const toitures = (
    await direction.post('/api/clients', { type: 'professionnel', raisonSociale: 'Toitures du Forez', siret: '732 829 320 00074', adresse: '8 avenue de la Gare', codePostal: '42700', ville: 'Firminy' })
  ).json().id
  ids = { alu: alu!.id, anthracite: anthracite!.id, bouchon: bouchon!.id, dupont, toitures }
})

const piece = (over: Record<string, unknown> = {}) => ({
  repere: 'Mur sud',
  modelId: M.couvertine,
  materialId: ids.alu,
  colorId: ids.anthracite,
  cotes: [20, 70, 300, 70, 20],
  angles: [135, 90, 90, 135],
  longueur: 3000,
  quantite: 4,
  accessoires: [{ accessoryId: ids.bouchon, quantite: 2 }],
  ...over,
})
async function order(over: Record<string, unknown> = {}, statut?: string) {
  const res = await direction.post('/api/orders', { clientId: ids.dupont, lignes: [piece()], livraison: { mode: 'retrait' }, ...over })
  expect(res.statusCode, res.body).toBe(201)
  const o = res.json() as { id: string; numero: string }
  if (statut) expect((await direction.post(`/api/orders/${o.id}/status`, { statut: 'validee' })).statusCode).toBe(200)
  return o
}
const devis = (orderId: string, c = direction) => c.post(`/api/billing/orders/${orderId}/devis`)
const facture = (orderId: string, c = direction) => c.post(`/api/billing/orders/${orderId}/facture`)
const created = async (res: Awaited<ReturnType<Client['post']>>) => {
  expect(res.statusCode, res.body).toBe(201)
  return res.json() as { id: string; numero: string }
}
const detail = async (id: string) => (await direction.get(`/api/billing/${id}`)).json()
const entries = (action: string) => db.select().from(auditLog).where(eq(auditLog.action, action))
const login = async (role: 'rh' | 'atelier') => {
  await createUser({ identifiant: role, role })
  return loginAs(app, role)
}
// Avance l'horloge de l'API (seulement Date : les minuteries restent réelles)
// La session aurait expiré entre-temps : on se reconnecte
const travel = async (days: number) => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(Date.now() + days * 86_400_000))
  direction = await loginAs(app, 'chef')
}

describe('Accès', () => {
  it('réserve les devis et factures à la direction : ni la RH, ni l’atelier', async () => {
    const o = await order({}, 'validee')
    const d = await created(await devis(o.id))
    const [rh, atelier] = [await login('rh'), await login('atelier')]
    for (const c of [rh, atelier]) {
      expect((await c.get('/api/billing')).statusCode).toBe(403)
      expect((await c.get(`/api/billing/${d.id}`)).statusCode).toBe(403)
      expect((await c.get(`/api/billing/${d.id}/pdf`)).statusCode).toBe(403)
      expect((await devis(o.id, c)).statusCode).toBe(403)
      expect((await facture(o.id, c)).statusCode).toBe(403)
    }
    expect((await app.inject({ method: 'GET', url: '/api/billing', headers: { host: 'atelier.test' } })).statusCode).toBe(401)
    expect(await db.select().from(billingDocuments)).toHaveLength(1)
    // Le journal de la RH ne montre pas les devis et factures ; celui de la direction, si
    const actions = async (c: Client) => (await c.get('/api/audit?type=documents')).json().entries.map((e: { action: string }) => e.action)
    expect(await actions(rh)).toEqual([])
    expect(await actions(direction)).toEqual(['billing.devis_created'])
  })

  it('répond 404 pour une commande ou un document inconnu', async () => {
    expect((await devis('00000000-0000-4000-8000-000000000000')).json()).toEqual({ error: 'Commande introuvable.' })
    expect((await devis('pas-un-uuid')).statusCode).toBe(404)
    expect((await direction.get('/api/billing/pas-un-uuid')).json()).toEqual({ error: 'Document introuvable.' })
    expect((await direction.get('/api/billing/00000000-0000-4000-8000-000000000000/pdf')).statusCode).toBe(404)
  })
})

describe('Devis', () => {
  it('reprend la commande ligne à ligne : même total HT, TVA et TTC', async () => {
    // Professionnel livré, avec remise quantité (20 pièces) et remise pro
    const o = await order({
      clientId: ids.toitures,
      lignes: [piece({ quantite: 20 }), piece({ repere: null, longueur: 1500, quantite: 1, accessoires: [] })],
      livraison: { mode: 'livraison', adresse: '12 chemin du Bois', codePostal: '42700', ville: 'Firminy' },
    })
    const d = await created(await devis(o.id))
    expect(d.numero).toBe(`D-${YEAR}-0001`)
    const [cmd] = await db.select().from(orders).where(eq(orders.id, o.id))
    const { document } = await detail(d.id)
    expect({ ht: document.ht, tva: document.tva, ttc: document.ttc }).toEqual({ ht: cmd!.ht, tva: cmd!.tva, ttc: cmd!.ttc })
    expect(totals(document.lignes, document.tauxTva)).toEqual({ ht: cmd!.ht, tva: cmd!.tva, ttc: cmd!.ttc })
    const designations = document.lignes.map((l: { designation: string }) => l.designation)
    expect(designations).toEqual(
      expect.arrayContaining(['Couvertine · Mur sud', 'Remise quantité −5 %', 'Bouchon de couvertine', 'Couvertine', 'Mise en route', 'Remise professionnelle', expect.stringMatching(/^Livraison/)]),
    )
    expect(document.lignes.find((l: { designation: string }) => l.designation === 'Mise en route')).toMatchObject({ quantite: 2, prixUnitaire: 18 })
    expect(document).toMatchObject({ type: 'devis', statut: 'emis', clientNom: 'Toitures du Forez', createdByNom: expect.any(String) })
    expect(document.clientAdresse).toContain('SIRET 732 829 320 00074')
    expect(document).not.toHaveProperty('pdf')
  })

  it('produit un PDF au modèle commun, avec la commande et la date de validité', async () => {
    const o = await order()
    const d = await created(await devis(o.id))
    const res = await direction.get(`/api/billing/${d.id}/pdf`)
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('application/pdf')
    expect(res.headers['content-disposition']).toContain(`${d.numero}.pdf`)
    const txt = pdfText(res.rawPayload)
    for (const attendu of ['DEVIS', `N° ${d.numero}`, `Commande : ${o.numero}`, 'Retrait à l’atelier', 'Jean Dupont', '3 rue des Lilas', 'Couvertine · Mur sud', 'Valable jusqu’au', 'Bon pour accord'])
      expect(txt, attendu).toContain(attendu)
  })

  it('accepte plusieurs versions, mais pas sur une commande annulée', async () => {
    const o = await order()
    expect((await created(await devis(o.id))).numero).toBe(`D-${YEAR}-0001`)
    expect((await created(await devis(o.id))).numero).toBe(`D-${YEAR}-0002`)
    await direction.post(`/api/orders/${o.id}/status`, { statut: 'annulee', note: 'Doublon' })
    expect((await devis(o.id)).json()).toEqual({ error: 'Commande « Annulée » : pas de devis possible.' })
  })

  it('se suit : envoyé, puis accepté ou refusé, une seule fois', async () => {
    const d = await created(await devis((await order()).id))
    expect((await direction.post(`/api/billing/${d.id}/envoi`)).statusCode).toBe(200)
    expect((await detail(d.id)).document.statut).toBe('envoye')
    expect((await direction.post(`/api/billing/${d.id}/reponse`, { reponse: 'peut-être' })).json()).toMatchObject({ field: 'reponse' })
    expect((await direction.post(`/api/billing/${d.id}/reponse`, { reponse: 'accepte' })).json()).toEqual({ statut: 'accepte' })
    expect((await direction.post(`/api/billing/${d.id}/reponse`, { reponse: 'refuse' })).json()).toEqual({ error: 'Ce devis est déjà accepté.' })
    expect((await direction.post(`/api/billing/${d.id}/paiement`, { date: '2026-01-01', mode: 'cheque' })).statusCode).toBe(409)
    expect((await entries('billing.devis_answered'))[0]!.details).toMatchObject({ numero: d.numero, reponse: 'accepte' })
    expect((await entries('billing.sent'))[0]!.details).toMatchObject({ numero: d.numero, client: 'Jean Dupont' })
  })

  it('expire après sa date de validité : il ne peut plus être accepté', async () => {
    const d = await created(await devis((await order()).id))
    await travel(31)
    expect((await detail(d.id)).document.statut).toBe('expire')
    expect((await direction.post(`/api/billing/${d.id}/reponse`, { reponse: 'accepte' })).json()).toEqual({ error: 'Ce devis a expiré : émettez-en un nouveau, aux tarifs actuels.' })
    expect((await direction.post(`/api/billing/${d.id}/reponse`, { reponse: 'refuse' })).statusCode).toBe(200)
  })
})

describe('Factures', () => {
  it('se fait sur une commande validée, une seule fois', async () => {
    const o = await order()
    expect((await facture(o.id)).json()).toEqual({ error: 'Validez d’abord la commande avant de la facturer.' })
    await direction.post(`/api/orders/${o.id}/status`, { statut: 'validee' })
    const f = await created(await facture(o.id))
    expect(f.numero).toBe(`F-${YEAR}-0001`)
    expect((await facture(o.id)).json()).toEqual({ error: `La commande est déjà facturée (${f.numero}). Pour corriger, faites d’abord un avoir.` })
    const { document } = await detail(f.id)
    expect(document).toMatchObject({ type: 'facture', statut: 'emise', echeance: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) })
    const [entry] = await entries('billing.facture_created')
    expect(entry).toMatchObject({ targetType: 'billing', targetId: f.id, details: { numero: f.numero, commande: o.numero, client: 'Jean Dupont', ttc: document.ttc } })
  })

  it('imprime la date de livraison et le règlement', async () => {
    const o = await order({}, 'validee')
    for (const statut of ['fabrication', 'prete', 'livree']) await direction.post(`/api/orders/${o.id}/status`, { statut })
    const f = await created(await facture(o.id))
    const txt = await pdfTextEmbedded((await direction.get(`/api/billing/${f.id}/pdf`)).rawPayload)
    for (const attendu of ['FACTURE', `N° ${f.numero}`, 'Échéance', 'Retirée le', `Commande : ${o.numero}`, 'Paiement au plus tard le']) expect(txt, attendu).toContain(attendu)
    expect(txt).not.toContain('Bon pour accord')
  })

  it('reste figée : la base refuse de modifier son contenu ou de la supprimer', async () => {
    const f = await created(await facture((await order({}, 'validee')).id))
    await expect(db.update(billingDocuments).set({ ht: 1 }).where(eq(billingDocuments.id, f.id))).rejects.toThrow()
    await expect(db.update(billingDocuments).set({ pdf: Buffer.from('faux') }).where(eq(billingDocuments.id, f.id))).rejects.toThrow()
    await expect(db.delete(billingDocuments).where(eq(billingDocuments.id, f.id))).rejects.toThrow()
    // Le suivi, lui, peut changer
    await db.update(billingDocuments).set({ envoyeLe: new Date() }).where(eq(billingDocuments.id, f.id))
    const [row] = await db.select().from(billingDocuments).where(eq(billingDocuments.id, f.id))
    expect(row!.ht).toBeGreaterThan(1)
    expect(row!.envoyeLe).not.toBeNull()
  })

  it('enregistre le paiement, contrôle la date, et peut l’annuler', async () => {
    const f = await created(await facture((await order({}, 'validee')).id))
    const pay = (body: unknown) => direction.post(`/api/billing/${f.id}/paiement`, body)
    expect((await pay({ date: '2999-01-01', mode: 'virement' })).json()).toEqual({ error: 'La date de paiement ne peut pas être dans le futur.', field: 'date' })
    expect((await pay({ date: '2000-01-01', mode: 'virement' })).json()).toEqual({ error: 'La date de paiement est antérieure à la facture.', field: 'date' })
    expect((await pay({ date: 'hier', mode: 'virement' })).json()).toMatchObject({ field: 'date' })
    expect((await pay({ date: new Date().toISOString().slice(0, 10), mode: 'bitcoin' })).json()).toMatchObject({ field: 'mode' })
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date())
    expect((await pay({ date: today, mode: 'cheque' })).json()).toEqual({ statut: 'payee' })
    expect((await detail(f.id)).document).toMatchObject({ statut: 'payee', payeLe: today, modePaiement: 'cheque' })
    expect((await pay({ date: today, mode: 'cheque' })).statusCode).toBe(409)
    expect((await direction.post(`/api/billing/${f.id}/envoi`)).statusCode).toBe(409)
    expect((await direction.delete(`/api/billing/${f.id}/paiement`)).json()).toEqual({ statut: 'emise' })
    expect((await direction.delete(`/api/billing/${f.id}/paiement`)).statusCode).toBe(409)
    expect((await entries('billing.paid'))[0]!.details).toMatchObject({ numero: f.numero, date: today, mode: 'cheque' })
    expect((await entries('billing.payment_cancelled'))[0]!.details).toMatchObject({ numero: f.numero, mode: 'cheque' })
  })

  it('passe en retard après l’échéance si elle n’est pas payée', async () => {
    const f = await created(await facture((await order({}, 'validee')).id))
    await direction.post(`/api/billing/${f.id}/envoi`)
    expect((await detail(f.id)).document.statut).toBe('envoyee')
    await travel(31)
    expect((await detail(f.id)).document.statut).toBe('en_retard')
    const list = (await direction.get('/api/billing?type=facture')).json()
    expect(list.totals.en_retard).toEqual({ n: 1, ttc: expect.any(Number) })
  })

  it('bloque l’annulation de la commande tant que la facture n’est pas annulée par un avoir', async () => {
    const o = await order({}, 'validee')
    const f = await created(await facture(o.id))
    const cancel = () => direction.post(`/api/orders/${o.id}/status`, { statut: 'annulee', note: 'Client parti' })
    expect((await cancel()).json()).toEqual({ error: `La commande est facturée (${f.numero}) : faites d’abord un avoir pour annuler la facture.`, field: 'statut' })
    await created(await direction.post(`/api/billing/${f.id}/avoir`, { motif: 'Commande annulée' }))
    expect((await cancel()).statusCode).toBe(200)
  })
})

describe('Avoirs', () => {
  it('annule toute la facture avec des montants opposés, puis permet de refacturer', async () => {
    const o = await order({ clientId: ids.toitures }, 'validee')
    const f = await created(await facture(o.id))
    const avoir = (body: unknown, id = f.id) => direction.post(`/api/billing/${id}/avoir`, body)
    expect((await avoir({ motif: '  ' })).json()).toEqual({ error: 'Indiquez la raison de l’avoir.', field: 'motif' })
    const d = await created(await devis(o.id))
    expect((await avoir({ motif: 'Erreur' }, d.id)).json()).toEqual({ error: 'Un avoir s’établit sur une facture.' })

    const a = await created(await avoir({ motif: 'Erreur de coloris' }))
    expect(a.numero).toBe(`A-${YEAR}-0001`)
    const [fact, av] = [(await detail(f.id)).document, await detail(a.id)]
    expect(fact.statut).toBe('annulee')
    expect((await detail(f.id)).lie).toEqual({ id: a.id, numero: a.numero })
    expect(av.lie).toEqual({ id: f.id, numero: f.numero })
    expect(av.document).toMatchObject({ type: 'avoir', motif: 'Erreur de coloris', ht: -fact.ht, tva: -fact.tva, ttc: -fact.ttc, clientNom: 'Toitures du Forez' })
    expect((await avoir({ motif: 'Encore' })).json()).toEqual({ error: 'Cette facture est déjà annulée par un avoir.' })
    expect((await direction.post(`/api/billing/${f.id}/paiement`, { date: new Date().toISOString().slice(0, 10), mode: 'virement' })).statusCode).toBe(409)

    const txt = await pdfTextEmbedded((await direction.get(`/api/billing/${a.id}/pdf`)).rawPayload)
    for (const attendu of ['AVOIR', `N° ${a.numero}`, `Facture : ${f.numero}`, `annule la facture ${f.numero}`, 'Erreur de coloris']) expect(txt, attendu).toContain(attendu)
    expect((await entries('billing.avoir_created'))[0]!.details).toMatchObject({ numero: a.numero, facture: f.numero, motif: 'Erreur de coloris' })

    // Nouvelle facture, numéro suivant
    expect((await created(await facture(o.id))).numero).toBe(`F-${YEAR}-0002`)
  })
})

describe('Liste', () => {
  it('filtre par type, statut, commande et recherche, avec les compteurs', async () => {
    const o1 = await order({}, 'validee')
    const o2 = await order({ clientId: ids.toitures }, 'validee')
    await created(await devis(o1.id))
    const f1 = await created(await facture(o1.id))
    await created(await facture(o2.id))
    await direction.post(`/api/billing/${f1.id}/paiement`, { date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date()), mode: 'virement' })

    const list = async (q: string) => (await direction.get(`/api/billing?${q}`)).json()
    const all = await list('')
    expect(all.documents, JSON.stringify(all)).toHaveLength(3)
    const factures = await list('type=facture')
    expect(factures.documents.map((d: { numero: string }) => d.numero)).toEqual([`F-${YEAR}-0002`, `F-${YEAR}-0001`])
    expect(factures.totals).toMatchObject({ payee: { n: 1 }, emise: { n: 1 } })
    expect(factures.documents[0]).toMatchObject({ client: 'Toitures du Forez', orderNumero: o2.numero, statut: 'emise' })
    expect(factures.documents[0]).not.toHaveProperty('pdf')
    expect((await list('type=facture&statut=payee')).documents.map((d: { id: string }) => d.id)).toEqual([f1.id])
    expect((await list(`orderId=${o1.id}`)).documents).toHaveLength(2)
    expect((await list('q=forez')).documents).toHaveLength(1)
    expect((await list(`q=${o1.numero}`)).documents).toHaveLength(2)
    expect((await direction.get('/api/billing?statut=nimporte')).statusCode).toBe(400)
    expect((await direction.get('/api/billing?type=bon')).statusCode).toBe(400)
  })
})

describe('Export comptable', () => {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' })
  const exportCsv = (query: string, c = direction) => c.get(`/api/billing/export?${query}`)
  // Sépare un CSV en lignes de cellules (sans BOM)
  const parse = (body: string) => body.replace(/^﻿/, '').trimEnd().split('\r\n').map((l) => l.split(';'))

  it('exporte les factures et avoirs de la période, en CSV lisible par Excel', async () => {
    const o1 = await order({ clientId: ids.toitures }, 'validee')
    const f1 = await created(await facture(o1.id))
    await direction.post(`/api/billing/${f1.id}/paiement`, { date: today, mode: 'virement' })
    const o2 = await order({}, 'validee')
    const f2 = await created(await facture(o2.id))
    const a2 = await created(await direction.post(`/api/billing/${f2.id}/avoir`, { motif: 'Erreur de coloris' }))
    await devis((await order()).id) // un devis n'est pas une pièce comptable

    const res = await exportCsv(`type=ventes&du=${YEAR}-01-01&au=${YEAR}-12-31`)
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8')
    expect(res.headers['content-disposition']).toBe(`attachment; filename="ventes-${YEAR}-01-01_${YEAR}-12-31.csv"`)
    expect(res.body.startsWith('﻿')).toBe(true)
    const [header, ...rows] = parse(res.body)
    expect(header).toEqual(['Date', 'Type', 'Numéro', 'Facture annulée', 'Commande', 'Client', 'SIRET', 'TVA intracommunautaire', 'Total HT', 'Taux de TVA (%)', 'TVA', 'Total TTC', 'Échéance', 'Statut', 'Payée le', 'Mode de paiement'])
    expect(rows.map((r) => r[2])).toEqual([f1.numero, f2.numero, a2.numero])

    const d1 = await detail(f1.id)
    const [r1, r2, r3] = rows as [string[], string[], string[]]
    expect(r1).toMatchObject({ 1: 'Facture', 4: o1.numero, 5: 'Toitures du Forez', 6: '732 829 320 00074', 13: 'Payée', 15: 'Virement' })
    expect(r1[8]).toBe(String(d1.document.ht.toFixed(2)).replace('.', ','))
    expect(r1[14]).toBe(today.split('-').reverse().join('/'))
    // Facture annulée, puis l'avoir qui l'annule avec des montants négatifs et sa référence
    expect(r2[13]).toBe('Annulée par un avoir')
    expect(r3[1]).toBe('Avoir')
    expect(r3[3]).toBe(f2.numero)
    expect(r3[11]).toMatch(/^-\d+,\d{2}$/)
    expect(r2[11]).toBe(r3[11]!.slice(1))
    expect(res.body).not.toContain('D-')
    expect((await entries('billing.exported'))[0]!.details).toEqual({ type: 'ventes', du: `${YEAR}-01-01`, au: `${YEAR}-12-31`, lignes: 3 })
  })

  it('filtre les ventes par date d’émission', async () => {
    await facture((await order({}, 'validee')).id)
    const next = `${YEAR + 1}-01-01`
    const none = parse((await exportCsv(`type=ventes&du=${next}&au=${YEAR + 1}-12-31`)).body)
    expect(none).toHaveLength(1)
    expect(parse((await exportCsv(`type=ventes&du=${today}&au=${today}`)).body)).toHaveLength(2)
  })

  it('exporte les encaissements par date de paiement, sans les factures non payées', async () => {
    const paid = await created(await facture((await order({ clientId: ids.toitures }, 'validee')).id))
    await created(await facture((await order({}, 'validee')).id))
    await direction.post(`/api/billing/${paid.id}/paiement`, { date: today, mode: 'cheque' })
    const [header, ...rows] = parse((await exportCsv(`type=encaissements&du=${today}&au=${today}`)).body)
    expect(header).toEqual(['Date de paiement', 'Mode de paiement', 'Facture', 'Commande', 'Client', 'SIRET', 'Total HT', 'TVA', 'Montant encaissé TTC'])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ 1: 'Chèque', 2: paid.numero, 4: 'Toitures du Forez' })
    expect(parse((await exportCsv(`type=encaissements&du=${YEAR + 1}-01-01&au=${YEAR + 1}-12-31`)).body)).toHaveLength(1)
  })

  it('neutralise les formules et protège les « ; » et guillemets des noms de clients', async () => {
    const piege = (await direction.post('/api/clients', { type: 'professionnel', raisonSociale: '=HYPERLINK("http://pirate.example";"x")', adresse: '1 rue', codePostal: '42000', ville: 'Saint-Étienne' })).json().id
    await facture((await order({ clientId: piege }, 'validee')).id)
    const res = await exportCsv(`type=ventes&du=${today}&au=${today}`)
    expect(res.body).toContain('"\'=HYPERLINK(""http://pirate.example"";""x"")"')
    expect(res.body.split('\r\n')[1]!.split(';').length).toBeGreaterThan(16) // le « ; » du nom est protégé par les guillemets
  })

  it('refuse une période ou un type invalide', async () => {
    for (const [q, field, msg] of [
      ['type=autre&du=2026-01-01&au=2026-12-31', 'type', /type/],
      ['type=ventes&du=hier&au=2026-12-31', 'du', /début/],
      ['type=ventes&du=2026-12-31&au=2026-01-01', 'au', /après/],
      ['type=ventes&du=2000-01-01&au=2026-12-31', 'au', /5 ans/],
      ['type=ventes', 'du', /début/],
    ] as const) {
      const res = await exportCsv(q)
      expect(res.statusCode, q).toBe(400)
      expect(res.json(), q).toMatchObject({ field, error: expect.stringMatching(msg) })
    }
    expect(await entries('billing.exported')).toHaveLength(0)
  })

  it('est réservé à la direction', async () => {
    const q = `type=ventes&du=${today}&au=${today}`
    expect((await app.inject({ method: 'GET', url: `/api/billing/export?${q}` })).statusCode).toBe(401)
    for (const role of ['rh', 'atelier'] as const) expect((await exportCsv(q, await login(role))).statusCode, role).toBe(403)
  })
})
