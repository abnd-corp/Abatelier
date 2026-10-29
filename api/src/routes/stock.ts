import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { and, asc, desc, eq, gte, isNotNull, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/index.js'
import { colors, materials, SHEET_MOTIFS, sheetBarcodes, sheetMovements, sheetStock, users } from '../db/schema.js'
import { requireAnyPerm, requirePerm } from '../auth/plugin.js'
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

// Un code-barres de fournisseur (EAN, Code 128…) : chiffres et lettres, avec parfois des tirets ou des points
const code = z
  .string({ error: 'Scannez ou saisissez le code-barres.' })
  .trim()
  .min(4, 'Code-barres : 4 caractères minimum.')
  .max(64, 'Code-barres : 64 caractères maximum.')
  .regex(/^[A-Za-z0-9._\-/]+$/, 'Code-barres : chiffres, lettres, point, tiret ou barre oblique seulement.')
  .transform((c) => c.toUpperCase())
const createBody = z
  .object({
    // La matière et le coloris se désignent par leur identifiant (catalogue) ou se saisissent librement : ce qui manque au catalogue y est créé
    materialId: z.uuid('Choisissez la matière.').optional(),
    colorId: z.uuid('Coloris inconnu.').nullish(),
    matiere: z.string().trim().min(1, 'Indiquez la matière.').max(60, 'Matière : 60 caractères maximum.').optional(),
    epaisseur: z.number({ error: 'Épaisseur : nombre attendu.' }).min(0.3, 'Épaisseur : 0,3 mm minimum.').max(10, 'Épaisseur : 10 mm maximum.').optional(),
    coloris: z.string().trim().max(60, 'Coloris : 60 caractères maximum.').optional(),
    reference: z.string().trim().max(40, 'Référence du coloris : 40 caractères maximum.').optional(),
    largeur: dim('Largeur'),
    longueur: dim('Longueur'),
    chute: z.boolean().default(false),
    quantite: qty('Quantité').default(0),
    seuil: qty('Seuil d’alerte', 10000).default(0),
    note: note.default(''),
    // Code-barres du fournisseur, pour la réception au scan
    code: code.optional(),
  })
  .superRefine((d, ctx) => {
    if (d.materialId) return
    if (!d.matiere) ctx.addIssue({ code: 'custom', message: 'Indiquez la matière.', path: ['matiere'] })
    if (d.epaisseur === undefined) ctx.addIssue({ code: 'custom', message: 'Indiquez l’épaisseur.', path: ['epaisseur'] })
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

const codeBody = z.object({ code, sheetId: z.uuid('Choisissez la référence.') })
const receptionBody = z.object({
  code,
  quantite: z.number({ error: 'Indiquez le nombre de feuilles reçues.' }).int('Nombre entier de feuilles.').min(1, 'Au moins une feuille.').max(100000, '100 000 feuilles maximum.'),
  note: note.default(''),
})

const isUuid = (id: string) => z.uuid().safeParse(id).success
const fmt = (n: number) => n.toLocaleString('fr-FR')

// La définition des références (matière, coloris, format) et de leurs codes-barres est aussi accessible à la direction (page Matériaux) ;
// les quantités, les mouvements et la réception restent à l'atelier.
const DEFINITION = new Set(['GET /options', 'GET /feuilles', 'POST /feuilles', 'POST /feuilles/:id/archive', 'POST /feuilles/:id/unarchive', 'GET /codes/:code', 'POST /codes', 'DELETE /codes/:code'])

export const libelle = (r: { matiere: string; epaisseur: number; coloris: string | null; reference: string | null; largeur: number; longueur: number; chute: boolean }) =>
  `${materialLabel({ nom: r.matiere, epaisseur: r.epaisseur })} · ${r.coloris ? colorLabel({ nom: r.coloris, reference: r.reference! }) : 'brut'} · ${fmt(r.largeur)} × ${fmt(r.longueur)} mm${r.chute ? ' (chute)' : ''}`
// État visuel à 4 niveaux (R7) : vide (plus aucune feuille), critique (à moins de la moitié du seuil),
// bas (au seuil ou sous lui) et ok. Sans seuil réglé (0), seul le niveau vide reste détecté.
export const etatOf = (seuil: number, quantite: number): 'vide' | 'critique' | 'bas' | 'ok' => {
  if (quantite <= 0) return 'vide'
  if (seuil <= 0) return 'ok'
  if (quantite <= Math.ceil(seuil / 2)) return 'critique'
  if (quantite <= seuil) return 'bas'
  return 'ok'
}

export async function stockRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (req, reply) => {
    const route = `${req.method} ${(req.routeOptions.url ?? '').replace(/^\/api\/stock/, '')}`
    return (DEFINITION.has(route) ? requireAnyPerm('stock.manage', 'catalog.manage') : requirePerm('stock.manage'))(req, reply)
  })

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
        archivedAt: sheetStock.archivedAt,
      })
      .from(sheetStock)
      .innerJoin(materials, eq(materials.id, sheetStock.materialId))
      .leftJoin(colors, eq(colors.id, sheetStock.colorId))

  type Row = Awaited<ReturnType<typeof base>>[number]
  const out = ({ archivedAt, ...r }: Row) => ({ ...r, archivee: archivedAt !== null, libelle: libelle(r), bas: r.seuil > 0 && r.quantite <= r.seuil, etat: etatOf(r.seuil, r.quantite) })
  const ARCHIVEE = 'Cette référence est archivée : désarchivez-la pour l’utiliser.'

  async function find(id: string, reply: FastifyReply) {
    const [r] = isUuid(id) ? await base().where(eq(sheetStock.id, id)) : []
    if (!r) reply.code(404).send({ error: 'Feuille introuvable.' })
    return r ?? null
  }

  // Matières et coloris du catalogue, pour choisir ce que l'on stocke (la direction les gère dans « Tarifs et catalogue »)
  // ?tous=1 : aussi les matières et coloris inactifs (créés depuis le stock, pas encore tarifés), pour les suggestions de saisie libre
  app.get('/options', async (req) => {
    const tous = (req.query as { tous?: string }).tous === '1'
    const [ms, cs] = await Promise.all([
      db
        .select()
        .from(materials)
        .where(tous ? undefined : eq(materials.actif, true))
        .orderBy(asc(materials.position), asc(materials.nom), asc(materials.epaisseur)),
      db
        .select()
        .from(colors)
        .where(tous ? undefined : eq(colors.actif, true))
        .orderBy(asc(colors.position), asc(colors.nom)),
    ])
    return {
      materials: ms.map((m) => ({ id: m.id, label: materialLabel(m), nom: m.nom, epaisseur: m.epaisseur })),
      colors: cs.map((c) => ({ id: c.id, label: colorLabel(c), hex: c.hex, nom: c.nom, reference: c.reference })),
    }
  })

  // Par défaut les références en service ; ?archivees=1 donne celles qui sont archivées
  app.get('/feuilles', async (req) => {
    const archivees = (req.query as { archivees?: string }).archivees === '1'
    const rows = await base()
      .where(archivees ? isNotNull(sheetStock.archivedAt) : isNull(sheetStock.archivedAt))
      .orderBy(asc(materials.nom), asc(materials.epaisseur), asc(colors.nom), asc(sheetStock.chute), asc(sheetStock.largeur), asc(sheetStock.longueur))
    const links = await db.select({ code: sheetBarcodes.code, sheetId: sheetBarcodes.sheetId }).from(sheetBarcodes).orderBy(asc(sheetBarcodes.createdAt))
    const feuilles = rows.map((r) => ({ ...out(r), codes: links.filter((l) => l.sheetId === r.id).map((l) => l.code) }))
    // Une chute n'est pas une feuille entière (un reste de découpe, parfois trop petit pour être réutilisé) :
    // on les compte à part, pour ne jamais les mélanger dans un même total.
    const m2 = (list: typeof feuilles) => Math.round(list.reduce((s, f) => s + (f.quantite * f.largeur * f.longueur) / 1_000_000, 0) * 10) / 10
    const entieres = feuilles.filter((f) => !f.chute)
    const chutes = feuilles.filter((f) => f.chute)
    return {
      feuilles,
      totaux: {
        references: feuilles.length,
        feuillesEntieres: entieres.reduce((s, f) => s + f.quantite, 0),
        chutes: chutes.reduce((s, f) => s + f.quantite, 0),
        m2Entieres: m2(entieres),
        m2Chutes: m2(chutes),
        bas: feuilles.filter((f) => f.bas).length,
      },
    }
  })

  app.post('/feuilles', async (req, reply) => {
    const parsed = createBody.safeParse(req.body)
    if (!parsed.success) return invalid(reply, parsed.error)
    const d = parsed.data
    if (d.materialId) {
      const [m] = await db.select({ id: materials.id }).from(materials).where(eq(materials.id, d.materialId))
      if (!m) return reply.code(400).send({ error: 'Matière inconnue.', field: 'materialId' })
    }
    if (d.colorId) {
      const [c] = await db.select({ id: colors.id }).from(colors).where(eq(colors.id, d.colorId))
      if (!c) return reply.code(400).send({ error: 'Coloris inconnu.', field: 'colorId' })
    }
    // Une chute n'est pas réapprovisionnée : pas d'alerte de stock bas possible dessus
    if (d.chute && d.seuil) return reply.code(400).send({ error: 'Pas d’alerte de stock bas sur une chute.', field: 'seuil' })
    const [{ n }] = (await db.select({ n: sql<number>`count(*)::int` }).from(sheetStock)) as [{ n: number }]
    if (n >= FEUILLES_MAX) return reply.code(409).send({ error: `${FEUILLES_MAX} références maximum.` })
    // Largeur ≤ longueur : le plus petit côté est la largeur
    const [largeur, longueur] = d.largeur <= d.longueur ? [d.largeur, d.longueur] : [d.longueur, d.largeur]
    let materialId = d.materialId
    let colorId = d.colorId ?? null
    const crees: { type: 'material' | 'color'; id: string; nom: string }[] = []
    try {
      const id = await db.transaction(async (tx) => {
        // Matière et coloris saisis librement : on retrouve ceux du catalogue (sans tenir compte des majuscules), sinon on les crée.
        // Ce qui est créé ici est inactif, à prix zéro : la direction le complète dans « Tarifs et catalogue » avant de le vendre.
        if (!materialId) {
          const [found] = await tx
            .select()
            .from(materials)
            .where(and(sql`lower(${materials.nom}) = lower(${d.matiere!})`, eq(materials.epaisseur, d.epaisseur!)))
          if (found) materialId = found.id
          else {
            const [m] = await tx
              .insert(materials)
              .values({ nom: d.matiere!, epaisseur: d.epaisseur!, prixM2: 0, retourMin: 0, actif: false, position: sql`(select coalesce(max(position), 0) + 1 from materials)` })
              .returning()
            materialId = m!.id
            crees.push({ type: 'material', id: m!.id, nom: materialLabel(m!) })
          }
        }
        if (!colorId && d.coloris) {
          const ref = d.reference || d.coloris
          const [found] = await tx
            .select()
            .from(colors)
            .where(sql`lower(${colors.reference}) = lower(${ref})`)
          if (found) colorId = found.id
          else {
            const [c] = await tx
              .insert(colors)
              .values({ nom: d.coloris, reference: ref, hex: '#cccccc', actif: false, position: sql`(select coalesce(max(position), 0) + 1 from colors)` })
              .returning()
            colorId = c!.id
            crees.push({ type: 'color', id: c!.id, nom: colorLabel(c!) })
          }
        }
        const [s] = await tx.insert(sheetStock).values({ materialId, colorId, largeur, longueur, chute: d.chute, quantite: d.quantite, seuil: d.seuil, note: d.note }).returning({ id: sheetStock.id })
        if (d.code) await tx.insert(sheetBarcodes).values({ code: d.code, sheetId: s!.id, createdBy: req.user!.id })
        return s!.id
      })
      for (const c of crees)
        await audit(req, c.type === 'material' ? 'catalog.material_created' : 'catalog.color_created', { targetType: c.type, targetId: c.id, details: { nom: c.nom, prixM2: 0, depuisStock: true } })
      const r = (await base().where(eq(sheetStock.id, id)))[0]!
      if (d.quantite > 0)
        await db.insert(sheetMovements).values({ sheetId: id, libelle: libelle(r), delta: d.quantite, apres: d.quantite, motif: 'reception', note: 'Première saisie', userId: req.user!.id })
      await audit(req, 'stock.sheet_created', { targetType: 'sheet', targetId: id, details: { libelle: libelle(r), quantite: d.quantite } })
      return reply.code(201).send({ feuille: out(r) })
    } catch (e) {
      if (isUniqueViolation(e)) {
        const taken = d.code ? (await db.select({ code: sheetBarcodes.code }).from(sheetBarcodes).where(eq(sheetBarcodes.code, d.code))).length > 0 : false
        if (taken) return reply.code(409).send({ error: 'Ce code-barres est déjà associé à une autre référence.', field: 'code' })
        const [dup] = await db
          .select({ archivedAt: sheetStock.archivedAt })
          .from(sheetStock)
          .where(
            and(
              eq(sheetStock.materialId, materialId!),
              colorId ? eq(sheetStock.colorId, colorId) : isNull(sheetStock.colorId),
              eq(sheetStock.largeur, largeur),
              eq(sheetStock.longueur, longueur),
              eq(sheetStock.chute, d.chute),
            ),
          )
        if (dup?.archivedAt) return reply.code(409).send({ error: 'Cette référence existe, archivée : désarchivez-la plutôt que de la recréer.', field: 'largeur' })
        return reply.code(409).send({ error: 'Cette feuille existe déjà dans le stock : ajoutez-lui des feuilles plutôt que de la recréer.', field: 'largeur' })
      }
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
    // Une chute n'est pas réapprovisionnée : pas d'alerte de stock bas possible dessus
    const chuteApres = d.chute ?? r.chute
    const seuilApres = d.seuil ?? r.seuil
    if (chuteApres && seuilApres) return reply.code(400).send({ error: 'Pas d’alerte de stock bas sur une chute.', field: 'seuil' })
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

  // Applique une entrée ou une sortie sur la quantité du moment (le calcul se fait en base : deux saisies en même temps ne s'écrasent pas), et la trace
  async function move(req: FastifyRequest, r: Row, delta: number, motif: (typeof SHEET_MOTIFS)[number], noteText: string, extra: Record<string, unknown> = {}) {
    const [u] = await db
      .update(sheetStock)
      .set({ quantite: sql`${sheetStock.quantite} + ${delta}`, updatedAt: new Date() })
      .where(and(eq(sheetStock.id, r.id), gte(sql`${sheetStock.quantite} + ${delta}`, 0)))
      .returning({ quantite: sheetStock.quantite })
    if (!u) return null
    if (delta !== 0) await db.insert(sheetMovements).values({ sheetId: r.id, libelle: libelle(r), delta, apres: u.quantite, motif, note: noteText, userId: req.user!.id })
    await audit(req, 'stock.moved', { targetType: 'sheet', targetId: r.id, details: { libelle: libelle(r), delta, apres: u.quantite, motif, ...extra } })
    return u.quantite
  }
  const tooMany = (reply: FastifyReply, r: Row, delta: number) =>
    reply.code(409).send({ error: `Il n’y a que ${fmt(r.quantite)} feuille${r.quantite > 1 ? 's' : ''} en stock : impossible d’en sortir ${fmt(-delta)}.`, field: 'delta' })

  // Entrée (réception, chute récupérée), sortie (fabrication, perte) ou inventaire (quantité comptée) : toujours tracé
  app.post('/feuilles/:id/mouvement', async (req, reply) => {
    const r = await find((req.params as { id: string }).id, reply)
    if (!r) return
    const parsed = moveBody.safeParse(req.body)
    if (!parsed.success) return invalid(reply, parsed.error)
    const d = parsed.data
    const delta = d.delta ?? d.quantite! - r.quantite
    const apres = await move(req, r, delta, d.motif, d.note)
    if (apres === null) return tooMany(reply, r, delta)
    return { quantite: apres, bas: r.seuil > 0 && apres <= r.seuil, etat: etatOf(r.seuil, apres) }
  })

  // --- Codes-barres des fournisseurs et réception de marchandise ---

  /** La référence du stock désignée par un code-barres, ou null. */
  async function byCode(c: string) {
    const [link] = await db.select({ sheetId: sheetBarcodes.sheetId }).from(sheetBarcodes).where(eq(sheetBarcodes.code, c))
    return link ? ((await base().where(eq(sheetStock.id, link.sheetId)))[0] ?? null) : null
  }

  app.get('/codes/:code', async (req, reply) => {
    const parsed = code.safeParse((req.params as { code: string }).code)
    if (!parsed.success) return invalid(reply, parsed.error)
    const r = await byCode(parsed.data)
    if (!r) return reply.code(404).send({ error: 'Code-barres inconnu : associez-le à une référence du stock.', code: parsed.data })
    if (r.archivedAt) return reply.code(409).send({ error: ARCHIVEE, code: parsed.data })
    return { code: parsed.data, feuille: out(r) }
  })

  // Associe un code-barres à une référence (plusieurs codes possibles pour une même référence : paquet, palette…)
  app.post('/codes', async (req, reply) => {
    const parsed = codeBody.safeParse(req.body)
    if (!parsed.success) return invalid(reply, parsed.error)
    const r = await find(parsed.data.sheetId, reply)
    if (!r) return
    if (r.archivedAt) return reply.code(409).send({ error: ARCHIVEE })
    const existing = await byCode(parsed.data.code)
    if (existing) {
      if (existing.id === r.id) return { ok: true }
      return reply.code(409).send({ error: `Ce code-barres est déjà associé à « ${libelle(existing)} ».`, field: 'code' })
    }
    await db.insert(sheetBarcodes).values({ code: parsed.data.code, sheetId: r.id, createdBy: req.user!.id })
    await audit(req, 'stock.code_linked', { targetType: 'sheet', targetId: r.id, details: { libelle: libelle(r), code: parsed.data.code } })
    return reply.code(201).send({ ok: true })
  })

  app.delete('/codes/:code', async (req, reply) => {
    const parsed = code.safeParse((req.params as { code: string }).code)
    if (!parsed.success) return invalid(reply, parsed.error)
    const r = await byCode(parsed.data)
    if (!r) return reply.code(404).send({ error: 'Code-barres inconnu.' })
    await db.delete(sheetBarcodes).where(eq(sheetBarcodes.code, parsed.data))
    await audit(req, 'stock.code_unlinked', { targetType: 'sheet', targetId: r.id, details: { libelle: libelle(r), code: parsed.data } })
    return { ok: true }
  })

  // Réception : on scanne (ou saisit) le code, puis on indique le nombre de feuilles reçues
  app.post('/reception', async (req, reply) => {
    const parsed = receptionBody.safeParse(req.body)
    if (!parsed.success) return invalid(reply, parsed.error)
    const r = await byCode(parsed.data.code)
    if (!r) return reply.code(404).send({ error: 'Code-barres inconnu : associez-le à une référence du stock.', code: parsed.data.code })
    if (r.archivedAt) return reply.code(409).send({ error: ARCHIVEE, code: parsed.data.code })
    const apres = await move(req, r, parsed.data.quantite, 'reception', parsed.data.note || 'Réception', { code: parsed.data.code })
    return { feuille: out({ ...r, quantite: apres! }), recu: parsed.data.quantite }
  })

  // Une référence ne se supprime jamais : l'historique des mouvements et des commandes s'y rapporte. On l'archive (stock à zéro).
  app.post('/feuilles/:id/archive', async (req, reply) => {
    const r = await find((req.params as { id: string }).id, reply)
    if (!r) return
    if (r.archivedAt) return { ok: true }
    if (r.quantite > 0) return reply.code(409).send({ error: 'Il reste des feuilles de ce format : sortez-les du stock (perte ou inventaire) avant d’archiver la référence.' })
    await db.update(sheetStock).set({ archivedAt: new Date() }).where(eq(sheetStock.id, r.id))
    await audit(req, 'stock.sheet_archived', { targetType: 'sheet', targetId: r.id, details: { libelle: libelle(r) } })
    return { ok: true }
  })

  app.post('/feuilles/:id/unarchive', async (req, reply) => {
    const r = await find((req.params as { id: string }).id, reply)
    if (!r) return
    if (!r.archivedAt) return { ok: true }
    await db.update(sheetStock).set({ archivedAt: null }).where(eq(sheetStock.id, r.id))
    await audit(req, 'stock.sheet_unarchived', { targetType: 'sheet', targetId: r.id, details: { libelle: libelle(r) } })
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
