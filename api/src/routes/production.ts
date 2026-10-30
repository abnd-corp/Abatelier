import type { FastifyInstance, FastifyReply } from 'fastify'
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { z } from 'zod'
import { db } from '../db/index.js'
import { clients, colors, materials, ORDER_STATUTS, orderEvents, orderLines, orders, productionChecks, sheetMovements, sheetStock, users } from '../db/schema.js'
import { clientName } from './clients.js'
import { requirePerm } from '../auth/plugin.js'
import { changeStatus, eventsOf, NEXT, PRODUCTION_STATUTS, PRODUCTION_STEPS, STATUT_LABELS } from '../orders.js'
import { getCompany, getTemplate } from '../documents.js'
import { renderProductionSheet } from '../production-sheet.js'
import { buildPlan, checkable } from '../production-plan.js'
import { libelle as sheetLabel } from './stock.js'
import { invalid } from '../validation.js'
import { audit } from '../audit.js'
import { adviseSheets, type SheetOption } from '../cutting.js'
import { colorLabel, materialLabel } from '../quote.js'

// Vue de l'atelier : les commandes à fabriquer. Le client n'y figure que par son nom (c'est plus parlant qu'un numéro entre collègues) :
// jamais son adresse, son téléphone ni son e-mail, et aucun prix.
const nomClient = (c: Parameters<typeof clientName>[0]) => clientName(c) || 'Client'

const checkBody = z.object({
  cle: z.string({ error: 'Étape inconnue.' }).min(1, 'Étape inconnue.').max(300, 'Étape inconnue.'),
  count: z.number({ error: 'Nombre attendu.' }).int('Nombre entier attendu.').min(0, 'Ne peut pas être négatif.').max(100000, 'Nombre trop grand.'),
})
const stockBody = z.object({ groupe: z.uuid('Feuille inconnue.') })

const statusBody = z.object({ statut: z.enum(ORDER_STATUTS, { error: 'Étape inconnue.' }) })

async function clientNameOf(clientId: string) {
  const [c] = await db.select({ type: clients.type, raisonSociale: clients.raisonSociale, prenom: clients.prenom, nom: clients.nom }).from(clients).where(eq(clients.id, clientId))
  return c ? nomClient(c) : 'Client'
}

async function userName(id: string) {
  const [u] = await db.select({ nom: users.nom }).from(users).where(eq(users.id, id))
  return u?.nom ?? null
}

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

/** Pour chaque ligne de la commande, la feuille à prendre d'après le stock (les trois meilleures), ou la raison s'il n'y en a pas. */
async function sheetAdvice(orderId: string) {
  const lignes = await db.select().from(orderLines).where(eq(orderLines.orderId, orderId)).orderBy(asc(orderLines.position))
  const stock = await db
    .select({ s: sheetStock, m: materials, c: colors })
    .from(sheetStock)
    .innerJoin(materials, eq(materials.id, sheetStock.materialId))
    .leftJoin(colors, eq(colors.id, sheetStock.colorId))
    // Une référence archivée n'est plus proposée
    .where(isNull(sheetStock.archivedAt))
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
  return lignes.map((l) => {
    // Un article de la boutique n'a pas de pièce dessinée : rien à découper
    if (!l.cotes.length) return { ligneId: l.id, repere: l.repere, modeleLabel: l.modeleLabel, besoin: null, conseils: [], raison: 'Article standard : pas de calcul de découpe.' }
    const developpe = l.cotes.reduce((a, b) => a + b, 0)
    const besoin = { developpe, longueur: l.longueur, quantite: l.quantite }
    const conseils = adviseSheets(besoin, options(l.materialId, l.colorId)).slice(0, 3)
    const raison = conseils.length ? null : 'Aucune feuille en stock pour cette matière et ce coloris dans un format qui convient. Vérifiez le stock ou commandez des feuilles.'
    return { ligneId: l.id, repere: l.repere, modeleLabel: l.modeleLabel, besoin, conseils, raison }
  })
}

const next = (statut: (typeof ORDER_STATUTS)[number]) => NEXT[statut].find((s) => PRODUCTION_STEPS.includes(s)) ?? null

export async function productionRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requirePerm('orders.production'))

  app.get('/', async (req) => {
    const pieces = db
      .select({
        orderId: orderLines.orderId,
        n: sql<number>`sum(${orderLines.quantite})::int`.as('n'),
        lignes: sql<number>`count(*)::int`.as('lignes'),
        // De quoi parle la commande, en quelques mots (« Couvertine, Bavette ») : plus parlant que son numéro
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
        productionUserId: orders.productionUserId,
        assigneeNom: assignee.nom,
        statut: orders.statut,
        kind: orders.kind,
        livraisonMode: orders.livraisonMode,
        datePrevue: orders.datePrevue,
        pieces: pieces.n,
        lignes: pieces.lignes,
        modeles: pieces.modeles,
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
    // Qui a pris la commande (celui qui l'a lancée en fabrication) et qui l'a terminée : le nom, jamais un identifiant.
    // Le dernier passage compte (une commande peut avoir été relancée).
    const events = rows.length
      ? await db
          .select({ orderId: orderEvents.orderId, statut: orderEvents.statut, nom: users.nom })
          .from(orderEvents)
          .leftJoin(users, eq(users.id, orderEvents.userId))
          .where(
            and(
              inArray(
                orderEvents.orderId,
                rows.map((r) => r.id),
              ),
              inArray(orderEvents.statut, ['fabrication', 'prete']),
            ),
          )
          .orderBy(asc(orderEvents.id))
      : []
    const who = (orderId: string, statut: 'fabrication' | 'prete') => events.filter((e) => e.orderId === orderId && e.statut === statut).at(-1)?.nom ?? null
    return {
      orders: rows.map(({ clientType, clientRaisonSociale, clientPrenom, clientNom, productionUserId, assigneeNom, ...r }) => ({
        ...r,
        client: nomClient({ type: clientType, raisonSociale: clientRaisonSociale, prenom: clientPrenom, nom: clientNom }),
        pieces: r.pieces ?? 0,
        lignes: r.lignes ?? 0,
        modeles: r.modeles ?? '',
        // La prise en charge enregistrée ; à défaut (commande lancée avant qu'elle existe), celui qui l'a lancée
        prisPar: assigneeNom ?? who(r.id, 'fabrication'),
        prisParMoi: productionUserId === req.user!.id,
        pretePar: who(r.id, 'prete'),
        next: next(r.statut),
      })),
    }
  })

  app.get('/:id', async (req, reply) => {
    const o = await findOrder((req.params as { id: string }).id, reply)
    if (!o) return
    const lignes = await linesOf(o.id)
    const events = await eventsOf(o.id)
    const assigneeNom = o.productionUserId ? await userName(o.productionUserId) : null
    return {
      order: {
        id: o.id,
        numero: o.numero,
        client: await clientNameOf(o.clientId),
        kind: o.kind,
        statut: o.statut,
        statutLabel: STATUT_LABELS[o.statut],
        prisPar: assigneeNom ?? events.filter((e) => e.statut === 'fabrication').at(-1)?.nom ?? null,
        prisParMoi: o.productionUserId === req.user!.id,
        livraisonMode: o.livraisonMode,
        datePrevue: o.datePrevue,
        next: next(o.statut),
      },
      lignes,
      events,
    }
  })

  // Quelle feuille prendre pour chaque pièce, d'après le stock de l'atelier (matière, épaisseur et coloris de la pièce).
  // Un conseil : l'opérateur garde la main, et le stock n'est pas décompté ici.
  app.get('/:id/feuilles', async (req, reply) => {
    const o = await findOrder((req.params as { id: string }).id, reply)
    if (!o) return
    return { lignes: await sheetAdvice(o.id) }
  })

  // Le travail rangé feuille par feuille, avec ce qui est déjà coché : la version de la fiche que l'on suit à l'écran
  const planOf = async (orderId: string) => {
    const [lignes, conseils] = await Promise.all([linesOf(orderId), sheetAdvice(orderId)])
    return buildPlan(lignes.map((l, i) => ({ ...l, decoupe: conseils[i]?.conseils[0] ?? null })))
  }

  app.get('/:id/suivi', async (req, reply) => {
    const o = await findOrder((req.params as { id: string }).id, reply)
    if (!o) return
    const [plan, rows] = await Promise.all([
      planOf(o.id),
      db
        .select({ cle: productionChecks.cle, count: productionChecks.count, par: users.nom, le: productionChecks.updatedAt })
        .from(productionChecks)
        .leftJoin(users, eq(users.id, productionChecks.userId))
        .where(eq(productionChecks.orderId, o.id)),
    ])
    return { plan, checks: Object.fromEntries(rows.map((r) => [r.cle, { count: r.count, par: r.par, le: r.le }])), modifiable: o.statut !== 'prete' }
  })

  // Cocher (ou décocher) une étape : la clé doit exister dans le plan de la commande, et le nombre ne dépasse pas ce qu'il y a à faire
  app.put('/:id/suivi', async (req, reply) => {
    const o = await findOrder((req.params as { id: string }).id, reply)
    if (!o) return
    const parsed = checkBody.safeParse(req.body)
    if (!parsed.success) return invalid(reply, parsed.error)
    if (o.statut === 'prete') return reply.code(409).send({ error: 'Cette commande est déjà prête : le suivi ne se modifie plus.' })
    const max = checkable(await planOf(o.id)).get(parsed.data.cle)
    if (max === undefined) return reply.code(400).send({ error: 'Cette étape n’existe pas sur cette commande.', field: 'cle' })
    if (parsed.data.count > max) return reply.code(400).send({ error: `Pas plus de ${max} ici.`, field: 'count' })
    const now = new Date()
    await db
      .insert(productionChecks)
      .values({ orderId: o.id, cle: parsed.data.cle, count: parsed.data.count, userId: req.user!.id, updatedAt: now })
      .onConflictDoUpdate({ target: [productionChecks.orderId, productionChecks.cle], set: { count: parsed.data.count, userId: req.user!.id, updatedAt: now } })
    return { cle: parsed.data.cle, count: parsed.data.count, par: req.user!.nom, le: now }
  })

  // Fin d'une feuille : sortir du stock les feuilles utilisées et y entrer les chutes à garder. Une seule fois, et seulement quand toutes les découpes sont faites.
  app.post('/:id/suivi/stock', { preHandler: requirePerm('stock.manage') }, async (req, reply) => {
    const o = await findOrder((req.params as { id: string }).id, reply)
    if (!o) return
    const parsed = stockBody.safeParse(req.body)
    if (!parsed.success) return invalid(reply, parsed.error)
    if (o.statut === 'prete') return reply.code(409).send({ error: 'Cette commande est déjà prête : le suivi ne se modifie plus.' })
    const plan = await planOf(o.id)
    const g = plan.groupes.find((x) => x.id === parsed.data.groupe)
    if (!g) return reply.code(404).send({ error: 'Feuille introuvable sur cette commande.' })
    if (!g.feuilles.length) return reply.code(409).send({ error: 'Aucune feuille du stock n’est conseillée ici : corrigez le stock à la main dans « Stock de feuilles ».' })
    const checks = await db.select().from(productionChecks).where(eq(productionChecks.orderId, o.id))
    const fait = (cle: string) => checks.find((c) => c.cle === cle)?.count ?? 0
    if (fait(g.stockCle)) return reply.code(409).send({ error: 'Le stock de cette feuille est déjà à jour.' })
    const incomplet = g.decoupes.find((d) => fait(d.cle) < d.quantite)
    if (incomplet) return reply.code(409).send({ error: `Terminez d’abord les découpes (${incomplet.titre}).` })

    const note = `Commande ${o.numero}`
    const sorties: string[] = []
    const entrees: string[] = []
    // Une erreur au milieu annule tout : jamais une feuille sortie sans que la suivante le soit
    class StockError extends Error {}
    const erreur = await db
      .transaction(async (tx) => {
        for (const f of g.feuilles) {
          const [src] = await tx
            .select({ s: sheetStock, matiere: materials.nom, epaisseur: materials.epaisseur, coloris: colors.nom, reference: colors.reference })
            .from(sheetStock)
            .innerJoin(materials, eq(materials.id, sheetStock.materialId))
            .leftJoin(colors, eq(colors.id, sheetStock.colorId))
            .where(eq(sheetStock.id, f.sheetId))
          if (!src) throw new StockError('Une feuille conseillée n’existe plus dans le stock : actualisez la page.')
          const [u] = await tx
            .update(sheetStock)
            .set({ quantite: sql`${sheetStock.quantite} - ${f.nombre}`, updatedAt: new Date() })
            .where(and(eq(sheetStock.id, src.s.id), sql`${sheetStock.quantite} - ${f.nombre} >= 0`))
            .returning({ quantite: sheetStock.quantite })
          const nom = sheetLabel({ ...src, ...src.s, matiere: src.matiere })
          if (!u) throw new StockError(`Il n’y a plus assez de feuilles en stock (${nom}) : corrigez le stock dans « Stock de feuilles ».`)
          await tx.insert(sheetMovements).values({ sheetId: src.s.id, libelle: nom, delta: -f.nombre, apres: u.quantite, motif: 'fabrication', note, userId: req.user!.id })
          sorties.push(`${f.nombre} × ${nom}`)
          // Les chutes gardées de cette feuille entrent au stock, à la même matière et au même coloris
          if (f.sheetId !== g.feuilles[0]!.sheetId) continue
          for (const c of g.chutes?.garder ?? []) {
            const largeur = Math.min(c.largeur, c.longueur)
            const longueur = Math.max(c.largeur, c.longueur)
            const [ex] = await tx
              .select({ id: sheetStock.id })
              .from(sheetStock)
              .where(
                and(
                  eq(sheetStock.materialId, src.s.materialId),
                  src.s.colorId ? eq(sheetStock.colorId, src.s.colorId) : isNull(sheetStock.colorId),
                  eq(sheetStock.largeur, largeur),
                  eq(sheetStock.longueur, longueur),
                  eq(sheetStock.chute, true),
                ),
              )
            let id = ex?.id
            if (!id)
              [{ id }] = (await tx
                .insert(sheetStock)
                .values({ materialId: src.s.materialId, colorId: src.s.colorId, largeur, longueur, chute: true, quantite: 0 })
                .returning({ id: sheetStock.id })) as [{ id: string }]
            const [e] = await tx
              .update(sheetStock)
              .set({ quantite: sql`${sheetStock.quantite} + ${c.nombre}`, archivedAt: null, updatedAt: new Date() })
              .where(eq(sheetStock.id, id!))
              .returning({ quantite: sheetStock.quantite })
            const nomChute = sheetLabel({ ...src, matiere: src.matiere, largeur, longueur, chute: true })
            await tx.insert(sheetMovements).values({ sheetId: id!, libelle: nomChute, delta: c.nombre, apres: e!.quantite, motif: 'chute', note, userId: req.user!.id })
            entrees.push(`${c.nombre} × ${nomChute}`)
          }
        }
        await tx
          .insert(productionChecks)
          .values({ orderId: o.id, cle: g.stockCle, count: 1, userId: req.user!.id })
          .onConflictDoUpdate({ target: [productionChecks.orderId, productionChecks.cle], set: { count: 1, userId: req.user!.id, updatedAt: new Date() } })
        return null
      })
      .catch((e) => {
        if (e instanceof StockError) return e.message
        throw e
      })
    if (erreur) return reply.code(409).send({ error: erreur })
    await audit(req, 'order.sheet_stock_confirmed', { targetType: 'order', targetId: o.id, details: { numero: o.numero, sorties, chutes: entrees } })
    return { sorties, chutes: entrees }
  })

  // Fiche imprimable : ouverte dans un nouvel onglet, le navigateur l'imprime
  app.get('/:id/fiche.pdf', async (req, reply) => {
    const o = await findOrder((req.params as { id: string }).id, reply)
    if (!o) return
    const [lignes, company, template, conseils] = await Promise.all([linesOf(o.id), getCompany(), getTemplate(), sheetAdvice(o.id)])
    const pdf = await renderProductionSheet(
      {
        numero: o.numero,
        client: await clientNameOf(o.clientId),
        statutLabel: STATUT_LABELS[o.statut],
        creeLe: o.createdAt,
        livraisonMode: o.livraisonMode,
        imprimeLe: new Date(),
        lignes: lignes.map((l, i) => ({ ...l, decoupe: conseils[i]?.conseils[0] ?? null })),
      },
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
    // Lancer la fabrication, c'est la prendre en charge : celui qui la lance en devient le responsable
    if (parsed.data.statut === 'fabrication' && o.productionUserId !== req.user!.id) await db.update(orders).set({ productionUserId: req.user!.id }).where(eq(orders.id, o.id))
    return { statut: parsed.data.statut }
  })

  // Prendre la commande en charge, ou la reprendre à un collègue qui ne peut plus la faire. Tant qu'elle n'est pas prête.
  app.post('/:id/prise-en-charge', async (req, reply) => {
    const o = await findOrder((req.params as { id: string }).id, reply)
    if (!o) return
    if (o.statut === 'prete') return reply.code(409).send({ error: 'Cette commande est déjà prête : on ne la prend plus en charge.' })
    if (o.productionUserId === req.user!.id) return { ok: true }
    const avant = o.productionUserId ? await userName(o.productionUserId) : null
    await db.update(orders).set({ productionUserId: req.user!.id, updatedAt: new Date() }).where(eq(orders.id, o.id))
    await audit(req, 'order.production_assigned', { targetType: 'order', targetId: o.id, details: { numero: o.numero, ...(avant ? { avant } : {}) } })
    return { ok: true }
  })

  // Annuler la prise en charge tant que la fabrication n'est pas lancée : n'importe quel collègue peut le faire (la personne peut être absente)
  app.delete('/:id/prise-en-charge', async (req, reply) => {
    const o = await findOrder((req.params as { id: string }).id, reply)
    if (!o) return
    if (o.statut !== 'validee') return reply.code(409).send({ error: 'La fabrication est lancée : on ne peut plus annuler la prise en charge, seulement reprendre la commande.' })
    if (!o.productionUserId) return { ok: true }
    const avant = await userName(o.productionUserId)
    await db.update(orders).set({ productionUserId: null, updatedAt: new Date() }).where(eq(orders.id, o.id))
    await audit(req, 'order.production_released', { targetType: 'order', targetId: o.id, details: { numero: o.numero, ...(avant ? { avant } : {}) } })
    return { ok: true }
  })
}
