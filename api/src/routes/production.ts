import type { FastifyInstance, FastifyReply } from 'fastify'
import { asc, eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/index.js'
import { colors, materials, ORDER_STATUTS, orderLines, orders, sheetStock } from '../db/schema.js'
import { requirePerm } from '../auth/plugin.js'
import { changeStatus, eventsOf, NEXT, PRODUCTION_STATUTS, PRODUCTION_STEPS, STATUT_LABELS } from '../orders.js'
import { getCompany, getTemplate } from '../documents.js'
import { renderProductionSheet } from '../production-sheet.js'
import { audit } from '../audit.js'
import { adviseSheets, type SheetOption } from '../cutting.js'
import { colorLabel, materialLabel } from '../quote.js'

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
        kind: orders.kind,
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
      order: { id: o.id, numero: o.numero, kind: o.kind, statut: o.statut, statutLabel: STATUT_LABELS[o.statut], livraisonMode: o.livraisonMode, datePrevue: o.datePrevue, next: next(o.statut) },
      lignes,
      events: await eventsOf(o.id),
    }
  })

  // Quelle feuille prendre pour chaque pièce, d'après le stock de l'atelier (matière, épaisseur et coloris de la pièce).
  // Un conseil : l'opérateur garde la main, et le stock n'est pas décompté ici.
  app.get('/:id/feuilles', async (req, reply) => {
    const o = await findOrder((req.params as { id: string }).id, reply)
    if (!o) return
    const lignes = await db.select().from(orderLines).where(eq(orderLines.orderId, o.id)).orderBy(asc(orderLines.position))
    const stock = await db
      .select({ s: sheetStock, m: materials, c: colors })
      .from(sheetStock)
      .innerJoin(materials, eq(materials.id, sheetStock.materialId))
      .leftJoin(colors, eq(colors.id, sheetStock.colorId))
    const options = (materialId: string | null, colorId: string | null): SheetOption[] =>
      stock
        .filter((r) => r.s.materialId === materialId && (r.s.colorId ?? null) === (colorId ?? null))
        .map((r) => ({
          id: r.s.id,
          largeur: r.s.largeur,
          longueur: r.s.longueur,
          chute: r.s.chute,
          quantite: r.s.quantite,
          libelle: `${materialLabel(r.m)} · ${r.c ? colorLabel(r.c) : 'brut'} · ${r.s.largeur.toLocaleString('fr-FR')} × ${r.s.longueur.toLocaleString('fr-FR')} mm${r.s.chute ? ' (chute)' : ''}`,
        }))
    return {
      lignes: lignes.map((l) => {
        // Un article de la boutique n'a pas de pièce dessinée : rien à découper
        if (!l.cotes.length) return { ligneId: l.id, repere: l.repere, modeleLabel: l.modeleLabel, besoin: null, conseils: [], raison: 'Article standard : pas de calcul de découpe.' }
        const developpe = l.cotes.reduce((a, b) => a + b, 0)
        const besoin = { developpe, longueur: l.longueur, quantite: l.quantite }
        const conseils = adviseSheets(besoin, options(l.materialId, l.colorId)).slice(0, 3)
        const raison = conseils.length ? null : 'Aucune feuille en stock pour cette matière et ce coloris dans un format qui convient. Vérifiez le stock ou commandez des feuilles.'
        return { ligneId: l.id, repere: l.repere, modeleLabel: l.modeleLabel, besoin, conseils, raison }
      }),
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
    return reply.header('Content-Type', 'application/pdf').header('Content-Disposition', `inline; filename="fiche-${o.numero}.pdf"`).header('Cache-Control', 'no-store').send(pdf)
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
