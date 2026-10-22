import type { FastifyInstance, FastifyReply } from 'fastify'
import { and, asc, count, eq, inArray, max, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/index.js'
import { productVariants, products } from '../db/schema.js'
import { requirePerm } from '../auth/plugin.js'
import { audit } from '../audit.js'
import { getPricingSettings } from '../pricing.js'
import { inspectImage } from '../pdf.js'
import { htFromTtc, ttcOf } from '../shop.js'
import { decimal, invalid, isUniqueViolation } from '../validation.js'

// Espace Direction : les produits de la boutique, leurs déclinaisons (avec leur prix), leur photo et leur mise en ligne.

export const IMAGE_MAX = 3 * 1024 * 1024
const PRODUITS_MAX = 500
const VARIANTES_MAX = 200

const text = (max: number, label: string) => z.string().trim().max(max, `${label} : ${max} caractères maximum.`)
const productFields = {
  nom: text(120, 'Nom').min(1, 'Le nom du produit est requis.'),
  categorie: text(60, 'Catégorie').default(''),
  description: text(4000, 'Description').default(''),
}
const createBody = z.object(productFields)
const patchBody = z.object({
  nom: productFields.nom.optional(),
  categorie: text(60, 'Catégorie').optional(),
  description: text(4000, 'Description').optional(),
  actif: z.boolean({ error: 'Actif : oui ou non.' }).optional(),
  imageAlt: text(160, 'Description de la photo').optional(),
})
const variantFields = {
  libelle: text(120, 'Libellé').min(1, 'Le libellé de la déclinaison est requis (ex. « 320 mm · 3 m »).'),
  reference: text(60, 'Référence').default(''),
  prixTtc: decimal(0.01, 100000, 'Prix TTC', '€'),
}
const variantCreate = z.object({ ...variantFields, actif: z.boolean().optional() })
const variantPatch = z.object({ libelle: variantFields.libelle.optional(), reference: text(60, 'Référence').optional(), prixTtc: variantFields.prixTtc.optional(), actif: z.boolean().optional() })
const imageQuery = z.object({ alt: text(160, 'Description de la photo').default('') })

const isUuid = (id: string) => z.uuid().safeParse(id).success

// Catalogue à importer (celui de l'ancienne boutique : produits, déclinaisons décrites par leurs attributs, prix TTC)
const IMPORT_MAX = 3 * 1024 * 1024
const importBody = z.object({
  produits: z
    .array(
      z.object({
        nom: z.string().trim().min(1).max(200),
        categorie: z.union([z.string(), z.array(z.string())]).optional(),
        variations: z
          .array(z.object({ attrs: z.record(z.string(), z.string()).default({}), prix: z.number().min(0).max(100000), achetable: z.boolean().optional() }))
          .max(VARIANTES_MAX, `${VARIANTES_MAX} déclinaisons maximum par produit.`),
      }),
    )
    .min(1, 'Le fichier ne contient aucun produit.')
    .max(PRODUITS_MAX, `${PRODUITS_MAX} produits maximum.`),
})
const blanks = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ').replace(/\s+/g, ' ').trim()
/** « BANDEAUX EN « L » BLANC » → « Bandeaux en « L » blanc » : le nom reste lisible sans crier. */
const sentence = (s: string) => {
  const t = blanks(s)
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase().replace(/\bral\b/g, 'RAL').replace(/«\s*([a-z])\s*»/g, (_m, l: string) => `« ${l.toUpperCase()} »`)
}
/** Libellé d'une déclinaison : ses attributs, un nombre seul étant précédé du nom de l'attribut (« hauteur de bandeau 225 »). */
const variantLabel = (attrs: Record<string, string>) =>
  Object.entries(attrs)
    .map(([k, v]) => (/^[\d.,\s]+$/.test(blanks(v)) ? `${blanks(k).toLowerCase()} ${blanks(v)}` : blanks(v)))
    .filter(Boolean)
    .join(' · ')
const lotBody = z.object({
  ids: z.array(z.uuid()).min(1, 'Choisissez au moins un produit.').max(PRODUITS_MAX),
  action: z.enum(['mettre_en_ligne', 'retirer', 'supprimer'], { error: 'Action inconnue.' }),
})
const prixBody = z.object({
  pourcent: z.number({ error: 'Indiquez le pourcentage.' }).min(-90, 'Baisse de 90 % maximum.').max(500, 'Hausse de 500 % maximum.'),
})
const duplicateBody = z.object({ nom: productFields.nom })

/** Réponse d'une déclinaison : prix HT enregistré et prix TTC affiché au client. */
const variantOut = (v: typeof productVariants.$inferSelect, taux: number) => ({ id: v.id, libelle: v.libelle, reference: v.reference, prixHt: v.prixHt, prixTtc: ttcOf(v.prixHt, taux), actif: v.actif })

export async function boutiqueRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requirePerm('products.manage'))
  app.addContentTypeParser(['image/png', 'image/jpeg'], { parseAs: 'buffer', bodyLimit: IMAGE_MAX + 1024 }, (_req, body, done) => done(null, body))

  const columns = {
    id: products.id,
    nom: products.nom,
    categorie: products.categorie,
    actif: products.actif,
    hasImage: sql<boolean>`${products.image} is not null`.as('has_image'),
    version: sql<number>`(extract(epoch from ${products.updatedAt}) * 1000)::bigint`.mapWith(Number).as('version'),
  }

  async function findProduct(id: string, reply: FastifyReply) {
    const [p] = isUuid(id) ? await db.select({ ...columns, description: products.description, imageAlt: products.imageAlt, imageLargeur: products.imageLargeur, imageHauteur: products.imageHauteur }).from(products).where(eq(products.id, id)) : []
    if (!p) reply.code(404).send({ error: 'Produit introuvable.' })
    return p ?? null
  }
  async function findVariant(id: string, reply: FastifyReply) {
    const [v] = isUuid(id) ? await db.select().from(productVariants).where(eq(productVariants.id, id)) : []
    if (!v) reply.code(404).send({ error: 'Déclinaison introuvable.' })
    return v ?? null
  }
  const touch = (id: string) => db.update(products).set({ updatedAt: new Date() }).where(eq(products.id, id))
  const activeVariants = async (productId: string, except?: string) => {
    const rows = await db.select({ id: productVariants.id }).from(productVariants).where(and(eq(productVariants.productId, productId), eq(productVariants.actif, true)))
    return rows.filter((r) => r.id !== except).length
  }

  // --- Produits ---

  app.get('/produits', async () => {
    const taux = (await getPricingSettings()).tva
    const rows = await db
      .select({
        ...columns,
        variantes: sql<number>`(select count(*) from product_variants v where v.product_id = products.id)::int`.mapWith(Number),
        actives: sql<number>`(select count(*) from product_variants v where v.product_id = products.id and v.actif)::int`.mapWith(Number),
        prixMin: sql<number | null>`(select min(v.prix_ht) from product_variants v where v.product_id = products.id and v.actif)`.mapWith((x) => (x === null ? null : Number(x))),
      })
      .from(products)
      .orderBy(asc(products.position), asc(products.nom))
    return { produits: rows.map(({ prixMin, ...p }) => ({ ...p, prixMinTtc: prixMin === null ? null : ttcOf(prixMin, taux) })), tva: taux }
  })

  app.post('/produits', async (req, reply) => {
    const parsed = createBody.safeParse(req.body)
    if (!parsed.success) return invalid(reply, parsed.error)
    const [total] = await db.select({ n: count() }).from(products)
    if ((total?.n ?? 0) >= PRODUITS_MAX) return reply.code(409).send({ error: `${PRODUITS_MAX} produits maximum.` })
    const [last] = await db.select({ p: max(products.position) }).from(products)
    const [p] = await db
      .insert(products)
      .values({ ...parsed.data, position: (last?.p ?? 0) + 1 })
      .returning({ id: products.id })
    await audit(req, 'product.created', { targetType: 'product', targetId: p!.id, details: { nom: parsed.data.nom } })
    return reply.code(201).send({ id: p!.id })
  })

  app.get('/produits/:id', async (req, reply) => {
    const p = await findProduct((req.params as { id: string }).id, reply)
    if (!p) return
    const taux = (await getPricingSettings()).tva
    const variantes = await db.select().from(productVariants).where(eq(productVariants.productId, p.id)).orderBy(asc(productVariants.position), asc(productVariants.libelle))
    return { produit: p, variantes: variantes.map((v) => variantOut(v, taux)), tva: taux }
  })

  app.patch('/produits/:id', async (req, reply) => {
    const p = await findProduct((req.params as { id: string }).id, reply)
    if (!p) return
    const parsed = patchBody.safeParse(req.body)
    if (!parsed.success) return invalid(reply, parsed.error)
    const d = parsed.data
    if (d.actif === true && !p.actif && !(await activeVariants(p.id))) {
      return reply.code(409).send({ error: 'Ajoutez au moins une déclinaison active (avec son prix) avant de mettre ce produit en ligne.', field: 'actif' })
    }
    const set: Partial<typeof products.$inferInsert> = {}
    const champs: string[] = []
    for (const [key, label] of [['nom', 'nom'], ['categorie', 'catégorie'], ['description', 'description'], ['imageAlt', 'description de la photo']] as const) {
      if (d[key] !== undefined && d[key] !== p[key]) {
        set[key] = d[key]
        champs.push(label)
      }
    }
    if (d.actif !== undefined && d.actif !== p.actif) set.actif = d.actif
    if (!Object.keys(set).length) return { ok: true }
    await db.update(products).set({ ...set, updatedAt: new Date() }).where(eq(products.id, p.id))
    if (champs.length) await audit(req, 'product.updated', { targetType: 'product', targetId: p.id, details: { nom: d.nom ?? p.nom, champs } })
    if (set.actif !== undefined) await audit(req, set.actif ? 'product.activated' : 'product.deactivated', { targetType: 'product', targetId: p.id, details: { nom: d.nom ?? p.nom } })
    return { ok: true }
  })

  app.delete('/produits/:id', async (req, reply) => {
    const p = await findProduct((req.params as { id: string }).id, reply)
    if (!p) return
    await db.delete(products).where(eq(products.id, p.id))
    await audit(req, 'product.deleted', { targetType: 'product', targetId: p.id, details: { nom: p.nom } })
    return { ok: true }
  })

  // --- Import, copie, prix en lot, actions en lot ---

  // Reprend un catalogue (JSON de l'ancienne boutique). Les nouveaux produits restent cachés du site ; un produit déjà présent
  // (même nom) garde sa fiche et reçoit seulement les déclinaisons et prix du fichier. Les déclinaisons indisponibles ou à 0 € sont écartées.
  app.post('/import', { bodyLimit: IMPORT_MAX }, async (req, reply) => {
    const parsed = importBody.safeParse(req.body)
    if (!parsed.success) return invalid(reply, parsed.error)
    const taux = (await getPricingSettings()).tva
    const bilan = { produitsCrees: 0, produitsExistants: 0, variantesCreees: 0, variantesMisesAJour: 0, ignorees: 0 }
    await db.transaction(async (tx) => {
      const [last] = await tx.select({ p: max(products.position) }).from(products)
      let position = last?.p ?? 0
      const [{ n: deja }] = (await tx.select({ n: count() }).from(products)) as [{ n: number }]
      let total = deja
      for (const src of parsed.data.produits) {
        const nom = sentence(src.nom)
        const [existing] = await tx.select().from(products).where(sql`lower(${products.nom}) = ${nom.toLowerCase()}`)
        let productId = existing?.id
        if (existing) bilan.produitsExistants++
        else {
          if (++total > PRODUITS_MAX) throw new RangeError(`${PRODUITS_MAX} produits maximum.`)
          const categorie = sentence(Array.isArray(src.categorie) ? (src.categorie[0] ?? '') : (src.categorie ?? '')).slice(0, 60)
          const [p] = await tx.insert(products).values({ nom, categorie, position: ++position }).returning({ id: products.id })
          productId = p!.id
          bilan.produitsCrees++
        }
        const have = new Map((await tx.select().from(productVariants).where(eq(productVariants.productId, productId!))).map((v) => [v.libelle, v]))
        let vpos = Math.max(0, ...[...have.values()].map((v) => v.position))
        const seen = new Set<string>()
        for (const v of src.variations) {
          const libelle = variantLabel(v.attrs).slice(0, 120)
          const prixTtc = Math.round(v.prix * 100) / 100
          if (!libelle || prixTtc <= 0 || v.achetable === false || seen.has(libelle)) {
            bilan.ignorees++
            continue
          }
          seen.add(libelle)
          const prixHt = htFromTtc(prixTtc, taux)
          const cur = have.get(libelle)
          if (cur) {
            if (cur.prixHt !== prixHt) {
              await tx.update(productVariants).set({ prixHt, updatedAt: new Date() }).where(eq(productVariants.id, cur.id))
              bilan.variantesMisesAJour++
            }
          } else {
            await tx.insert(productVariants).values({ productId: productId!, libelle, prixHt, position: ++vpos })
            bilan.variantesCreees++
          }
        }
        await tx.update(products).set({ updatedAt: new Date() }).where(eq(products.id, productId!))
      }
    }).catch((e) => {
      if (e instanceof RangeError) return reply.code(409).send({ error: e.message })
      throw e
    })
    if (reply.sent) return
    await audit(req, 'product.imported', { details: bilan })
    return bilan
  })

  app.post('/produits/lot', async (req, reply) => {
    const parsed = lotBody.safeParse(req.body)
    if (!parsed.success) return invalid(reply, parsed.error)
    const { ids, action } = parsed.data
    const rows = await db.select({ id: products.id, nom: products.nom, actif: products.actif, actives: sql<number>`(select count(*) from product_variants v where v.product_id = products.id and v.actif)::int`.mapWith(Number) }).from(products).where(inArray(products.id, ids))
    if (action === 'mettre_en_ligne') {
      const vides = rows.filter((r) => !r.actif && !r.actives)
      if (vides.length) return reply.code(409).send({ error: `Sans déclinaison active, impossible de mettre en ligne : ${vides.slice(0, 3).map((r) => r.nom).join(', ')}${vides.length > 3 ? ` et ${vides.length - 3} autre${vides.length > 4 ? 's' : ''}` : ''}.`, field: 'ids' })
    }
    if (action === 'supprimer') await db.delete(products).where(inArray(products.id, rows.map((r) => r.id)))
    else await db.update(products).set({ actif: action === 'mettre_en_ligne', updatedAt: new Date() }).where(inArray(products.id, rows.map((r) => r.id)))
    await audit(req, 'product.bulk', { details: { action, produits: rows.length, noms: rows.slice(0, 5).map((r) => r.nom) } })
    return { produits: rows.length }
  })

  // Copie un produit (fiche, photo, déclinaisons et prix) sous un autre nom : pratique pour un autre coloris. La copie reste cachée.
  app.post('/produits/:id/dupliquer', async (req, reply) => {
    const p = await findProduct((req.params as { id: string }).id, reply)
    if (!p) return
    const parsed = duplicateBody.safeParse(req.body)
    if (!parsed.success) return invalid(reply, parsed.error)
    const [total] = await db.select({ n: count() }).from(products)
    if ((total?.n ?? 0) >= PRODUITS_MAX) return reply.code(409).send({ error: `${PRODUITS_MAX} produits maximum.` })
    const id = await db.transaction(async (tx) => {
      const [src] = await tx.select().from(products).where(eq(products.id, p.id))
      const [last] = await tx.select({ p: max(products.position) }).from(products)
      const { id: _i, createdAt: _c, updatedAt: _u, actif: _a, position: _p, nom: _n, ...rest } = src!
      const [copy] = await tx.insert(products).values({ ...rest, nom: parsed.data.nom, actif: false, position: (last?.p ?? 0) + 1 }).returning({ id: products.id })
      const vs = await tx.select().from(productVariants).where(eq(productVariants.productId, p.id))
      if (vs.length) await tx.insert(productVariants).values(vs.map((v) => ({ productId: copy!.id, libelle: v.libelle, reference: '', prixHt: v.prixHt, actif: v.actif, position: v.position })))
      return copy!.id
    })
    await audit(req, 'product.duplicated', { targetType: 'product', targetId: id, details: { nom: parsed.data.nom, source: p.nom } })
    return reply.code(201).send({ id })
  })

  // Hausse ou baisse de tous les prix d'un produit, en pourcentage (au centime TTC près)
  app.post('/produits/:id/prix', async (req, reply) => {
    const p = await findProduct((req.params as { id: string }).id, reply)
    if (!p) return
    const parsed = prixBody.safeParse(req.body)
    if (!parsed.success) return invalid(reply, parsed.error)
    const taux = (await getPricingSettings()).tva
    const vs = await db.select().from(productVariants).where(eq(productVariants.productId, p.id))
    let n = 0
    await db.transaction(async (tx) => {
      for (const v of vs) {
        const ttc = Math.max(0.01, Math.round(ttcOf(v.prixHt, taux) * (1 + parsed.data.pourcent / 100) * 100) / 100)
        const prixHt = htFromTtc(ttc, taux)
        if (prixHt !== v.prixHt) {
          await tx.update(productVariants).set({ prixHt, updatedAt: new Date() }).where(eq(productVariants.id, v.id))
          n++
        }
      }
      await tx.update(products).set({ updatedAt: new Date() }).where(eq(products.id, p.id))
    })
    await audit(req, 'product.prices_adjusted', { targetType: 'product', targetId: p.id, details: { nom: p.nom, pourcent: parsed.data.pourcent, variantes: n } })
    return { variantes: n }
  })

  // --- Photo ---

  app.get('/produits/:id/image', async (req, reply) => {
    const id = (req.params as { id: string }).id
    const [row] = isUuid(id) ? await db.select({ image: products.image, type: products.imageType }).from(products).where(eq(products.id, id)) : []
    if (!row?.image || !row.type) return reply.code(404).send({ error: 'Aucune photo.' })
    return reply.header('Content-Type', row.type).header('X-Content-Type-Options', 'nosniff').send(row.image)
  })

  app.put('/produits/:id/image', async (req, reply) => {
    const p = await findProduct((req.params as { id: string }).id, reply)
    if (!p) return
    const q = imageQuery.safeParse(req.query)
    if (!q.success) return invalid(reply, q.error)
    const body = req.body
    if (!Buffer.isBuffer(body) || !body.length) return reply.code(415).send({ error: 'Envoyez une image PNG ou JPEG.', field: 'image' })
    if (body.length > IMAGE_MAX) return reply.code(413).send({ error: 'Image trop lourde : 3 Mo maximum.', field: 'image' })
    const img = await inspectImage(body)
    if (!img || img.type !== req.headers['content-type']) return reply.code(400).send({ error: 'Image illisible : envoyez un fichier PNG ou JPEG valide.', field: 'image' })
    if (img.width < 200 || img.height < 200) return reply.code(400).send({ error: 'Image trop petite : 200 × 200 pixels minimum.', field: 'image' })
    await db.update(products).set({ image: body, imageType: img.type, imageLargeur: img.width, imageHauteur: img.height, imageAlt: q.data.alt || p.imageAlt, updatedAt: new Date() }).where(eq(products.id, p.id))
    await audit(req, 'product.image_updated', { targetType: 'product', targetId: p.id, details: { nom: p.nom, largeur: img.width, hauteur: img.height, octets: body.length } })
    return { ok: true }
  })

  app.delete('/produits/:id/image', async (req, reply) => {
    const p = await findProduct((req.params as { id: string }).id, reply)
    if (!p) return
    await db.update(products).set({ image: null, imageType: null, imageLargeur: null, imageHauteur: null, updatedAt: new Date() }).where(eq(products.id, p.id))
    await audit(req, 'product.image_deleted', { targetType: 'product', targetId: p.id, details: { nom: p.nom } })
    return { ok: true }
  })

  // --- Déclinaisons ---

  app.post('/produits/:id/variantes', async (req, reply) => {
    const p = await findProduct((req.params as { id: string }).id, reply)
    if (!p) return
    const parsed = variantCreate.safeParse(req.body)
    if (!parsed.success) return invalid(reply, parsed.error)
    const [total] = await db.select({ n: count() }).from(productVariants).where(eq(productVariants.productId, p.id))
    if ((total?.n ?? 0) >= VARIANTES_MAX) return reply.code(409).send({ error: `${VARIANTES_MAX} déclinaisons maximum par produit.` })
    const taux = (await getPricingSettings()).tva
    const [last] = await db.select({ p: max(productVariants.position) }).from(productVariants).where(eq(productVariants.productId, p.id))
    try {
      const [v] = await db
        .insert(productVariants)
        .values({ productId: p.id, libelle: parsed.data.libelle, reference: parsed.data.reference, prixHt: htFromTtc(parsed.data.prixTtc, taux), actif: parsed.data.actif ?? true, position: (last?.p ?? 0) + 1 })
        .returning()
      await touch(p.id)
      await audit(req, 'product.variant_added', { targetType: 'product', targetId: p.id, details: { nom: p.nom, libelle: v!.libelle, prixTtc: ttcOf(v!.prixHt, taux) } })
      return reply.code(201).send({ variante: variantOut(v!, taux) })
    } catch (e) {
      if (isUniqueViolation(e)) return reply.code(409).send({ error: 'Ce produit a déjà une déclinaison avec ce libellé.', field: 'libelle' })
      throw e
    }
  })

  app.patch('/variantes/:id', async (req, reply) => {
    const v = await findVariant((req.params as { id: string }).id, reply)
    if (!v) return
    const parsed = variantPatch.safeParse(req.body)
    if (!parsed.success) return invalid(reply, parsed.error)
    const [p] = await db.select({ id: products.id, nom: products.nom, actif: products.actif }).from(products).where(eq(products.id, v.productId))
    if (parsed.data.actif === false && v.actif && p!.actif && !(await activeVariants(v.productId, v.id))) {
      return reply.code(409).send({ error: 'C’est la dernière déclinaison en vente de ce produit : mettez d’abord le produit hors ligne.', field: 'actif' })
    }
    const taux = (await getPricingSettings()).tva
    const set: Partial<typeof productVariants.$inferInsert> = {}
    const d = parsed.data
    if (d.libelle !== undefined) set.libelle = d.libelle
    if (d.reference !== undefined) set.reference = d.reference
    if (d.prixTtc !== undefined && d.prixTtc !== ttcOf(v.prixHt, taux)) set.prixHt = htFromTtc(d.prixTtc, taux)
    if (d.actif !== undefined) set.actif = d.actif
    try {
      if (Object.keys(set).length) {
        await db.update(productVariants).set({ ...set, updatedAt: new Date() }).where(eq(productVariants.id, v.id))
        await touch(v.productId)
        const prix = set.prixHt !== undefined ? { avant: ttcOf(v.prixHt, taux), apres: ttcOf(set.prixHt, taux) } : undefined
        await audit(req, 'product.variant_updated', { targetType: 'product', targetId: v.productId, details: { nom: p!.nom, libelle: set.libelle ?? v.libelle, ...(prix ? { prixTtc: prix } : {}), ...(set.actif !== undefined ? { actif: set.actif } : {}) } })
      }
    } catch (e) {
      if (isUniqueViolation(e)) return reply.code(409).send({ error: 'Ce produit a déjà une déclinaison avec ce libellé.', field: 'libelle' })
      throw e
    }
    return { ok: true }
  })

  app.delete('/variantes/:id', async (req, reply) => {
    const v = await findVariant((req.params as { id: string }).id, reply)
    if (!v) return
    const [p] = await db.select({ nom: products.nom, actif: products.actif }).from(products).where(eq(products.id, v.productId))
    if (v.actif && p!.actif && !(await activeVariants(v.productId, v.id))) {
      return reply.code(409).send({ error: 'C’est la dernière déclinaison en vente de ce produit : mettez d’abord le produit hors ligne.' })
    }
    await db.delete(productVariants).where(eq(productVariants.id, v.id))
    await touch(v.productId)
    await audit(req, 'product.variant_deleted', { targetType: 'product', targetId: v.productId, details: { nom: p!.nom, libelle: v.libelle } })
    return { ok: true }
  })
}
