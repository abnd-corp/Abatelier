import type { FastifyInstance, FastifyReply } from 'fastify'
import { and, asc, count, desc, eq, gt, isNotNull, isNull, lt, max, sql, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/index.js'
import { clients, contactRequests, PHOTO_PLACES, sitePhotos } from '../db/schema.js'
import { orderBody, placeOrder } from './orders.js'
import { requirePerm } from '../auth/plugin.js'
import { audit } from '../audit.js'
import { inspectImage } from '../pdf.js'
import { FIELD, getEditableContent, setContent } from '../site.js'
import { invalid } from '../validation.js'

// Espace Direction : textes, photos et demandes de contact du site vitrine.

export const PHOTO_MAX = 3 * 1024 * 1024
const PHOTOS_TOTAL_MAX = 80

const contentBody = z.object({ valeurs: z.record(z.string(), z.string()) })
const photoQuery = z.object({
  emplacement: z.enum(PHOTO_PLACES, { error: 'Choisissez où la photo s’affiche.' }),
  alt: z.string().trim().max(160, 'Description : 160 caractères maximum.').default(''),
})
const photoPatch = z.object({
  alt: z.string().trim().max(160, 'Description : 160 caractères maximum.').optional(),
  emplacement: z.enum(PHOTO_PLACES, { error: 'Emplacement inconnu.' }).optional(),
})
const moveBody = z.object({ sens: z.enum(['haut', 'bas'], { error: 'Sens inconnu.' }) })
const listQuery = z.object({ filtre: z.enum(['a_traiter', 'traitees', 'toutes']).default('a_traiter') })
const handledBody = z.object({ traite: z.boolean({ error: 'Indiquez si la demande est traitée.' }) })

const isUuid = (id: string) => z.uuid().safeParse(id).success
const contactColumns = {
  id: contactRequests.id,
  createdAt: contactRequests.createdAt,
  nom: contactRequests.nom,
  email: contactRequests.email,
  telephone: contactRequests.telephone,
  adresse: contactRequests.adresse,
  codePostal: contactRequests.codePostal,
  ville: contactRequests.ville,
  objet: contactRequests.objet,
  message: contactRequests.message,
  fichierNom: contactRequests.fichierNom,
  fichierType: contactRequests.fichierType,
  configuration: contactRequests.configuration,
  commandeId: contactRequests.commandeId,
  traiteAt: contactRequests.traiteAt,
}

export async function siteRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requirePerm('site.manage'))
  // Photos envoyées telles quelles (le navigateur les a déjà réduites)
  app.addContentTypeParser(['image/png', 'image/jpeg'], { parseAs: 'buffer', bodyLimit: PHOTO_MAX + 1024 }, (_req, body, done) => done(null, body))

  // --- Textes ---

  app.get('/content', async () => ({ champs: await getEditableContent() }))

  app.patch('/content', async (req, reply) => {
    const parsed = contentBody.safeParse(req.body)
    if (!parsed.success) return invalid(reply, parsed.error)
    const values: Record<string, string> = {}
    for (const [key, raw] of Object.entries(parsed.data.valeurs)) {
      const f = FIELD.get(key)
      if (!f) return reply.code(400).send({ error: `Champ inconnu : ${key}.`, field: key })
      const v = raw.replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').trim()
      if (!v) return reply.code(400).send({ error: `« ${f.label} » ne peut pas être vide. Pour revenir au texte d’origine, utilisez « Rétablir ».`, field: key })
      if (v.length > f.max) return reply.code(400).send({ error: `« ${f.label} » : ${f.max} caractères maximum.`, field: key })
      values[key] = v
    }
    const before = new Map((await getEditableContent()).map((f) => [f.key, f.valeur]))
    const changed = Object.keys(values).filter((k) => values[k] !== before.get(k))
    if (!changed.length) return { champs: await getEditableContent() }
    await setContent(Object.fromEntries(changed.map((k) => [k, values[k]!])))
    // Le journal garde les libellés des champs, jamais leur contenu
    await audit(req, 'site.content_updated', { targetType: 'site', details: { champs: changed.map((k) => FIELD.get(k)!.label) } })
    return { champs: await getEditableContent() }
  })

  app.post('/content/reset', async (req, reply) => {
    const parsed = z.object({ key: z.string() }).safeParse(req.body)
    const f = parsed.success ? FIELD.get(parsed.data.key) : undefined
    if (!f) return reply.code(400).send({ error: 'Champ inconnu.' })
    await setContent({ [f.key]: f.defaut })
    await audit(req, 'site.content_reset', { targetType: 'site', details: { champ: f.label } })
    return { champs: await getEditableContent() }
  })

  // --- Photos ---

  const photoList = () =>
    db
      .select({ id: sitePhotos.id, emplacement: sitePhotos.emplacement, alt: sitePhotos.alt, largeur: sitePhotos.largeur, hauteur: sitePhotos.hauteur, position: sitePhotos.position })
      .from(sitePhotos)
      .orderBy(asc(sitePhotos.emplacement), asc(sitePhotos.position), asc(sitePhotos.createdAt))

  app.get('/photos', async () => ({ photos: await photoList() }))

  app.post('/photos', async (req, reply) => {
    const q = photoQuery.safeParse(req.query)
    if (!q.success) return invalid(reply, q.error)
    const body = req.body
    if (!Buffer.isBuffer(body) || !body.length) return reply.code(415).send({ error: 'Envoyez une image PNG ou JPEG.', field: 'photo' })
    if (body.length > PHOTO_MAX) return reply.code(413).send({ error: 'Image trop lourde : 3 Mo maximum.', field: 'photo' })
    const img = await inspectImage(body)
    if (!img || img.type !== req.headers['content-type']) return reply.code(400).send({ error: 'Image illisible : envoyez un fichier PNG ou JPEG valide.', field: 'photo' })
    if (img.width < 200 || img.height < 200) return reply.code(400).send({ error: 'Image trop petite : 200 × 200 pixels minimum.', field: 'photo' })
    const [total] = await db.select({ n: count() }).from(sitePhotos)
    if ((total?.n ?? 0) >= PHOTOS_TOTAL_MAX) return reply.code(409).send({ error: `${PHOTOS_TOTAL_MAX} photos maximum : supprimez-en avant d’en ajouter.` })
    const [last] = await db.select({ p: max(sitePhotos.position) }).from(sitePhotos).where(eq(sitePhotos.emplacement, q.data.emplacement))
    const [row] = await db
      .insert(sitePhotos)
      .values({ emplacement: q.data.emplacement, alt: q.data.alt, type: img.type, largeur: img.width, hauteur: img.height, data: body, position: (last?.p ?? 0) + 1 })
      .returning({ id: sitePhotos.id })
    await audit(req, 'site.photo_added', { targetType: 'site_photo', targetId: row!.id, details: { emplacement: q.data.emplacement, largeur: img.width, hauteur: img.height, octets: body.length } })
    return reply.code(201).send({ id: row!.id })
  })

  async function findPhoto(id: string, reply: FastifyReply) {
    const [p] = isUuid(id) ? await db.select({ id: sitePhotos.id, emplacement: sitePhotos.emplacement, alt: sitePhotos.alt, position: sitePhotos.position }).from(sitePhotos).where(eq(sitePhotos.id, id)) : []
    if (!p) reply.code(404).send({ error: 'Photo introuvable.' })
    return p ?? null
  }

  app.patch('/photos/:id', async (req, reply) => {
    const p = await findPhoto((req.params as { id: string }).id, reply)
    if (!p) return
    const parsed = photoPatch.safeParse(req.body)
    if (!parsed.success) return invalid(reply, parsed.error)
    const set: Partial<{ alt: string; emplacement: (typeof PHOTO_PLACES)[number]; position: number }> = {}
    if (parsed.data.alt !== undefined) set.alt = parsed.data.alt
    if (parsed.data.emplacement && parsed.data.emplacement !== p.emplacement) {
      const [last] = await db.select({ p: max(sitePhotos.position) }).from(sitePhotos).where(eq(sitePhotos.emplacement, parsed.data.emplacement))
      set.emplacement = parsed.data.emplacement
      set.position = (last?.p ?? 0) + 1
    }
    if (Object.keys(set).length) {
      await db.update(sitePhotos).set(set).where(eq(sitePhotos.id, p.id))
      await audit(req, 'site.photo_updated', { targetType: 'site_photo', targetId: p.id, details: { champs: [...(set.alt !== undefined ? ['description'] : []), ...(set.emplacement ? ['emplacement'] : [])], ...(set.emplacement ? { avant: p.emplacement, apres: set.emplacement } : {}) } })
    }
    return { ok: true }
  })

  // Échange la photo avec sa voisine du même emplacement
  app.post('/photos/:id/deplacer', async (req, reply) => {
    const p = await findPhoto((req.params as { id: string }).id, reply)
    if (!p) return
    const parsed = moveBody.safeParse(req.body)
    if (!parsed.success) return invalid(reply, parsed.error)
    const up = parsed.data.sens === 'haut'
    const same = eq(sitePhotos.emplacement, p.emplacement)
    const [other] = await db
      .select({ id: sitePhotos.id, position: sitePhotos.position })
      .from(sitePhotos)
      .where(and(same, up ? lt(sitePhotos.position, p.position) : gt(sitePhotos.position, p.position)))
      .orderBy(up ? desc(sitePhotos.position) : asc(sitePhotos.position))
      .limit(1)
    if (other) {
      await db.transaction(async (tx) => {
        await tx.update(sitePhotos).set({ position: other.position }).where(eq(sitePhotos.id, p.id))
        await tx.update(sitePhotos).set({ position: p.position }).where(eq(sitePhotos.id, other.id))
      })
    }
    return { ok: true }
  })

  app.delete('/photos/:id', async (req, reply) => {
    const p = await findPhoto((req.params as { id: string }).id, reply)
    if (!p) return
    await db.delete(sitePhotos).where(eq(sitePhotos.id, p.id))
    await audit(req, 'site.photo_deleted', { targetType: 'site_photo', targetId: p.id, details: { emplacement: p.emplacement } })
    return { ok: true }
  })

  // --- Demandes de contact ---

  app.get('/contacts', async (req, reply) => {
    const parsed = listQuery.safeParse(req.query)
    if (!parsed.success) return invalid(reply, parsed.error)
    const where: SQL | undefined = parsed.data.filtre === 'a_traiter' ? isNull(contactRequests.traiteAt) : parsed.data.filtre === 'traitees' ? isNotNull(contactRequests.traiteAt) : undefined
    const [rows, [pending]] = await Promise.all([
      db.select(contactColumns).from(contactRequests).where(where).orderBy(desc(contactRequests.createdAt)).limit(200),
      db.select({ n: count() }).from(contactRequests).where(isNull(contactRequests.traiteAt)),
    ])
    return { demandes: rows, aTraiter: pending?.n ?? 0 }
  })

  async function findContact(id: string, reply: FastifyReply) {
    const [c] = isUuid(id) ? await db.select(contactColumns).from(contactRequests).where(eq(contactRequests.id, id)) : []
    if (!c) reply.code(404).send({ error: 'Demande introuvable.' })
    return c ?? null
  }

  app.get('/contacts/:id/fichier', async (req, reply) => {
    const id = (req.params as { id: string }).id
    const c = await findContact(id, reply)
    if (!c) return
    const [f] = await db.select({ fichier: contactRequests.fichier }).from(contactRequests).where(eq(contactRequests.id, id))
    if (!f?.fichier || !c.fichierType) return reply.code(404).send({ error: 'Aucun fichier joint.' })
    await audit(req, 'contact.file_downloaded', { targetType: 'contact', targetId: id, details: { objet: c.objet } })
    // Fichier envoyé par un inconnu : toujours téléchargé, jamais affiché dans la page
    return reply
      .header('Content-Type', c.fichierType)
      .header('Content-Disposition', `attachment; filename="${(c.fichierNom ?? 'plan').replace(/"/g, '')}"`)
      .header('X-Content-Type-Options', 'nosniff')
      .header('Content-Security-Policy', "default-src 'none'; sandbox")
      .send(f.fichier)
  })

  app.post('/contacts/:id/traite', async (req, reply) => {
    const c = await findContact((req.params as { id: string }).id, reply)
    if (!c) return
    const parsed = handledBody.safeParse(req.body)
    if (!parsed.success) return invalid(reply, parsed.error)
    await db.update(contactRequests).set({ traiteAt: parsed.data.traite ? new Date() : null, traitePar: parsed.data.traite ? req.user!.id : null }).where(eq(contactRequests.id, c.id))
    await audit(req, parsed.data.traite ? 'contact.handled' : 'contact.reopened', { targetType: 'contact', targetId: c.id, details: { objet: c.objet } })
    return { ok: true }
  })

  // Crée la commande de l'atelier à partir d'une demande de devis du configurateur (et la fiche client si elle n'existe pas)
  app.post('/contacts/:id/commande', async (req, reply) => {
    const c = await findContact((req.params as { id: string }).id, reply)
    if (!c) return
    if (!c.configuration) return reply.code(409).send({ error: 'Cette demande ne vient pas du configurateur : il n’y a pas de pièces à commander.' })
    if (c.commandeId) return reply.code(409).send({ error: 'Une commande a déjà été créée pour cette demande.', commandeId: c.commandeId })
    let [client] = await db.select().from(clients).where(sql`lower(${clients.email}) = ${c.email.toLowerCase()}`)
    let created = false
    if (!client) {
      // « Jean Dupont » devient prénom et nom ; un seul mot est pris comme nom
      const [first, ...rest] = c.nom.trim().split(/\s+/)
      const [prenom, nom] = rest.length ? [first!, rest.join(' ')] : [null, first!]
      ;[client] = await db.insert(clients).values({ type: 'particulier', origine: 'site', prenom, nom, email: c.email.toLowerCase(), telephone: c.telephone, adresse: c.adresse, codePostal: c.codePostal, ville: c.ville }).returning()
      created = true
      await audit(req, 'client.created', { targetType: 'client', targetId: client!.id, details: { nom: c.nom, type: 'particulier', origine: 'site' } })
    }
    if (client!.archivedAt) return reply.code(409).send({ error: 'Ce client est archivé : sortez-le des archives, puis recommencez.' })
    const body = orderBody.safeParse({ clientId: client!.id, lignes: c.configuration.lignes, livraison: c.configuration.livraison, notes: `Demande de devis du site : ${c.objet}${c.message ? `\n${c.message}` : ''}`.slice(0, 2000) })
    if (!body.success) return reply.code(409).send({ error: 'Les pièces de cette demande ne passent plus les contrôles actuels (catalogue ou limites modifiés) : saisissez la commande à la main.' })
    const placed = await placeOrder(req, body.data)
    if ('error' in placed) return reply.code(placed.status).send({ error: placed.error })
    await db.update(contactRequests).set({ commandeId: placed.id, traiteAt: new Date(), traitePar: req.user!.id }).where(eq(contactRequests.id, c.id))
    await audit(req, 'contact.order_created', { targetType: 'contact', targetId: c.id, details: { objet: c.objet, commande: placed.numero, clientCree: created } })
    return reply.code(201).send({ id: placed.id, numero: placed.numero })
  })

  // Suppression à la demande de la personne (RGPD)
  app.delete('/contacts/:id', async (req, reply) => {
    const c = await findContact((req.params as { id: string }).id, reply)
    if (!c) return
    await db.delete(contactRequests).where(eq(contactRequests.id, c.id))
    await audit(req, 'contact.deleted', { targetType: 'contact', targetId: c.id, details: { objet: c.objet } })
    return { ok: true }
  })
}


