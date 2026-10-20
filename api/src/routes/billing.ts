import type { FastifyInstance, FastifyReply } from 'fastify'
import { and, count, desc, eq, ilike, or, sql, sum, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '../db/index.js'
import { BILLING_TYPES, billingDocuments, clients, DEVIS_REPONSES, orders, PAIEMENT_MODES, users } from '../db/schema.js'
import { csvAmount, csvDate, csvDay, csvText, PAIEMENT_LABELS, STATUT_LABELS_CSV, toCsv } from '../accounting.js'
import { requirePerm } from '../auth/plugin.js'
import { getCompany } from '../documents.js'
import { isMailConfigured, sendMail } from '../mail.js'
import { defaultDocumentMail } from '../mail-texts.js'
import { audit } from '../audit.js'
import { avoirAlias, BillingConflict, DEVIS_STATUTS, FACTURE_STATUTS, issueCreditNote, issueFromOrder, statutSql } from '../billing.js'
import { todayParis } from '../departures.js'
import { STATUT_LABELS } from '../orders.js'
import { isUniqueViolation } from '../validation.js'

// Devis, factures et avoirs : émis depuis une commande, puis suivis (envoi, réponse, paiement).
// Le contenu d'un document émis ne change plus (voir le déclencheur de la migration 0014).

export const STATUTS = {
  devis: ['emis', 'envoye', 'accepte', 'refuse', 'expire'],
  facture: ['emise', 'envoyee', 'en_retard', 'payee', 'annulee'],
  avoir: ['emis'],
} as const

const listQuery = z.object({
  type: z.enum(BILLING_TYPES).optional(),
  statut: z.enum([...new Set(Object.values(STATUTS).flat())]).optional(),
  q: z.string().trim().max(80).optional(),
  orderId: z.uuid().optional(),
  clientId: z.uuid().optional(),
})

// Export comptable : factures et avoirs émis sur la période, ou paiements encaissés sur la période
const exportQuery = z
  .object({
    type: z.enum(['ventes', 'encaissements'], { error: 'Choisissez le type d’export.' }),
    du: z.iso.date('Date de début invalide.'),
    au: z.iso.date('Date de fin invalide.'),
  })
  .refine((q) => q.du <= q.au, { message: 'La date de fin doit être après la date de début.', path: ['au'] })
  .refine((q) => Date.parse(q.au) - Date.parse(q.du) <= 5 * 366 * 86400000, { message: 'Période trop longue : 5 ans au maximum.', path: ['au'] })

const emailBody = z.object({
  to: z
    .string()
    .trim()
    .min(1, 'Indiquez au moins une adresse e-mail.')
    .transform((s) => s.split(/[,;\s]+/).filter(Boolean))
    .pipe(z.array(z.email('Adresse e-mail invalide.')).min(1, 'Indiquez au moins une adresse e-mail.').max(3, '3 destinataires au maximum.')),
  sujet: z.string().trim().min(1, 'Indiquez l’objet du message.').max(200, 'Objet : 200 caractères maximum.').refine((s) => !/[\r\n]/.test(s), 'L’objet tient sur une seule ligne.'),
  message: z.string().trim().min(1, 'Écrivez le message.').max(5000, 'Message : 5000 caractères maximum.'),
})

const reponseBody = z.object({ reponse: z.enum(DEVIS_REPONSES, { error: 'Indiquez si le devis est accepté ou refusé.' }) })

const paiementBody = z.object({
  date: z.iso.date('Date de paiement invalide.'),
  mode: z.enum(PAIEMENT_MODES, { error: 'Choisissez le mode de paiement.' }),
})

const avoirBody = z.object({
  motif: z.string().trim().min(1, 'Indiquez la raison de l’avoir.').max(500, 'Motif : 500 caractères maximum.'),
})

function invalid(reply: FastifyReply, e: z.ZodError) {
  const issue = e.issues[0]
  return reply.code(400).send({ error: issue?.message ?? 'Données invalides.', field: issue?.path.length ? issue.path.join('.') : undefined })
}

const isUuid = (id: string) => z.uuid().safeParse(id).success

async function findOrder(id: string, reply: FastifyReply) {
  const [o] = isUuid(id) ? await db.select().from(orders).where(eq(orders.id, id)) : []
  if (!o) reply.code(404).send({ error: 'Commande introuvable.' })
  return o ?? null
}

async function findDoc(id: string, reply: FastifyReply) {
  const [d] = isUuid(id) ? await db.select().from(billingDocuments).where(eq(billingDocuments.id, id)) : []
  if (!d) reply.code(404).send({ error: 'Document introuvable.' })
  return d ?? null
}

/** Statut actuel d'un document (une seule ligne). */
async function statutOf(id: string) {
  const avoir = avoirAlias()
  const [row] = await db
    .select({ statut: statutSql(avoir) })
    .from(billingDocuments)
    .leftJoin(avoir, eq(avoir.factureId, billingDocuments.id))
    .where(eq(billingDocuments.id, id))
  return row!.statut
}

const NOMS = { devis: 'Le devis', facture: 'La facture', avoir: 'L’avoir' }

export async function billingRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requirePerm('billing.manage'))

  app.get('/', async (req, reply) => {
    const parsed = listQuery.safeParse(req.query)
    if (!parsed.success) return reply.code(400).send({ error: 'Filtre invalide.' })
    const { type, statut, q, orderId, clientId } = parsed.data
    const d = billingDocuments
    const avoir = avoirAlias()
    const statutExpr = statutSql(avoir)
    const base: (SQL | undefined)[] = [type ? eq(d.type, type) : undefined, orderId ? eq(d.orderId, orderId) : undefined, clientId ? eq(d.clientId, clientId) : undefined]
    if (q) {
      const like = `%${q.replace(/[%_\\]/g, '\\$&')}%`
      base.push(or(ilike(d.numero, like), ilike(d.clientNom, like), ilike(orders.numero, like)))
    }
    const rows = await db
      .select({
        id: d.id,
        type: d.type,
        numero: d.numero,
        orderId: d.orderId,
        orderNumero: orders.numero,
        clientId: d.clientId,
        client: d.clientNom,
        emisLe: d.emisLe,
        echeance: d.echeance,
        ht: d.ht,
        ttc: d.ttc,
        payeLe: d.payeLe,
        statut: statutExpr,
      })
      .from(d)
      .innerJoin(orders, eq(orders.id, d.orderId))
      .leftJoin(avoir, eq(avoir.factureId, d.id))
      .where(and(...base, statut ? sql`${statutExpr} = ${statut}` : undefined))
      .orderBy(desc(d.emisLe))
      .limit(500)
    // Compteurs par statut et montants, sur le type choisi (sans le filtre de statut)
    const counts = await db
      .select({ statut: statutExpr, n: count(), ttc: sum(d.ttc).mapWith(Number) })
      .from(d)
      .innerJoin(orders, eq(orders.id, d.orderId))
      .leftJoin(avoir, eq(avoir.factureId, d.id))
      .where(and(...base))
      // Regroupe sur la première colonne : le statut (ses paramètres changeraient d'un endroit à l'autre de la requête)
      .groupBy(sql`1`)
    const totals = Object.fromEntries(counts.map((c) => [c.statut, { n: Number(c.n), ttc: c.ttc ?? 0 }]))
    return { documents: rows, totals }
  })

  app.get('/export', async (req, reply) => {
    const parsed = exportQuery.safeParse(req.query)
    if (!parsed.success) return invalid(reply, parsed.error)
    const { type, du, au } = parsed.data
    const d = billingDocuments
    const avoir = avoirAlias()
    const facture = alias(billingDocuments, 'facture_liee')
    const statutExpr = statutSql(avoir)
    const base = { client: d.clientNom, siret: clients.siret, tvaClient: clients.tvaIntra, commande: orders.numero }

    let header: string[]
    let rows: string[][]
    if (type === 'ventes') {
      const found = await db
        .select({ numero: d.numero, type: d.type, emisLe: d.emisLe, echeance: d.echeance, ht: d.ht, taux: d.tauxTva, tva: d.tva, ttc: d.ttc, payeLe: d.payeLe, mode: d.modePaiement, statut: statutExpr, annule: facture.numero, ...base })
        .from(d)
        .innerJoin(orders, eq(orders.id, d.orderId))
        .innerJoin(clients, eq(clients.id, d.clientId))
        .leftJoin(avoir, eq(avoir.factureId, d.id))
        .leftJoin(facture, eq(facture.id, d.factureId))
        .where(and(sql`${d.type} in ('facture', 'avoir')`, sql`(${d.emisLe} at time zone 'Europe/Paris')::date between ${du} and ${au}`))
        .orderBy(d.emisLe, d.numero)
      header = ['Date', 'Type', 'Numéro', 'Facture annulée', 'Commande', 'Client', 'SIRET', 'TVA intracommunautaire', 'Total HT', 'Taux de TVA (%)', 'TVA', 'Total TTC', 'Échéance', 'Statut', 'Payée le', 'Mode de paiement']
      rows = found.map((r) => [csvDate(r.emisLe), r.type === 'avoir' ? 'Avoir' : 'Facture', r.numero, csvText(r.annule), r.commande, csvText(r.client), csvText(r.siret), csvText(r.tvaClient), csvAmount(r.ht), csvAmount(r.taux), csvAmount(r.tva), csvAmount(r.ttc), csvDay(r.echeance), STATUT_LABELS_CSV[r.statut] ?? r.statut, csvDay(r.payeLe), r.mode ? (PAIEMENT_LABELS[r.mode] ?? r.mode) : ''])
    } else {
      const found = await db
        .select({ numero: d.numero, ht: d.ht, tva: d.tva, ttc: d.ttc, payeLe: d.payeLe, mode: d.modePaiement, ...base })
        .from(d)
        .innerJoin(orders, eq(orders.id, d.orderId))
        .innerJoin(clients, eq(clients.id, d.clientId))
        .where(and(eq(d.type, 'facture'), sql`${d.payeLe} between ${du} and ${au}`))
        .orderBy(d.payeLe, d.numero)
      header = ['Date de paiement', 'Mode de paiement', 'Facture', 'Commande', 'Client', 'SIRET', 'Total HT', 'TVA', 'Montant encaissé TTC']
      rows = found.map((r) => [csvDay(r.payeLe), r.mode ? (PAIEMENT_LABELS[r.mode] ?? r.mode) : '', r.numero, r.commande, csvText(r.client), csvText(r.siret), csvAmount(r.ht), csvAmount(r.tva), csvAmount(r.ttc)])
    }
    await audit(req, 'billing.exported', { targetType: 'billing', details: { type, du, au, lignes: rows.length } })
    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${type}-${du}_${au}.csv"`)
      .send(toCsv(header, rows))
  })

  // Émettre un devis depuis une commande (autant de versions que nécessaire)
  app.post('/orders/:orderId/devis', async (req, reply) => {
    const o = await findOrder((req.params as { orderId: string }).orderId, reply)
    if (!o) return
    if (!DEVIS_STATUTS.includes(o.statut)) return reply.code(409).send({ error: `Commande « ${STATUT_LABELS[o.statut]} » : pas de devis possible.` })
    return issue(req, reply, 'devis', o)
  })

  // Émettre la facture d'une commande validée (une seule, sauf si la précédente a été annulée par un avoir)
  app.post('/orders/:orderId/facture', async (req, reply) => {
    const o = await findOrder((req.params as { orderId: string }).orderId, reply)
    if (!o) return
    if (!FACTURE_STATUTS.includes(o.statut)) {
      return reply.code(409).send({ error: o.statut === 'recue' ? 'Validez d’abord la commande avant de la facturer.' : `Commande « ${STATUT_LABELS[o.statut]} » : pas de facture possible.` })
    }
    return issue(req, reply, 'facture', o)
  })

  async function issue(req: Parameters<typeof audit>[0], reply: FastifyReply, type: 'devis' | 'facture', o: typeof orders.$inferSelect) {
    try {
      const doc = await issueFromOrder(type, o, req.user!.id)
      await audit(req, type === 'devis' ? 'billing.devis_created' : 'billing.facture_created', {
        targetType: 'billing',
        targetId: doc.id,
        details: { numero: doc.numero, commande: o.numero, client: doc.client, ttc: doc.ttc },
      })
      return reply.code(201).send({ id: doc.id, numero: doc.numero })
    } catch (e) {
      if (e instanceof BillingConflict) return reply.code(409).send({ error: e.message })
      throw e
    }
  }

  app.get('/:id', async (req, reply) => {
    const doc = await findDoc((req.params as { id: string }).id, reply)
    if (!doc) return
    const { pdf: _pdf, ...rest } = doc
    const [[order], [creator], linked, statut] = await Promise.all([
      db.select({ id: orders.id, numero: orders.numero, statut: orders.statut }).from(orders).where(eq(orders.id, doc.orderId)),
      doc.createdBy ? db.select({ nom: users.nom }).from(users).where(eq(users.id, doc.createdBy)) : Promise.resolve([]),
      // Facture → son avoir éventuel ; avoir → la facture annulée
      doc.type === 'facture'
        ? db.select({ id: billingDocuments.id, numero: billingDocuments.numero }).from(billingDocuments).where(eq(billingDocuments.factureId, doc.id))
        : doc.factureId
          ? db.select({ id: billingDocuments.id, numero: billingDocuments.numero }).from(billingDocuments).where(eq(billingDocuments.id, doc.factureId))
          : Promise.resolve([]),
      statutOf(doc.id),
    ])
    return { document: { ...rest, statut, createdByNom: creator?.nom ?? null }, order: { ...order!, statutLabel: STATUT_LABELS[order!.statut] }, lie: linked[0] ?? null }
  })

  // Le PDF tel qu'il a été émis
  app.get('/:id/pdf', async (req, reply) => {
    const doc = await findDoc((req.params as { id: string }).id, reply)
    if (!doc) return
    return reply.header('Content-Type', 'application/pdf').header('Content-Disposition', `inline; filename="${doc.numero}.pdf"`).send(doc.pdf)
  })

  // Message proposé pour l'envoi par e-mail (modifiable avant l'envoi)
  app.get('/:id/email', async (req, reply) => {
    const doc = await findDoc((req.params as { id: string }).id, reply)
    if (!doc) return
    const [[client], company] = await Promise.all([db.select().from(clients).where(eq(clients.id, doc.clientId)), getCompany()])
    return { configure: isMailConfigured(), fichier: `${doc.numero}.pdf`, ...defaultDocumentMail(doc, client!, company) }
  })

  // Envoie le PDF au client, puis marque le document comme envoyé
  app.post('/:id/email', async (req, reply) => {
    const doc = await findDoc((req.params as { id: string }).id, reply)
    if (!doc) return
    const parsed = emailBody.safeParse(req.body)
    if (!parsed.success) {
      // Le champ est « to », pas « to.0 » : il désigne la zone du formulaire
      const issue = parsed.error.issues[0]
      return reply.code(400).send({ error: issue?.message ?? 'Données invalides.', field: issue?.path[0] !== undefined ? String(issue.path[0]) : undefined })
    }
    if (!isMailConfigured()) return reply.code(503).send({ error: 'L’envoi d’e-mails n’est pas configuré sur ce serveur. Ouvrez le PDF pour l’envoyer vous-même.' })
    const result = await sendMail({
      kind: 'document',
      to: parsed.data.to,
      subject: parsed.data.sujet,
      text: parsed.data.message,
      attachments: [{ filename: `${doc.numero}.pdf`, content: doc.pdf, contentType: 'application/pdf' }],
      targetType: 'billing',
      targetId: doc.id,
      userId: req.user!.id,
    })
    if (!result.ok) return reply.code(502).send({ error: `Le message n’a pas été envoyé : ${result.error}. Réessayez, ou ouvrez le PDF pour l’envoyer vous-même.` })
    // Un avoir n'a pas de suivi d'envoi ; un devis ou une facture est maintenant « envoyé »
    let envoyeLe = doc.envoyeLe
    if (doc.type !== 'avoir' && !doc.envoyeLe) {
      const [row] = await db.update(billingDocuments).set({ envoyeLe: new Date(), updatedAt: new Date() }).where(eq(billingDocuments.id, doc.id)).returning({ envoyeLe: billingDocuments.envoyeLe })
      envoyeLe = row!.envoyeLe
    }
    await audit(req, 'billing.emailed', { targetType: 'billing', targetId: doc.id, details: { numero: doc.numero, client: doc.clientNom, destinataires: parsed.data.to.length } })
    return { ok: true, envoyeLe }
  })

  app.post('/:id/envoi', async (req, reply) => {
    const doc = await findDoc((req.params as { id: string }).id, reply)
    if (!doc) return
    if (doc.type === 'avoir') return reply.code(409).send({ error: 'Un avoir n’a pas de suivi d’envoi.' })
    if (doc.envoyeLe) return { envoyeLe: doc.envoyeLe }
    const statut = await statutOf(doc.id)
    if (['refuse', 'accepte', 'annulee', 'payee'].includes(statut)) return reply.code(409).send({ error: `${NOMS[doc.type]} est déjà traité${doc.type === 'facture' ? 'e' : ''}.` })
    const [row] = await db.update(billingDocuments).set({ envoyeLe: new Date(), updatedAt: new Date() }).where(eq(billingDocuments.id, doc.id)).returning({ envoyeLe: billingDocuments.envoyeLe })
    await audit(req, 'billing.sent', { targetType: 'billing', targetId: doc.id, details: { numero: doc.numero, client: doc.clientNom } })
    return { envoyeLe: row!.envoyeLe }
  })

  app.post('/:id/reponse', async (req, reply) => {
    const doc = await findDoc((req.params as { id: string }).id, reply)
    if (!doc) return
    if (doc.type !== 'devis') return reply.code(409).send({ error: 'Seul un devis s’accepte ou se refuse.' })
    const parsed = reponseBody.safeParse(req.body)
    if (!parsed.success) return invalid(reply, parsed.error)
    if (doc.reponse) return reply.code(409).send({ error: `Ce devis est déjà ${doc.reponse === 'accepte' ? 'accepté' : 'refusé'}.` })
    if (parsed.data.reponse === 'accepte' && doc.echeance! < todayParis()) return reply.code(409).send({ error: 'Ce devis a expiré : émettez-en un nouveau, aux tarifs actuels.' })
    await db.update(billingDocuments).set({ reponse: parsed.data.reponse, reponseLe: new Date(), updatedAt: new Date() }).where(eq(billingDocuments.id, doc.id))
    await audit(req, 'billing.devis_answered', { targetType: 'billing', targetId: doc.id, details: { numero: doc.numero, client: doc.clientNom, reponse: parsed.data.reponse } })
    return { statut: parsed.data.reponse }
  })

  app.post('/:id/paiement', async (req, reply) => {
    const doc = await findDoc((req.params as { id: string }).id, reply)
    if (!doc) return
    if (doc.type !== 'facture') return reply.code(409).send({ error: 'Seule une facture se paie.' })
    const parsed = paiementBody.safeParse(req.body)
    if (!parsed.success) return invalid(reply, parsed.error)
    const statut = await statutOf(doc.id)
    if (statut === 'annulee') return reply.code(409).send({ error: 'Cette facture est annulée par un avoir.' })
    if (statut === 'payee') return reply.code(409).send({ error: 'Le paiement de cette facture est déjà enregistré.' })
    const { date, mode } = parsed.data
    const emise = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(doc.emisLe)
    if (date > todayParis()) return reply.code(400).send({ error: 'La date de paiement ne peut pas être dans le futur.', field: 'date' })
    if (date < emise) return reply.code(400).send({ error: 'La date de paiement est antérieure à la facture.', field: 'date' })
    await db.update(billingDocuments).set({ payeLe: date, modePaiement: mode, updatedAt: new Date() }).where(eq(billingDocuments.id, doc.id))
    await audit(req, 'billing.paid', { targetType: 'billing', targetId: doc.id, details: { numero: doc.numero, client: doc.clientNom, ttc: doc.ttc, date, mode } })
    return { statut: 'payee' }
  })

  // Paiement saisi par erreur
  app.delete('/:id/paiement', async (req, reply) => {
    const doc = await findDoc((req.params as { id: string }).id, reply)
    if (!doc) return
    if (doc.type !== 'facture' || !doc.payeLe) return reply.code(409).send({ error: 'Aucun paiement enregistré sur ce document.' })
    await db.update(billingDocuments).set({ payeLe: null, modePaiement: null, updatedAt: new Date() }).where(eq(billingDocuments.id, doc.id))
    await audit(req, 'billing.payment_cancelled', { targetType: 'billing', targetId: doc.id, details: { numero: doc.numero, client: doc.clientNom, date: doc.payeLe, mode: doc.modePaiement } })
    return { statut: await statutOf(doc.id) }
  })

  // Avoir : annule entièrement la facture. Pour corriger, on refait ensuite une facture.
  app.post('/:id/avoir', async (req, reply) => {
    const doc = await findDoc((req.params as { id: string }).id, reply)
    if (!doc) return
    if (doc.type !== 'facture') return reply.code(409).send({ error: 'Un avoir s’établit sur une facture.' })
    const parsed = avoirBody.safeParse(req.body)
    if (!parsed.success) return invalid(reply, parsed.error)
    try {
      const avoir = await issueCreditNote(doc, parsed.data.motif, req.user!.id)
      await audit(req, 'billing.avoir_created', { targetType: 'billing', targetId: avoir.id, details: { numero: avoir.numero, facture: doc.numero, client: doc.clientNom, ttc: -doc.ttc, motif: parsed.data.motif } })
      return reply.code(201).send({ id: avoir.id, numero: avoir.numero })
    } catch (e) {
      if (isUniqueViolation(e)) return reply.code(409).send({ error: 'Cette facture est déjà annulée par un avoir.' })
      throw e
    }
  })
}
