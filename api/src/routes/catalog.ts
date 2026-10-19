import type { FastifyInstance, FastifyReply } from 'fastify'
import { asc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/index.js'
import { colors, materials, pricingSettings } from '../db/schema.js'
import { getPricingSettings } from '../pricing.js'
import { requirePerm } from '../auth/plugin.js'
import { audit } from '../audit.js'

// Les nombres arrivent du formulaire en texte français (« 62,50 ») ou en nombre
const decimal = (min: number, max: number, label: string, unit: string) =>
  z.preprocess(
    (v) => (typeof v === 'string' ? Number(v.replace(/\s/g, '').replace(',', '.')) : v),
    z
      .number({ error: `${label} : nombre attendu.` })
      .min(min, `${label} : ${min} ${unit} minimum.`)
      .max(max, `${label} : ${max} ${unit} maximum.`)
      .transform((n) => Math.round(n * 100) / 100),
  )
const integer = (min: number, max: number, label: string, unit: string) =>
  z.preprocess(
    (v) => (typeof v === 'string' ? Number(v.trim()) : v),
    z
      .number({ error: `${label} : nombre attendu.` })
      .int(`${label} : nombre entier attendu.`)
      .min(min, `${label} : ${min} ${unit} minimum.`)
      .max(max, `${label} : ${max} ${unit} maximum.`),
  )

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

function invalid(reply: FastifyReply, e: z.ZodError) {
  const issue = e.issues[0]
  return reply.code(400).send({ error: issue?.message ?? 'Données invalides.', field: issue?.path[0] !== undefined ? String(issue.path[0]) : undefined })
}

const isUniqueViolation = (e: unknown) => {
  const err = e as { code?: string; cause?: { code?: string } }
  return err?.code === '23505' || err?.cause?.code === '23505'
}

/** Différences avant / après, pour le journal (utile pour suivre l'historique des prix). */
function diff<T extends Record<string, unknown>>(before: T, changes: Partial<T>) {
  const out: Record<string, { avant: unknown; apres: unknown }> = {}
  for (const [k, v] of Object.entries(changes)) if (v !== undefined && v !== before[k]) out[k] = { avant: before[k], apres: v }
  return out
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
    const changes = diff(before as Record<string, unknown>, parsed.data as Record<string, unknown>)
    // Les paliers sont des tableaux : on compare leur contenu
    if (changes.remisesQuantite && JSON.stringify(before.remisesQuantite) === JSON.stringify(parsed.data.remisesQuantite)) delete changes.remisesQuantite
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
}
