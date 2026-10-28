import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { and, asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/index.js'
import { billingDocuments, clients, ORDER_STATUTS, orderEvents, orderLines, orders, payments, type Client } from '../db/schema.js'
import { requirePerm } from '../auth/plugin.js'
import { audit } from '../audit.js'
import { allocateNumber } from '../documents.js'
import { distanceFromAtelier } from '../delivery.js'
import { GeoUnavailable } from '../geo.js'
import { colorLabel, isError, lineValues, materialLabel, priceLine, priceOrder, type PricedLine, type Totals } from '../quote.js'
import { changeStatus, eventsOf, loadCatalog, NEXT, STATUT_LABELS } from '../orders.js'
import { clientName } from './clients.js'
import { activeInvoice, issueCreditNote } from '../billing.js'
import { PaymentError, providerOf } from '../payments.js'
import { sendMail, withTimeout } from '../mail.js'
import { orderRefused } from '../mail-texts.js'
import { getCompany } from '../documents.js'
import { facturxMissingFor } from '../facturx.js'

const int = (min: number, max: number, label: string) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() !== '' ? Number(v) : v),
    z
      .number({ error: `${label} : nombre attendu.` })
      .int(`${label} : nombre entier attendu.`)
      .min(min, `${label} : ${min} minimum.`)
      .max(max, `${label} : ${max} maximum.`),
  )

export const line = z.object({
  repere: z.string().trim().max(60, 'Repère : 60 caractères maximum.').nullish(),
  modelId: z.uuid('Choisissez un modèle.'),
  materialId: z.uuid('Choisissez une matière.'),
  colorId: z.uuid('Choisissez un coloris.'),
  cotes: z
    .array(int(1, 2000, 'Cote'))
    .min(1, 'Au moins une cote.')
    .max(20, '20 cotes maximum.'),
  // Angle intérieur du pli ; négatif quand le pli se fait dans l'autre sens ; ±1 pour une pince (voir profile.ts)
  angles: z.array(int(-179, 179, 'Angle').refine((a) => a !== 0, 'Angle : 0° impossible.')).max(19),
  longueur: int(1, 20000, 'Longueur'),
  quantite: int(1, 9999, 'Quantité'),
  accessoires: z
    .array(z.object({ accessoryId: z.uuid('Accessoire inconnu.'), quantite: int(0, 9999, 'Quantité d’accessoires') }))
    .max(20)
    .default([]),
})

export const livraison = z.discriminatedUnion(
  'mode',
  [
    z.object({ mode: z.literal('retrait') }),
    z.object({
      mode: z.literal('livraison'),
      adresse: z.string().trim().min(1, 'Indiquez l’adresse de livraison.').max(200),
      codePostal: z
        .string()
        .trim()
        .regex(/^\d{5}$/, 'Code postal : 5 chiffres.'),
      ville: z.string().trim().min(1, 'Indiquez la ville de livraison.').max(80),
    }),
  ],
  { error: 'Choisissez le retrait à l’atelier ou la livraison.' },
)

export const orderBody = z.object({
  clientId: z.uuid('Choisissez un client.'),
  lignes: z.array(line).min(1, 'Ajoutez au moins une pièce.').max(50, '50 pièces maximum par commande.'),
  livraison,
  notes: z
    .string()
    .trim()
    .max(2000, 'Notes : 2000 caractères maximum.')
    .nullish()
    .transform((v) => v || null),
})

const statusBody = z.object({
  statut: z.enum(ORDER_STATUTS, { error: 'Étape inconnue.' }),
  note: z
    .string()
    .trim()
    .max(500, 'Note : 500 caractères maximum.')
    .nullish()
    .transform((v) => v || null),
})

const refusBody = z.object({
  motif: z.string().trim().min(1, 'Indiquez le motif du refus : il est transmis au client.').max(500, 'Motif : 500 caractères maximum.'),
})

const FILTRES = ['en_cours', 'toutes', ...ORDER_STATUTS] as const
const EN_COURS = ['recue', 'validee', 'fabrication', 'prete'] as const
const listQuery = z.object({
  filtre: z.enum(FILTRES).default('en_cours'),
  q: z.string().trim().max(80).optional(),
  clientId: z.uuid().optional(),
})

/** Erreur de validation avec le chemin complet du champ (« lignes.0.cotes.2 »). */
function invalidPath(reply: FastifyReply, e: z.ZodError) {
  const issue = e.issues[0]
  return reply.code(400).send({ error: issue?.message ?? 'Données invalides.', field: issue?.path.length ? issue.path.join('.') : undefined })
}

export type Body = z.infer<typeof orderBody>
type Priced = { client: Client; lines: PricedLine[]; totals: Totals; distanceKm: number | null }

type Failure = { status: number; error: string; field?: string }

/**
 * Chiffre des pièces et une livraison avec le catalogue actuel, pour un professionnel (remise pro) ou un particulier.
 * Sert à l'atelier comme au configurateur public : un seul calcul.
 */
export async function priceBody(body: Pick<Body, 'lignes' | 'livraison'>, pro: boolean): Promise<Failure | { lines: PricedLine[]; totals: Totals; distanceKm: number | null }> {
  const catalog = await loadCatalog()
  const lines: PricedLine[] = []
  for (const [i, l] of body.lignes.entries()) {
    const priced = priceLine(l, i, catalog)
    if (isError(priced)) return { status: 400, ...priced }
    lines.push(priced)
  }
  let distanceKm: number | null = null
  if (body.livraison.mode === 'livraison') {
    const { adresse, codePostal, ville } = body.livraison
    try {
      const d = await distanceFromAtelier(catalog.delivery, `${adresse} ${codePostal} ${ville}`)
      if (!d) return { status: 400, error: 'Adresse de livraison introuvable : vérifiez la rue, le code postal et la commune.', field: 'livraison' }
      distanceKm = d.km
    } catch (e) {
      if (e instanceof GeoUnavailable) return { status: 503, error: 'Le service de localisation des adresses ne répond pas. Réessayez dans quelques minutes.', field: 'livraison' }
      throw e
    }
  }
  const totals = priceOrder(lines, { pro, delivery: distanceKm === null ? { mode: 'retrait' } : { mode: 'livraison', distanceKm } }, catalog)
  if (isError(totals)) return { status: 400, ...totals }
  return { lines, totals, distanceKm }
}

/** Chiffre la commande d'un client de l'atelier. Renvoie l'erreur à afficher, ou le chiffrage. */
async function quote(body: Body): Promise<Failure | Priced> {
  const [client] = await db.select().from(clients).where(eq(clients.id, body.clientId))
  if (!client) return { status: 400, error: 'Client introuvable.', field: 'clientId' }
  if (client.archivedAt) return { status: 400, error: 'Ce client est archivé : sortez-le des archives pour lui passer une commande.', field: 'clientId' }
  const priced = await priceBody(body, client.type === 'professionnel' && client.proVerifie)
  return 'error' in priced ? priced : { client, ...priced }
}

const isPriced = (x: Awaited<ReturnType<typeof quote>>): x is Priced => 'lines' in x

const orderValues = (body: Body, p: Priced) => ({
  clientId: p.client.id,
  livraisonMode: body.livraison.mode,
  livraisonAdresse: body.livraison.mode === 'livraison' ? body.livraison.adresse : null,
  livraisonCodePostal: body.livraison.mode === 'livraison' ? body.livraison.codePostal : null,
  livraisonVille: body.livraison.mode === 'livraison' ? body.livraison.ville : null,
  distanceKm: p.distanceKm,
  notes: body.notes,
  brut: p.totals.brut,
  remisePro: p.totals.remisePro,
  complementMinimum: p.totals.complementMinimum,
  livraisonPrix: p.totals.livraisonPrix,
  ht: p.totals.ht,
  tauxTva: p.totals.tauxTva,
  tva: p.totals.tva,
  ttc: p.totals.ttc,
  delaiJours: p.totals.delaiJours,
})

async function findOrder(id: string, reply: FastifyReply) {
  const [o] = z.uuid().safeParse(id).success ? await db.select().from(orders).where(eq(orders.id, id)) : []
  if (!o) reply.code(404).send({ error: 'Commande introuvable.' })
  return o ?? null
}

const clientColumns = { type: clients.type, raisonSociale: clients.raisonSociale, prenom: clients.prenom, nom: clients.nom }

/** Ce qu'il faut pour saisir une commande : modèles, matières, coloris, accessoires actifs et limites de la plieuse (rien de confidentiel). */
export async function orderCatalog() {
  const c = await loadCatalog()
  const s = c.settings
  const byPos = <T extends { position: number; nom: string }>(a: T[]) => a.sort((x, y) => x.position - y.position || x.nom.localeCompare(y.nom))
  return {
    models: byPos(c.models.filter((m) => m.actif)).map((m) => ({ id: m.id, nom: m.nom, cotes: m.cotes, angles: m.angles, noms: m.noms, cap: m.cap, longueur: m.longueur, quantite: m.quantite })),
    materials: byPos(c.materials.filter((m) => m.actif)).map((m) => ({ id: m.id, label: materialLabel(m), epaisseur: m.epaisseur, retourMin: m.retourMin })),
    colors: byPos(c.colors.filter((x) => x.actif)).map((x) => ({ id: x.id, label: colorLabel(x), hex: x.hex })),
    accessories: byPos(c.accessories.filter((a) => a.actif)).map((a) => ({
      id: a.id,
      nom: a.nom,
      prix: a.prix,
      unite: a.unite,
      modeles: a.modeles,
      quantiteAuto: a.quantiteAuto,
      quantiteFixe: a.quantiteFixe,
    })),
    limits: { largeurTole: s.largeurTole, longueurMin: s.longueurMin, longueurMax: s.longueurMax, plisMax: s.plisMax, angleMin: s.angleMin, angleMax: s.angleMax, pince: s.pinceAutorisee },
    retrait: c.delivery.retraitActif,
  }
}

/** Enregistre une commande déjà validée par zod : chiffrage, numéro, lignes, première étape et journal. */
export async function placeOrder(
  req: FastifyRequest,
  body: Body,
  // Par défaut l'utilisateur connecté ; pour un client du site, aucun utilisateur de l'atelier (userId null) et l'origine est notée au journal
  by: { userId: string | null; origine?: string } = { userId: req.user?.id ?? null },
): Promise<Failure | { id: string; numero: string }> {
  const p = await quote(body)
  if (!isPriced(p)) return p
  const order = await db.transaction(async (tx) => {
    const { label } = await allocateNumber(tx, 'commande')
    const [o] = await tx
      .insert(orders)
      .values({ ...orderValues(body, p), numero: label, createdBy: by.userId })
      .returning()
    await tx.insert(orderLines).values(lineValues(o!.id, p.lines))
    await tx.insert(orderEvents).values({ orderId: o!.id, statut: 'recue', userId: by.userId, note: by.origine ? 'Demandée depuis l’espace client' : null })
    return o!
  })
  await audit(req, 'order.created', {
    ...(by.origine ? { actor: null, identifiant: `espace:${p.client.id}` } : {}),
    targetType: 'order',
    targetId: order.id,
    details: {
      numero: order.numero,
      client: clientName(p.client),
      clientId: p.client.id,
      ht: order.ht,
      pieces: p.lines.reduce((s, l) => s + l.quantite, 0),
      ...(by.origine ? { origine: by.origine } : {}),
    },
  })
  return { id: order.id, numero: order.numero }
}

export async function orderRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requirePerm('orders.manage'))

  app.get('/', async (req, reply) => {
    const parsed = listQuery.safeParse(req.query)
    if (!parsed.success) return reply.code(400).send({ error: 'Filtre invalide.' })
    const { filtre, q, clientId } = parsed.data
    const filters: (SQL | undefined)[] = [
      filtre === 'en_cours' ? inArray(orders.statut, [...EN_COURS]) : filtre === 'toutes' ? undefined : eq(orders.statut, filtre),
      clientId ? eq(orders.clientId, clientId) : undefined,
    ]
    if (q) {
      const like = `%${q.replace(/[%_\\]/g, '\\$&')}%`
      filters.push(or(ilike(orders.numero, like), ilike(clients.raisonSociale, like), ilike(sql`coalesce(${clients.prenom}, '') || ' ' || coalesce(${clients.nom}, '')`, like)))
    }
    const pieces = db
      .select({ orderId: orderLines.orderId, n: sql<number>`sum(${orderLines.quantite})::int`.as('n') })
      .from(orderLines)
      .groupBy(orderLines.orderId)
      .as('pieces')
    const rows = await db
      .select({
        id: orders.id,
        numero: orders.numero,
        statut: orders.statut,
        kind: orders.kind,
        clientId: orders.clientId,
        ...clientColumns,
        livraisonMode: orders.livraisonMode,
        livraisonVille: orders.livraisonVille,
        ht: orders.ht,
        ttc: orders.ttc,
        datePrevue: orders.datePrevue,
        createdAt: orders.createdAt,
        pieces: pieces.n,
      })
      .from(orders)
      .innerJoin(clients, eq(clients.id, orders.clientId))
      .leftJoin(pieces, eq(pieces.orderId, orders.id))
      .where(and(...filters))
      .orderBy(desc(orders.createdAt))
      .limit(500)
    const counts = await db
      .select({ statut: orders.statut, n: count() })
      .from(orders)
      .where(clientId ? eq(orders.clientId, clientId) : undefined)
      .groupBy(orders.statut)
    const totals = Object.fromEntries(ORDER_STATUTS.map((s) => [s, Number(counts.find((c) => c.statut === s)?.n ?? 0)]))
    return {
      orders: rows.map(({ type, raisonSociale, prenom, nom, pieces, ...o }) => ({ ...o, pieces: pieces ?? 0, client: clientName({ type, raisonSociale, prenom, nom }) })),
      totals,
    }
  })

  // Catalogue actif et limites des machines, pour le formulaire de commande
  app.get('/catalog', async () => orderCatalog())

  // Chiffrage en direct, sans rien enregistrer
  app.post('/quote', async (req, reply) => {
    const parsed = orderBody.safeParse(req.body)
    if (!parsed.success) return invalidPath(reply, parsed.error)
    const p = await quote(parsed.data)
    if (!isPriced(p)) return reply.code(p.status).send({ error: p.error, field: p.field })
    return { lignes: p.lines, totals: p.totals, distanceKm: p.distanceKm }
  })

  app.post('/', async (req, reply) => {
    const parsed = orderBody.safeParse(req.body)
    if (!parsed.success) return invalidPath(reply, parsed.error)
    const placed = await placeOrder(req, parsed.data)
    if ('error' in placed) return reply.code(placed.status).send({ error: placed.error, field: placed.field })
    return reply.code(201).send(placed)
  })

  app.get('/:id', async (req, reply) => {
    const o = await findOrder((req.params as { id: string }).id, reply)
    if (!o) return
    const [[client], lignes, events, company, [pay]] = await Promise.all([
      db.select().from(clients).where(eq(clients.id, o.clientId)),
      db.select().from(orderLines).where(eq(orderLines.orderId, o.id)).orderBy(asc(orderLines.position)),
      eventsOf(o.id),
      getCompany(),
      db.select().from(payments).where(eq(payments.orderId, o.id)),
    ])
    return {
      // Paiement en ligne (boutique) : montant, date, et remboursement éventuel. Jamais d'identifiant du prestataire.
      paiement: pay ? { statut: pay.statut, montantTtc: pay.montantTtc, paidAt: pay.paidAt, refundedAt: pay.refundedAt, refundMotif: pay.refundMotif, prestataire: pay.provider } : null,
      order: { ...o, statutLabel: STATUT_LABELS[o.statut], next: NEXT[o.statut] },
      client: { id: client!.id, nom: clientName(client!), type: client!.type, telephone: client!.telephone, email: client!.email },
      lignes: lignes.map(({ orderId: _o, ...l }) => l),
      events,
      // Ce qui empêcherait la facture d'être une facture électronique conforme (l'émission reste possible)
      facturx: { manque: facturxMissingFor(company, client!) },
    }
  })

  // Modifier les pièces, la livraison ou les notes : seulement avant la validation
  app.patch('/:id', async (req, reply) => {
    const o = await findOrder((req.params as { id: string }).id, reply)
    if (!o) return
    if (o.kind === 'boutique') return reply.code(409).send({ error: 'Les articles d’une commande de la boutique ne se modifient pas : elle a été payée telle quelle.' })
    if (o.statut !== 'recue') return reply.code(409).send({ error: 'La commande est validée : ses pièces ne se modifient plus.' })
    const parsed = orderBody.safeParse({ clientId: o.clientId, ...(req.body as object) })
    if (!parsed.success) return invalidPath(reply, parsed.error)
    if (parsed.data.clientId !== o.clientId) return reply.code(400).send({ error: 'Le client d’une commande ne change pas.', field: 'clientId' })
    const p = await quote(parsed.data)
    if (!isPriced(p)) return reply.code(p.status).send({ error: p.error, field: p.field })
    await db.transaction(async (tx) => {
      await tx
        .update(orders)
        .set({ ...orderValues(parsed.data, p), updatedAt: new Date() })
        .where(eq(orders.id, o.id))
      await tx.delete(orderLines).where(eq(orderLines.orderId, o.id))
      await tx.insert(orderLines).values(lineValues(o.id, p.lines))
    })
    await audit(req, 'order.updated', { targetType: 'order', targetId: o.id, details: { numero: o.numero, avant: o.ht, apres: p.totals.ht } })
    return { ok: true }
  })

  app.post('/:id/status', async (req, reply) => {
    const o = await findOrder((req.params as { id: string }).id, reply)
    if (!o) return
    const parsed = statusBody.safeParse(req.body)
    if (!parsed.success) return invalidPath(reply, parsed.error)
    const { statut, note } = parsed.data
    if (!NEXT[o.statut].includes(statut)) {
      return reply.code(409).send({ error: `Une commande « ${STATUT_LABELS[o.statut]} » ne peut pas passer à « ${STATUT_LABELS[statut]} ».`, field: 'statut' })
    }
    if (statut === 'annulee' && !note) return reply.code(400).send({ error: 'Indiquez la raison de l’annulation.', field: 'note' })
    if (statut === 'annulee' && (await paidOnline(o.id)))
      return reply.code(409).send({ error: 'Cette commande a été payée en ligne : pour l’annuler, utilisez « Refuser et rembourser », qui rembourse le client.', field: 'statut' })
    if (statut === 'annulee') {
      const facture = await activeInvoice(o.id)
      if (facture) return reply.code(409).send({ error: `La commande est facturée (${facture.numero}) : faites d’abord un avoir pour annuler la facture.`, field: 'statut' })
    }
    const datePrevue = await changeStatus(req, o, statut, note)
    return { statut, datePrevue }
  })

  // Commande payée en ligne que l'atelier ne peut pas réaliser : elle est refusée et le client est remboursé en totalité.
  // Le contrat se formait au paiement ; ce refus le défait, avec le motif donné au client.
  app.post('/:id/refus', async (req, reply) => {
    const o = await findOrder((req.params as { id: string }).id, reply)
    if (!o) return
    const parsed = refusBody.safeParse(req.body)
    if (!parsed.success) return invalidPath(reply, parsed.error)
    const pay = await paidOnline(o.id)
    if (!pay) return reply.code(409).send({ error: 'Seule une commande payée en ligne se refuse et se rembourse. Pour une autre commande, utilisez l’annulation.' })
    if (o.statut === 'livree' || o.statut === 'annulee') return reply.code(409).send({ error: `Une commande « ${STATUT_LABELS[o.statut]} » ne peut plus être refusée.` })
    const provider = providerOf(pay.provider)
    if (!provider || !pay.providerRef) return reply.code(409).send({ error: 'Ce paiement ne peut pas être remboursé automatiquement : remboursez-le chez le prestataire de paiement.' })
    const motif = parsed.data.motif
    let refundRef: string
    try {
      // Le remboursement d'abord : s'il échoue, rien n'a changé et la commande reste à traiter
      refundRef = (await provider.refund({ paymentId: pay.id, ref: pay.providerRef, providerPayment: pay.providerPayment, montantCents: Math.round(pay.montantTtc * 100) })).ref
    } catch (e) {
      if (e instanceof PaymentError) return reply.code(502).send({ error: e.message })
      throw e
    }
    await db.update(payments).set({ statut: 'rembourse', refundedAt: new Date(), refundRef, refundMotif: motif }).where(eq(payments.id, pay.id))
    // Une facture déjà émise est annulée par un avoir, comme toujours
    const facture = await activeInvoice(o.id)
    let avoir: string | null = null
    if (facture) {
      const [doc] = await db.select().from(billingDocuments).where(eq(billingDocuments.id, facture.id))
      const credit = await issueCreditNote(doc!, `Commande refusée et remboursée : ${motif}`, req.user!.id)
      avoir = credit.numero
      await audit(req, 'billing.avoir_created', {
        targetType: 'billing',
        targetId: credit.id,
        details: { numero: credit.numero, facture: facture.numero, client: doc!.clientNom, ttc: -doc!.ttc, motif },
      })
    }
    await changeStatus(req, o, 'annulee', `Refusée par l’atelier, client remboursé : ${motif}`)
    await audit(req, 'order.refused', { targetType: 'order', targetId: o.id, details: { numero: o.numero, montant: pay.montantTtc, motif, ...(avoir ? { avoir } : {}) } })
    // Le client est prévenu, avec le motif ; un échec d'envoi n'annule rien
    const [c] = await db.select().from(clients).where(eq(clients.id, o.clientId))
    if (c?.email) {
      const entreprise = (await getCompany()).raisonSociale
      const mail = orderRefused({
        nom: clientName(c),
        numero: o.numero,
        motif,
        ttc: pay.montantTtc,
        espace: `${req.headers['x-forwarded-proto'] ?? req.protocol}://${req.headers.host}/espace`,
        entreprise,
      })
      await withTimeout(
        sendMail({
          kind: 'contact',
          to: [c.email],
          subject: mail.subject,
          text: mail.text,
          htmlText: mail.htmlText,
          titre: mail.titre,
          faits: mail.faits,
          espace: mail.espace,
          targetType: 'order',
          targetId: o.id,
          userId: req.user!.id,
        }),
        6000,
        { ok: false, notConfigured: false, error: 'délai dépassé' },
      )
    }
    return { statut: 'annulee', rembourse: pay.montantTtc, avoir }
  })
}

/** Paiement en ligne encaissé de la commande (sinon null). */
async function paidOnline(orderId: string) {
  const [p] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.orderId, orderId), eq(payments.statut, 'paye')))
  return p ?? null
}
