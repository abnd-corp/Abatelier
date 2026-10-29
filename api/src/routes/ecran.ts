import type { FastifyInstance } from 'fastify'
import { asc, inArray, sql } from 'drizzle-orm'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { orderLines, orders } from '../db/schema.js'
import { requireAuth } from '../auth/plugin.js'
import { PRODUCTION_STATUTS } from '../orders.js'

// Écran de l'atelier : le tableau des commandes en cours, en lecture seule, ouvert à tout compte connecté.
// Il n'a pas de mot à dire sur le client ni sur les prix : seulement le numéro, les pièces, la date prévue et le mode de remise.
export async function ecranRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth)

  app.get('/', async () => {
    const pieces = db
      .select({
        orderId: orderLines.orderId,
        n: sql<number>`sum(${orderLines.quantite})::int`.as('n'),
        modeles: sql<string>`string_agg(distinct ${orderLines.modeleLabel}, ', ')`.as('modeles'),
      })
      .from(orderLines)
      .groupBy(orderLines.orderId)
      .as('pieces')
    const rows = await db
      .select({ id: orders.id, numero: orders.numero, statut: orders.statut, livraisonMode: orders.livraisonMode, datePrevue: orders.datePrevue, pieces: pieces.n, modeles: pieces.modeles })
      .from(orders)
      .leftJoin(pieces, eq(pieces.orderId, orders.id))
      .where(inArray(orders.statut, PRODUCTION_STATUTS))
      .orderBy(asc(orders.datePrevue), asc(orders.numero))
    return { orders: rows.map((r) => ({ ...r, pieces: r.pieces ?? 0, modeles: r.modeles ?? '' })), now: new Date().toISOString() }
  })
}
