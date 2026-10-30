import type { FastifyInstance } from 'fastify'
import { and, asc, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '../db/index.js'
import { clients, colors, materials, orderLines, orders, sheetMovements, sheetStock, users } from '../db/schema.js'
import { requirePerm } from '../auth/plugin.js'
import { PRODUCTION_STATUTS } from '../orders.js'
import { clientName } from './clients.js'
import { etatOf, libelle } from './stock.js'

// Plan graphique de l'atelier, réservé à la direction : les commandes à fabriquer et le stock de feuilles, en une seule lecture.
// Lecture seule. Ni prix, ni coordonnées de client : seulement ce qu'il faut pour placer les commandes et les feuilles sur le plan.
const RECEPTION_MINUTES = 20

export async function planRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requirePerm('plan.read'))

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
    const assignee = alias(users, 'assignee')
    const rows = await db
      .select({
        id: orders.id,
        numero: orders.numero,
        statut: orders.statut,
        livraisonMode: orders.livraisonMode,
        datePrevue: orders.datePrevue,
        pieces: pieces.n,
        modeles: pieces.modeles,
        prisPar: assignee.nom,
        clientType: clients.type,
        clientRaisonSociale: clients.raisonSociale,
        clientPrenom: clients.prenom,
        clientNom: clients.nom,
      })
      .from(orders)
      .innerJoin(clients, eq(clients.id, orders.clientId))
      .leftJoin(assignee, eq(assignee.id, orders.productionUserId))
      .leftJoin(pieces, eq(pieces.orderId, orders.id))
      .where(inArray(orders.statut, PRODUCTION_STATUTS))
      // Les plus urgentes d'abord
      .orderBy(asc(orders.datePrevue), asc(orders.numero))

    const stock = await db
      .select({
        id: sheetStock.id,
        matiere: materials.nom,
        epaisseur: materials.epaisseur,
        coloris: colors.nom,
        reference: colors.reference,
        largeur: sheetStock.largeur,
        longueur: sheetStock.longueur,
        chute: sheetStock.chute,
        quantite: sheetStock.quantite,
        seuil: sheetStock.seuil,
      })
      .from(sheetStock)
      .innerJoin(materials, eq(materials.id, sheetStock.materialId))
      .leftJoin(colors, eq(colors.id, sheetStock.colorId))
      // Une référence archivée n'est plus dans l'atelier
      .where(isNull(sheetStock.archivedAt))
      .orderBy(asc(materials.nom), asc(materials.epaisseur), asc(colors.nom), asc(sheetStock.chute), asc(sheetStock.largeur), asc(sheetStock.longueur))

    // Le camion est encore sur le parking : des feuilles sont entrées en stock il y a peu
    const since = new Date(Date.now() - RECEPTION_MINUTES * 60_000)
    const recus = await db
      .select({ delta: sheetMovements.delta })
      .from(sheetMovements)
      .where(and(eq(sheetMovements.motif, 'reception'), gte(sheetMovements.createdAt, since)))
      .orderBy(desc(sheetMovements.createdAt))

    return {
      orders: rows.map(({ clientType, clientRaisonSociale, clientPrenom, clientNom, pieces: n, modeles, ...r }) => ({
        ...r,
        client: clientName({ type: clientType, raisonSociale: clientRaisonSociale, prenom: clientPrenom, nom: clientNom }) || 'Client',
        pieces: n ?? 0,
        modeles: modeles ?? '',
      })),
      feuilles: stock.map((f) => ({ id: f.id, chute: f.chute, quantite: f.quantite, seuil: f.seuil, libelle: libelle(f), etat: etatOf(f.seuil, f.quantite) })),
      reception: recus.some((m) => m.delta > 0) ? { feuilles: recus.filter((m) => m.delta > 0).reduce((s, m) => s + m.delta, 0) } : null,
    }
  })
}
