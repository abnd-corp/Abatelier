import type { FastifyInstance } from 'fastify'
import { asc, inArray, sql } from 'drizzle-orm'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { clients, orderLines, orders } from '../db/schema.js'
import { isPrivateIp } from '../network.js'
import { PRODUCTION_STATUTS } from '../orders.js'
import { clientName } from './clients.js'

// Écran de l'atelier : le tableau des commandes en cours, en lecture seule. Sans connexion (c'est un écran fixé au mur),
// mais seulement depuis le réseau interne : une requête venue d'internet reçoit un 404, comme si la page n'existait pas.
// Seulement le numéro, le nom du client (pour reconnaître la commande), les pièces, la date prévue et le mode de remise : ni coordonnées ni prix.
export async function ecranRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (req, reply) => {
    if (!isPrivateIp(req.ip)) return reply.code(404).send({ error: 'Introuvable.' })
  })

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
      .select({
        id: orders.id,
        numero: orders.numero,
        statut: orders.statut,
        livraisonMode: orders.livraisonMode,
        datePrevue: orders.datePrevue,
        pieces: pieces.n,
        modeles: pieces.modeles,
        type: clients.type,
        raisonSociale: clients.raisonSociale,
        prenom: clients.prenom,
        nom: clients.nom,
      })
      .from(orders)
      .leftJoin(clients, eq(clients.id, orders.clientId))
      .leftJoin(pieces, eq(pieces.orderId, orders.id))
      .where(inArray(orders.statut, PRODUCTION_STATUTS))
      .orderBy(asc(orders.datePrevue), asc(orders.numero))
    return {
      orders: rows.map(({ type, raisonSociale, prenom, nom, ...r }) => ({
        ...r,
        client: type ? clientName({ type, raisonSociale, prenom, nom }) : '',
        pieces: r.pieces ?? 0,
        modeles: r.modeles ?? '',
      })),
      now: new Date().toISOString(),
    }
  })
}
