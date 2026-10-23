import type { FastifyInstance, FastifyReply } from 'fastify'
import { asc, eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/index.js'
import { accessories, colors, materials, pieceModels, pricingSettings, QUANTITES_AUTO, UNITES, type PieceModel } from '../db/schema.js'
import { isPince, selfIntersection } from '../profile.js'
import { getPricingSettings } from '../pricing.js'
import { requirePerm } from '../auth/plugin.js'
import { audit } from '../audit.js'
import { decimal, diff, integer, invalid, isUniqueViolation } from '../validation.js'

const materialFields = {
  nom: z.string().trim().min(1, 'Le nom de la matière est requis.').max(60),
  epaisseur: decimal(0.3, 10, 'Épaisseur', 'mm'),
  prixM2: decimal(0, 10000, 'Prix au m²', '€'),
  retourMin: integer(0, 200, 'Retour minimum', 'mm'),
  actif: z.boolean().optional(),
}
const colorFields = {
  nom: z.string().trim().min(1, 'Le nom du coloris est requis.').max(60),
  reference: z.string().trim().min(1, 'La référence est requise.').max(40),
  hex: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^#[0-9a-f]{6}$/, 'Teinte invalide : format #rrggbb attendu.'),
  majoration: decimal(-100, 500, 'Majoration', '%'),
  delaiSup: integer(0, 60, 'Délai supplémentaire', 'jours'),
  actif: z.boolean().optional(),
}
const accessoryFields = {
  nom: z.string().trim().min(1, 'Le nom de l’accessoire est requis.').max(60),
  prix: decimal(0, 10000, 'Prix', '€'),
  unite: z.enum(UNITES, { error: 'Unité invalide : à la pièce ou à la paire.' }),
  // Identifiants des modèles de pièces, sans doublon (leur existence est vérifiée à l'enregistrement)
  modeles: z
    .array(z.uuid('Modèle inconnu.'), { error: 'Choisissez au moins un modèle.' })
    .min(1, 'Choisissez au moins un modèle.')
    .max(50)
    .transform((l) => [...new Set(l)]),
  quantiteAuto: z.enum(QUANTITES_AUTO, { error: 'Quantité proposée invalide.' }),
  quantiteFixe: integer(0, 100, 'Quantité fixe', 'unités'),
  actif: z.boolean().optional(),
}

const modelFields = {
  nom: z.string().trim().min(1, 'Le nom du modèle est requis.').max(60, 'Nom : 60 caractères maximum.'),
  cotes: z
    .array(integer(1, 2000, 'Cote', 'mm'), { error: 'Cotes invalides.' })
    .min(1, 'Au moins une cote.')
    .max(20, '20 cotes maximum.'),
  // Angle intérieur signé ; ±1 pour une pince
  angles: z
    .array(
      integer(-179, 179, 'Angle', '°').refine((a) => a !== 0, 'Angle : 0° impossible.'),
      { error: 'Angles invalides.' },
    )
    .max(19),
  noms: z.array(z.string().trim().max(30, 'Nom de cote : 30 caractères maximum.'), { error: 'Noms de cotes invalides.' }).max(20),
  cap: integer(-180, 180, 'Orientation', '°'),
  longueur: integer(1, 20000, 'Longueur proposée', 'mm'),
  quantite: integer(1, 9999, 'Quantité proposée', 'pièces'),
  actif: z.boolean().optional(),
}
type ModelShape = Pick<PieceModel, 'cotes' | 'angles' | 'noms'>

/** Forme cohérente : un angle par pli, un nom par cote (complété à vide), profil qui ne se referme pas. */
function checkShape(m: ModelShape): { error: string; field: string } | ModelShape {
  if (m.angles.length !== m.cotes.length - 1) return { error: 'Il faut un angle pour chaque pli.', field: 'angles' }
  if (m.noms.length > m.cotes.length) return { error: 'Un nom par cote au maximum.', field: 'noms' }
  if (selfIntersection(m.cotes, m.angles, 0.5)) return { error: 'Le profil se referme sur lui-même : vérifiez les angles et le sens des plis.', field: 'angles' }
  return { ...m, noms: m.cotes.map((_, i) => m.noms[i] ?? '') }
}
/** Erreur de validation avec le chemin complet (« cotes.2 »), pour désigner la cote fautive. */
const invalidPath = (reply: FastifyReply, e: z.ZodError) => {
  const issue = e.issues[0]
  return reply.code(400).send({ error: issue?.message ?? 'Données invalides.', field: issue?.path.length ? issue.path.join('.') : undefined })
}
const shapeError = (x: ReturnType<typeof checkShape>): x is { error: string; field: string } => 'error' in x

/** Résumé lisible d'un modèle pour le journal. */
const describeModel = (m: Pick<PieceModel, 'nom' | 'cotes' | 'angles'>) => ({
  nom: m.nom,
  forme: m.cotes.map((c, i) => `${String.fromCharCode(65 + i)} ${c}${i < m.angles.length ? ` · ${isPince(m.angles[i]!) ? 'pince' : `${m.angles[i]}°`}` : ''}`).join(' · '),
})

/** Les modèles cités par un accessoire doivent exister. */
async function unknownModels(ids: string[] | undefined) {
  if (!ids?.length) return false
  const found = await db.select({ id: pieceModels.id }).from(pieceModels).where(inArray(pieceModels.id, ids))
  return found.length !== ids.length
}

const validId = (id: string) => z.uuid().safeParse(id).success
const materialLabel = (m: { nom: string; epaisseur: number }) => `${m.nom} ${m.epaisseur.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} mm`

const settingsFields = {
  prixPliMl: decimal(0, 100, 'Prix par pli et par mètre', '€'),
  miseEnRoute: decimal(0, 1000, 'Mise en route', '€'),
  minimumCommande: decimal(0, 10000, 'Minimum de commande', '€'),
  remisePro: decimal(0, 90, 'Remise pro', '%'),
  tva: decimal(0, 50, 'TVA', '%'),
  delaiStandard: integer(1, 60, 'Délai standard', 'jours'),
  remisesQuantite: z
    .array(
      z.object({
        seuil: integer(2, 100000, 'Seuil de remise', 'pièces'),
        remise: decimal(0.01, 90, 'Remise quantité', '%'),
      }),
    )
    .max(6, '6 paliers de remise maximum.')
    .refine((t) => t.every((p, i) => i === 0 || p.seuil > t[i - 1]!.seuil), 'Les paliers doivent aller du plus petit au plus grand nombre de pièces, sans doublon.')
    .refine((t) => t.every((p, i) => i === 0 || p.remise > t[i - 1]!.remise), 'Chaque palier doit donner une remise plus forte que le précédent.'),
  largeurTole: integer(100, 3000, 'Largeur de tôle', 'mm'),
  longueurMin: integer(10, 10000, 'Longueur minimum', 'mm'),
  longueurMax: integer(100, 10000, 'Longueur maximum', 'mm'),
  plisMax: integer(1, 30, 'Nombre de plis maximum', 'plis'),
  angleMin: integer(15, 179, 'Angle minimum', '°'),
  angleMax: integer(15, 179, 'Angle maximum', '°'),
  pinceAutorisee: z.boolean({ error: 'Pince : oui ou non.' }),
}

export async function catalogRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requirePerm('catalog.manage'))

  // --- Matières ---
  app.get('/materials', async () => ({
    materials: await db.select().from(materials).orderBy(asc(materials.position), asc(materials.nom), asc(materials.epaisseur)),
  }))

  app.post('/materials', async (req, reply) => {
    const parsed = z.object(materialFields).safeParse(req.body)
    if (!parsed.success) return invalid(reply, parsed.error)
    try {
      const [m] = await db
        .insert(materials)
        .values({ ...parsed.data, position: sql`(select coalesce(max(position), 0) + 1 from materials)` })
        .returning()
      await audit(req, 'catalog.material_created', { targetType: 'material', targetId: m!.id, details: { nom: materialLabel(m!), prixM2: m!.prixM2 } })
      return reply.code(201).send({ material: m })
    } catch (e) {
      if (isUniqueViolation(e)) return reply.code(409).send({ error: 'Cette matière existe déjà dans cette épaisseur.', field: 'epaisseur' })
      throw e
    }
  })

  app.patch('/materials/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const [before] = validId(id) ? await db.select().from(materials).where(eq(materials.id, id)) : []
    if (!before) return reply.code(404).send({ error: 'Matière introuvable.' })
    const parsed = z.object(materialFields).partial().safeParse(req.body)
    if (!parsed.success) return invalid(reply, parsed.error)
    const changes = diff(before, parsed.data)
    if (!Object.keys(changes).length) return { material: before }
    try {
      const [m] = await db
        .update(materials)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(materials.id, id))
        .returning()
      await audit(req, 'catalog.material_updated', { targetType: 'material', targetId: id, details: { nom: materialLabel(m!), changements: changes } })
      return { material: m }
    } catch (e) {
      if (isUniqueViolation(e)) return reply.code(409).send({ error: 'Cette matière existe déjà dans cette épaisseur.', field: 'epaisseur' })
      throw e
    }
  })

  // --- Modèles de pièces ---
  app.get('/models', async () => ({
    models: await db.select().from(pieceModels).orderBy(asc(pieceModels.position), asc(pieceModels.nom)),
  }))

  app.post('/models', async (req, reply) => {
    const parsed = z.object(modelFields).partial({ noms: true, quantite: true }).safeParse(req.body)
    if (!parsed.success) return invalidPath(reply, parsed.error)
    const shape = checkShape({ ...parsed.data, noms: parsed.data.noms ?? [] })
    if (shapeError(shape)) return reply.code(400).send(shape)
    try {
      const [m] = await db
        .insert(pieceModels)
        .values({ ...parsed.data, ...shape, position: sql`(select coalesce(max(position), 0) + 1 from piece_models)` })
        .returning()
      await audit(req, 'catalog.model_created', { targetType: 'model', targetId: m!.id, details: describeModel(m!) })
      return reply.code(201).send({ model: m })
    } catch (e) {
      if (isUniqueViolation(e)) return reply.code(409).send({ error: 'Un modèle porte déjà ce nom.', field: 'nom' })
      throw e
    }
  })

  app.patch('/models/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const [before] = validId(id) ? await db.select().from(pieceModels).where(eq(pieceModels.id, id)) : []
    if (!before) return reply.code(404).send({ error: 'Modèle introuvable.' })
    const parsed = z.object(modelFields).partial().safeParse(req.body)
    if (!parsed.success) return invalidPath(reply, parsed.error)
    const data: Partial<PieceModel> = { ...parsed.data }
    if (data.cotes || data.angles || data.noms) {
      const shape = checkShape({ cotes: data.cotes ?? before.cotes, angles: data.angles ?? before.angles, noms: data.noms ?? before.noms })
      if (shapeError(shape)) return reply.code(400).send(shape)
      Object.assign(data, shape)
    }
    const changes = diff(before as Record<string, unknown>, data as Record<string, unknown>)
    if (!Object.keys(changes).length) return { model: before }
    try {
      const [m] = await db
        .update(pieceModels)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(pieceModels.id, id))
        .returning()
      await audit(req, 'catalog.model_updated', { targetType: 'model', targetId: id, details: { nom: m!.nom, changements: changes } })
      return { model: m }
    } catch (e) {
      if (isUniqueViolation(e)) return reply.code(409).send({ error: 'Un modèle porte déjà ce nom.', field: 'nom' })
      throw e
    }
  })

  // --- Façonnage et conditions (réglages uniques) ---
  app.get('/settings', async () => ({ settings: await getPricingSettings() }))

  app.patch('/settings', async (req, reply) => {
    const parsed = z.object(settingsFields).partial().safeParse(req.body)
    if (!parsed.success) return invalid(reply, parsed.error)
    const before = await getPricingSettings()
    const merged = { ...before, ...parsed.data }
    if (merged.longueurMin >= merged.longueurMax) {
      return reply.code(400).send({ error: 'La longueur minimum doit être plus petite que la longueur maximum.', field: 'longueurMin' })
    }
    if (merged.angleMin > merged.angleMax) {
      return reply.code(400).send({ error: 'L’angle minimum ne peut pas dépasser l’angle maximum.', field: 'angleMin' })
    }
    const changes = diff(before as Record<string, unknown>, parsed.data as Record<string, unknown>)
    if (!Object.keys(changes).length) return { settings: before }
    const [settings] = await db
      .update(pricingSettings)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(pricingSettings.id, 1))
      .returning()
    await audit(req, 'catalog.settings_updated', { targetType: 'pricing', details: { changements: changes } })
    return { settings }
  })

  // --- Coloris ---
  app.get('/colors', async () => ({
    colors: await db.select().from(colors).orderBy(asc(colors.position), asc(colors.nom)),
  }))

  app.post('/colors', async (req, reply) => {
    const parsed = z.object(colorFields).safeParse(req.body)
    if (!parsed.success) return invalid(reply, parsed.error)
    try {
      const [c] = await db
        .insert(colors)
        .values({ ...parsed.data, position: sql`(select coalesce(max(position), 0) + 1 from colors)` })
        .returning()
      await audit(req, 'catalog.color_created', { targetType: 'color', targetId: c!.id, details: { nom: `${c!.reference} ${c!.nom}`, majoration: c!.majoration } })
      return reply.code(201).send({ color: c })
    } catch (e) {
      if (isUniqueViolation(e)) return reply.code(409).send({ error: 'Cette référence de coloris existe déjà.', field: 'reference' })
      throw e
    }
  })

  app.patch('/colors/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const [before] = validId(id) ? await db.select().from(colors).where(eq(colors.id, id)) : []
    if (!before) return reply.code(404).send({ error: 'Coloris introuvable.' })
    const parsed = z.object(colorFields).partial().safeParse(req.body)
    if (!parsed.success) return invalid(reply, parsed.error)
    const changes = diff(before, parsed.data)
    if (!Object.keys(changes).length) return { color: before }
    try {
      const [c] = await db
        .update(colors)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(colors.id, id))
        .returning()
      await audit(req, 'catalog.color_updated', { targetType: 'color', targetId: id, details: { nom: `${c!.reference} ${c!.nom}`, changements: changes } })
      return { color: c }
    } catch (e) {
      if (isUniqueViolation(e)) return reply.code(409).send({ error: 'Cette référence de coloris existe déjà.', field: 'reference' })
      throw e
    }
  })

  // --- Accessoires ---
  app.get('/accessories', async () => ({
    accessories: await db.select().from(accessories).orderBy(asc(accessories.position), asc(accessories.nom)),
  }))

  app.post('/accessories', async (req, reply) => {
    const parsed = z.object(accessoryFields).partial({ quantiteFixe: true }).safeParse(req.body)
    if (!parsed.success) return invalid(reply, parsed.error)
    const data = { ...parsed.data, quantiteFixe: parsed.data.quantiteFixe ?? 0 }
    const rule = checkFixed(data)
    if (rule) return reply.code(400).send(rule)
    if (await unknownModels(data.modeles)) return reply.code(400).send({ error: 'Modèle inconnu.', field: 'modeles' })
    try {
      const [a] = await db
        .insert(accessories)
        .values({ ...data, position: sql`(select coalesce(max(position), 0) + 1 from accessories)` })
        .returning()
      await audit(req, 'catalog.accessory_created', { targetType: 'accessory', targetId: a!.id, details: { nom: a!.nom, prix: a!.prix, unite: a!.unite } })
      return reply.code(201).send({ accessory: a })
    } catch (e) {
      if (isUniqueViolation(e)) return reply.code(409).send({ error: 'Un accessoire porte déjà ce nom.', field: 'nom' })
      throw e
    }
  })

  app.patch('/accessories/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const [before] = validId(id) ? await db.select().from(accessories).where(eq(accessories.id, id)) : []
    if (!before) return reply.code(404).send({ error: 'Accessoire introuvable.' })
    const parsed = z.object(accessoryFields).partial().safeParse(req.body)
    if (!parsed.success) return invalid(reply, parsed.error)
    const data = { ...parsed.data }
    const merged = { ...before, ...data }
    const rule = checkFixed(merged)
    if (rule) return reply.code(400).send(rule)
    // La quantité fixe n'a de sens qu'avec la règle « fixe »
    if (merged.quantiteAuto !== 'fixe') data.quantiteFixe = 0
    if (await unknownModels(data.modeles)) return reply.code(400).send({ error: 'Modèle inconnu.', field: 'modeles' })
    const changes = diff(before, data)
    if (!Object.keys(changes).length) return { accessory: before }
    // Au journal, les modèles par leur nom plutôt que par leur identifiant
    if (changes.modeles) {
      const names = new Map((await db.select({ id: pieceModels.id, nom: pieceModels.nom }).from(pieceModels)).map((m) => [m.id, m.nom]))
      const label = (ids: unknown) => (ids as string[]).map((id) => names.get(id) ?? id)
      changes.modeles = { avant: label(changes.modeles.avant), apres: label(changes.modeles.apres) }
    }
    try {
      const [a] = await db
        .update(accessories)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(accessories.id, id))
        .returning()
      await audit(req, 'catalog.accessory_updated', { targetType: 'accessory', targetId: id, details: { nom: a!.nom, changements: changes } })
      return { accessory: a }
    } catch (e) {
      if (isUniqueViolation(e)) return reply.code(409).send({ error: 'Un accessoire porte déjà ce nom.', field: 'nom' })
      throw e
    }
  })
}

/** Avec la règle « nombre fixe », il faut au moins un accessoire par ligne. */
function checkFixed(a: { quantiteAuto: string; quantiteFixe: number }) {
  return a.quantiteAuto === 'fixe' && a.quantiteFixe < 1 ? { error: 'Quantité fixe : 1 au minimum.', field: 'quantiteFixe' } : null
}
