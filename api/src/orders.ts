import type { FastifyRequest } from 'fastify'
import { asc, eq } from 'drizzle-orm'
import { db } from './db/index.js'
import { accessories, colors, materials, orderEvents, orders, pieceModels, users, type Order, type OrderStatut } from './db/schema.js'
import { getPricingSettings } from './pricing.js'
import { getDeliverySettings } from './delivery.js'
import { addWorkingDays, type Catalog } from './quote.js'
import { todayParis } from './departures.js'
import { audit } from './audit.js'

export const STATUT_LABELS: Record<OrderStatut, string> = {
  recue: 'Reçue',
  validee: 'Validée',
  fabrication: 'En fabrication',
  prete: 'Prête',
  livree: 'Livrée / retirée',
  annulee: 'Annulée',
}

// Étapes possibles depuis chaque statut. Une commande livrée ou annulée ne bouge plus.
export const NEXT: Record<OrderStatut, OrderStatut[]> = {
  recue: ['validee', 'annulee'],
  validee: ['fabrication', 'annulee'],
  fabrication: ['prete', 'annulee'],
  prete: ['livree', 'annulee'],
  livree: [],
  annulee: [],
}

// Commandes que l'atelier voit, et étapes qu'il peut faire avancer
export const PRODUCTION_STATUTS: OrderStatut[] = ['validee', 'fabrication', 'prete']
export const PRODUCTION_STEPS: OrderStatut[] = ['fabrication', 'prete', 'livree']

export async function loadCatalog(): Promise<Catalog> {
  const [models, m, c, a, settings, delivery] = await Promise.all([
    db.select().from(pieceModels),
    db.select().from(materials),
    db.select().from(colors),
    db.select().from(accessories),
    getPricingSettings(),
    getDeliverySettings(),
  ])
  return { models, materials: m, colors: c, accessories: a, settings, delivery }
}

/** Passe la commande à l'étape suivante (déjà vérifiée), la date dans l'historique et le journal. */
export async function changeStatus(req: FastifyRequest, order: Order, statut: OrderStatut, note: string | null) {
  const set: Partial<Order> = { statut, updatedAt: new Date() }
  // Le délai court à partir de la validation
  if (statut === 'validee') set.datePrevue = addWorkingDays(todayParis(), order.delaiJours)
  await db.transaction(async (tx) => {
    await tx.update(orders).set(set).where(eq(orders.id, order.id))
    await tx.insert(orderEvents).values({ orderId: order.id, statut, userId: req.user!.id, note })
  })
  await audit(req, 'order.status_changed', {
    targetType: 'order',
    targetId: order.id,
    details: { numero: order.numero, avant: order.statut, apres: statut, ...(note ? { note } : {}) },
  })
  return set.datePrevue ?? order.datePrevue
}

/** Historique des étapes, avec le nom de la personne. */
export const eventsOf = (orderId: string) =>
  db
    .select({ statut: orderEvents.statut, at: orderEvents.at, note: orderEvents.note, nom: users.nom })
    .from(orderEvents)
    .leftJoin(users, eq(users.id, orderEvents.userId))
    .where(eq(orderEvents.orderId, orderId))
    .orderBy(asc(orderEvents.id))
