import type { FastifyInstance, FastifyReply } from 'fastify'
import { asc, eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/index.js'
import { ORDER_STATUTS, orderLines, orders } from '../db/schema.js'
import { requirePerm } from '../auth/plugin.js'
import { changeStatus, eventsOf, NEXT, PRODUCTION_STATUTS, PRODUCTION_STEPS, STATUT_LABELS } from '../orders.js'
import { getCompany, getTemplate } from '../documents.js'
import { renderProductionSheet } from '../production-sheet.js'
import { audit } from '../audit.js'

// Vue de l'atelier : les commandes à fabriquer, sans rien sur le client (ni nom, ni coordonnées, ni adresse) et sans les prix.

const statusBody = z.object({ statut: z.enum(ORDER_STATUTS, { error: 'Étape inconnue.' }) })

async function findOrder(id: string, reply: FastifyReply) {
  const [o] = z.uuid().safeParse(id).success ? await db.select().from(orders).where(eq(orders.id, id)) : []
  // Une commande pas encore validée, livrée ou annulée n'existe pas pour l'atelier
  if (!o || !PRODUCTION_STATUTS.includes(o.statut)) {
    reply.code(404).send({ error: 'Commande introuvable.' })
    return null
  }
  return o
}

/** Pièces de la commande, sans les prix ni les identifiants du catalogue. */
async function linesOf(orderId: string) {
  const rows = await db
    .select({
      id: orderLines.id,
      repere: orderLines.repere,
      modeleLabel: orderLines.modeleLabel,
      cap: orderLines.cap,
      materialLabel: orderLines.materialLabel,
      colorLabel: orderLines.colorLabel,
      colorHex: orderLines.colorHex,
      cotes: orderLines.cotes,
      angles: orderLines.angles,
      longueur: orderLines.longueur,
      quantite: orderLines.quantite,
      accessoires: orderLines.accessoires,
    })
    .from(orderLines)
    .where(eq(orderLines.orderId, orderId))
    .orderBy(asc(orderLines.position))
  return rows.map((l) => ({ ...l, accessoires: l.accessoires.map((a) => ({ nom: a.nom, unite: a.unite, quantite: a.quantite })) }))
}

const next = (statut: (typeof ORDER_STATUTS)[number]) => NEXT[statut].find((s) => PRODUCTION_STEPS.includes(s)) ?? null

export async function productionRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requirePerm('orders.production'))

  app.get('/', async () => {
    const pieces = db
      .select({ orderId: orderLines.orderId, n: sql<number>`sum(${orderLines.quantite})::int`.as('n'), lignes: sql<number>`count(*)::int`.as('lignes') })
      .from(orderLines)
      .groupBy(orderLines.orderId)
      .as('pieces')
    const rows = await db
      .select({
        id: orders.id,
        numero: orders.numero,
        statut: orders.statut,
        livraisonMode: orders.livraisonMode,
        datePrevue: orders.datePrevue,
        pieces: pieces.n,
        lignes: pieces.lignes,
      })
      .from(orders)
      .leftJoin(pieces, eq(pieces.orderId, orders.id))
      .where(inArray(orders.statut, PRODUCTION_STATUTS))
      // Les plus urgentes d'abord
      .orderBy(asc(orders.datePrevue), asc(orders.numero))
    return { orders: rows.map((r) => ({ ...r, pieces: r.pieces ?? 0, lignes: r.lignes ?? 0, next: next(r.statut) })) }
  })

  app.get('/:id', async (req, reply) => {
    const o = await findOrder((req.params as { id: string }).id, reply)
    if (!o) return
    const lignes = await linesOf(o.id)
    return {
      order: { id: o.id, numero: o.numero, statut: o.statut, statutLabel: STATUT_LABELS[o.statut], livraisonMode: o.livraisonMode, datePrevue: o.datePrevue, next: next(o.statut) },
      lignes,
      events: await eventsOf(o.id),
    }
  })

  // Fiche imprimable : ouverte dans un nouvel onglet, le navigateur l'imprime
  app.get('/:id/fiche.pdf', async (req, reply) => {
    const o = await findOrder((req.params as { id: string }).id, reply)
    if (!o) return
    const [lignes, company, template] = await Promise.all([linesOf(o.id), getCompany(), getTemplate()])
    const pdf = await renderProductionSheet(
      { numero: o.numero, statutLabel: STATUT_LABELS[o.statut], datePrevue: o.datePrevue, livraisonMode: o.livraisonMode, imprimeLe: new Date(), lignes },
      { accent: template.couleur, logo: company.logo },
    )
    await audit(req, 'order.sheet_printed', { targetType: 'order', targetId: o.id, details: { numero: o.numero, statut: o.statut } })
    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `inline; filename="fiche-${o.numero}.pdf"`)
      .header('Cache-Control', 'no-store')
      .send(pdf)
  })

  app.post('/:id/status', async (req, reply) => {
    const o = await findOrder((req.params as { id: string }).id, reply)
    if (!o) return
    const parsed = statusBody.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Étape inconnue.', field: 'statut' })
    if (parsed.data.statut !== next(o.statut)) {
      return reply.code(409).send({ error: `Une commande « ${STATUT_LABELS[o.statut]} » ne peut pas passer à « ${STATUT_LABELS[parsed.data.statut]} » depuis l’atelier.`, field: 'statut' })
    }
    await changeStatus(req, o, parsed.data.statut, null)
    return { statut: parsed.data.statut }
  })
}
