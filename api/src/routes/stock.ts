import type { FastifyInstance, FastifyReply } from 'fastify'
import { and, asc, desc, eq, gte, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/index.js'
import { colors, materials, SHEET_MOTIFS, sheetMovements, sheetStock, users } from '../db/schema.js'
import { requirePerm } from '../auth/plugin.js'
import { audit } from '../audit.js'
import { colorLabel, materialLabel } from '../quote.js'
import { invalid, isUniqueViolation } from '../validation.js'

// Stock de feuilles de l'atelier : saisie des feuilles (matière, épaisseur, coloris, format) et de leurs mouvements.
// Aucun prix ici : l'atelier peut tenir son stock sans voir les tarifs.

const FEUILLES_MAX = 500
const DIM_MIN = 50
const DIM_MAX = 6000

const dim = (label: string) =>
  z
    .number({ error: `${label} : nombre attendu.` })
    .int(`${label} : nombre entier de millimètres.`)
    .min(DIM_MIN, `${label} : ${DIM_MIN} mm minimum.`)
    .max(DIM_MAX, `${label} : ${DIM_MAX} mm maximum.`)
const qty = (label: string, max = 100000) =>
  z
    .number({ error: `${label} : nombre attendu.` })
    .int(`${label} : nombre entier.`)
    .min(0, `${label} : ne peut pas être négatif.`)
    .max(max, `${label} : ${max} maximum.`)
const note = z.string().trim().max(300, 'Note : 300 caractères maximum.')

const createBody = z.object({
  materialId: z.uuid('Choisissez la matière.'),
  colorId: z.uuid('Coloris inconnu.').nullish(),
  largeur: dim('Largeur'),
  longueur: dim('Longueur'),
  chute: z.boolean().default(false),
  quantite: qty('Quantité').default(0),
  seuil: qty('Seuil d’alerte', 10000).default(0),
  note: note.default(''),
})
const patchBody = z.object({
  largeur: dim('Largeur').optional(),
  longueur: dim('Longueur').optional(),
  chute: z.boolean().optional(),
  seuil: qty('Seuil d’alerte', 10000).optional(),
  note: note.optional(),
})
const moveBody = z
  .object({
    delta: z.number({ error: 'Quantité : nombre attendu.' }).int('Quantité : nombre entier.').min(-100000).max(100000).optional(),
    quantite: qty('Quantité comptée').optional(),
    motif: z.enum(SHEET_MOTIFS, { error: 'Choisissez le motif.' }),
    note: note.default(''),
  })
  .refine((b) => (b.delta === undefined) !== (b.quantite === undefined), { message: 'Indiquez soit l’entrée ou la sortie, soit la quantité comptée.', path: ['delta'] })
  .refine((b) => b.delta !== 0, { message: 'Une entrée ou une sortie ne peut pas être nulle.', path: ['delta'] })

const isUuid = (id: string) => z.uuid().safeParse(id).success
const fmt = (n: number) => n.toLocaleString('fr-FR')

export async function stockRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requirePerm('stock.manage'))

  const base = () =>
    db
      .select({
        id: sheetStock.id,
        materialId: sheetStock.materialId,
        matiere: materials.nom,
        epaisseur: materials.epaisseur,
        colorId: sheetStock.colorId,
        coloris: colors.nom,
        reference: colors.reference,
        hex: colors.hex,
        largeur: sheetStock.largeur,
        longueur: sheetStock.longueur,
        chute: sheetStock.chute,
        quantite: sheetStock.quantite,
        seuil: sheetStock.seuil,
        note: sheetStock.note,
      })
      .from(sheetStock)
      .innerJoin(materials, eq(materials.id, sheetStock.materialId))
      .leftJoin(colors, eq(colors.id, sheetStock.colorId))

  type Row = Awaited<ReturnType<typeof base>>[number]
  const libelle = (r: Pick<Row, 'matiere' | 'epaisseur' | 'coloris' | 'reference' | 'largeur' | 'longueur' | 'chute'>) =>
    `${materialLabel({ nom: r.matiere, epaisseur: r.epaisseur })} · ${r.coloris ? colorLabel({ nom: r.coloris, reference: r.reference! }) : 'brut'} · ${fmt(r.largeur)} × ${fmt(r.longueur)} mm${r.chute ? ' (chute)' : ''}`
  const out = (r: Row) => ({ ...r, libelle: libelle(r), bas: r.seuil > 0 && r.quantite <= r.seuil })

  async function find(id: string, reply: FastifyReply) {
    const [r] = isUuid(id) ? await base().where(eq(sheetStock.id, id)) : []
    if (!r) reply.code(404).send({ error: 'Feuille introuvable.' })
    return r ?? null
  }

  // Matières et coloris du catalogue, pour choisir ce que l'on stocke (la direction les gère dans « Tarifs et catalogue »)
  app.get('/options', async () => {
    const [ms, cs] = await Promise.all([
      db.select().from(materials).where(eq(materials.actif, true)).orderBy(asc(materials.position), asc(materials.nom), asc(materials.epaisseur)),
      db.select().from(colors).where(eq(colors.actif, true)).orderBy(asc(colors.position), asc(colors.nom)),
    ])
    return { materials: ms.map((m) => ({ id: m.id, label: materialLabel(m) })), colors: cs.map((c) => ({ id: c.id, label: colorLabel(c), hex: c.hex })) }
  })

  app.get('/feuilles', async () => {
    const rows = await base().orderBy(asc(materials.nom), asc(materials.epaisseur), asc(colors.nom), asc(sheetStock.chute), asc(sheetStock.largeur), asc(sheetStock.longueur))
    const feuilles = rows.map(out)
    const m2 = feuilles.reduce((s, f) => s + (f.quantite * f.largeur * f.longueur) / 1_000_000, 0)
    return { feuilles, totaux: { references: feuilles.length, feuilles: feuilles.reduce((s, f) => s + f.quantite, 0), m2: Math.round(m2 * 10) / 10, bas: feuilles.filter((f) => f.bas).length } }
  })

  app.post('/feuilles', async (req, reply) => {
    const parsed = createBody.safeParse(req.body)
    if (!parsed.success) return invalid(reply, parsed.error)
    const d = parsed.data
    const [m] = await db.select({ id: materials.id }).from(materials).where(eq(materials.id, d.materialId))
    if (!m) return reply.code(400).send({ error: 'Matière inconnue.', field: 'materialId' })
    if (d.colorId) {
      const [c] = await db.select({ id: colors.id }).from(colors).where(eq(colors.id, d.colorId))
      if (!c) return reply.code(400).send({ error: 'Coloris inconnu.', field: 'colorId' })
    }
    const [{ n }] = (await db.select({ n: sql<number>`count(*)::int` }).from(sheetStock)) as [{ n: number }]
    if (n >= FEUILLES_MAX) return reply.code(409).send({ error: `${FEUILLES_MAX} références maximum.` })
    // Largeur ≤ longueur : le plus petit côté est la largeur
    const [largeur, longueur] = d.largeur <= d.longueur ? [d.largeur, d.longueur] : [d.longueur, d.largeur]
    try {
      const id = await db.transaction(async (tx) => {
        const [s] = await tx
          .insert(sheetStock)
          .values({ materialId: d.materialId, colorId: d.colorId ?? null, largeur, longueur, chute: d.chute, quantite: d.quantite, seuil: d.seuil, note: d.note })
          .returning({ id: sheetStock.id })
        return s!.id
      })
      const r = (await base().where(eq(sheetStock.id, id)))[0]!
      if (d.quantite > 0)
        await db.insert(sheetMovements).values({ sheetId: id, libelle: libelle(r), delta: d.quantite, apres: d.quantite, motif: 'reception', note: 'Première saisie', userId: req.user!.id })
      await audit(req, 'stock.sheet_created', { targetType: 'sheet', targetId: id, details: { libelle: libelle(r), quantite: d.quantite } })
      return reply.code(201).send({ feuille: out(r) })
    } catch (e) {
      if (isUniqueViolation(e)) return reply.code(409).send({ error: 'Cette feuille existe déjà dans le stock : ajoutez-lui des feuilles plutôt que de la recréer.', field: 'largeur' })
      throw e
    }
  })

  app.patch('/feuilles/:id', async (req, reply) => {
    const r = await find((req.params as { id: string }).id, reply)
    if (!r) return
    const parsed = patchBody.safeParse(req.body)
    if (!parsed.success) return invalid(reply, parsed.error)
    const d = parsed.data
    const largeur = d.largeur ?? r.largeur
    const longueur = d.longueur ?? r.longueur
    if (longueur < largeur) return reply.code(400).send({ error: 'La longueur doit être supérieure ou égale à la largeur.', field: 'longueur' })
    const set: Partial<typeof sheetStock.$inferInsert> = {}
    if (d.largeur !== undefined && d.largeur !== r.largeur) set.largeur = d.largeur
    if (d.longueur !== undefined && d.longueur !== r.longueur) set.longueur = d.longueur
    if (d.chute !== undefined && d.chute !== r.chute) set.chute = d.chute
    if (d.seuil !== undefined && d.seuil !== r.seuil) set.seuil = d.seuil
    if (d.note !== undefined && d.note !== r.note) set.note = d.note
    if (!Object.keys(set).length) return { ok: true }
    try {
      await db
        .update(sheetStock)
        .set({ ...set, updatedAt: new Date() })
        .where(eq(sheetStock.id, r.id))
    } catch (e) {
      if (isUniqueViolation(e)) return reply.code(409).send({ error: 'Une feuille de ce format existe déjà : regroupez-les en ajustant les quantités.', field: 'largeur' })
      throw e
    }
    await audit(req, 'stock.sheet_updated', { targetType: 'sheet', targetId: r.id, details: { libelle: libelle(r), champs: Object.keys(set) } })
    return { ok: true }
  })

  // Entrée (réception, chute récupérée), sortie (fabrication, perte) ou inventaire (quantité comptée) : toujours tracé
  app.post('/feuilles/:id/mouvement', async (req, reply) => {
    const r = await find((req.params as { id: string }).id, reply)
    if (!r) return
    const parsed = moveBody.safeParse(req.body)
    if (!parsed.success) return invalid(reply, parsed.error)
    const d = parsed.data
    const delta = d.delta ?? d.quantite! - r.quantite
    // Le calcul se fait en base, sur la quantité du moment : deux saisies en même temps ne s'écrasent pas
    const [u] = await db
      .update(sheetStock)
      .set({ quantite: sql`${sheetStock.quantite} + ${delta}`, updatedAt: new Date() })
      .where(and(eq(sheetStock.id, r.id), gte(sql`${sheetStock.quantite} + ${delta}`, 0)))
      .returning({ quantite: sheetStock.quantite })
    if (!u) return reply.code(409).send({ error: `Il n’y a que ${fmt(r.quantite)} feuille${r.quantite > 1 ? 's' : ''} en stock : impossible d’en sortir ${fmt(-delta)}.`, field: 'delta' })
    if (delta !== 0) await db.insert(sheetMovements).values({ sheetId: r.id, libelle: libelle(r), delta, apres: u.quantite, motif: d.motif, note: d.note, userId: req.user!.id })
    await audit(req, 'stock.moved', { targetType: 'sheet', targetId: r.id, details: { libelle: libelle(r), delta, apres: u.quantite, motif: d.motif } })
    return { quantite: u.quantite, bas: r.seuil > 0 && u.quantite <= r.seuil }
  })

  app.delete('/feuilles/:id', async (req, reply) => {
    const r = await find((req.params as { id: string }).id, reply)
    if (!r) return
    if (r.quantite > 0) return reply.code(409).send({ error: 'Il reste des feuilles de ce format : sortez-les du stock (perte ou inventaire) avant de supprimer la référence.' })
    await db.delete(sheetStock).where(eq(sheetStock.id, r.id))
    await audit(req, 'stock.sheet_deleted', { targetType: 'sheet', targetId: r.id, details: { libelle: libelle(r) } })
    return { ok: true }
  })

  app.get('/mouvements', async (req) => {
    const q = z.object({ feuille: z.uuid().optional() }).safeParse(req.query)
    const rows = await db
      .select({
        id: sheetMovements.id,
        at: sheetMovements.createdAt,
        libelle: sheetMovements.libelle,
        delta: sheetMovements.delta,
        apres: sheetMovements.apres,
        motif: sheetMovements.motif,
        note: sheetMovements.note,
        par: users.nom,
      })
      .from(sheetMovements)
      .leftJoin(users, eq(users.id, sheetMovements.userId))
      .where(q.success && q.data.feuille ? eq(sheetMovements.sheetId, q.data.feuille) : undefined)
      .orderBy(desc(sheetMovements.createdAt))
      .limit(100)
    return { mouvements: rows }
  })
}
