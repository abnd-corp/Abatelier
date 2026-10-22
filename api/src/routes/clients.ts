import type { FastifyInstance, FastifyReply } from 'fastify'
import { and, asc, count, desc, eq, ilike, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/index.js'
import { auditLog, clients, clientSites, CLIENT_TYPES, orders, users, type Client } from '../db/schema.js'
import { requirePerm } from '../auth/plugin.js'
import { can } from '../auth/permissions.js'
import { audit, describeDevice } from '../audit.js'
import { digits, formatSiret, invalid, isUniqueViolation, luhn } from '../validation.js'

// Champ texte facultatif : vide ou espaces → null
const optText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} : ${max} caractères maximum.`)
    .nullish()
    .transform((v) => (v ? v : null))

export const clientFields = {
  raisonSociale: optText(120, 'Raison sociale'),
  siret: optText(20, 'SIRET')
    .transform((v) => (v ? digits(v) : null))
    .refine((v) => v === null || v.length === 14, 'SIRET : 14 chiffres attendus.')
    .refine((v) => v === null || luhn(v), 'SIRET invalide : vérifiez les chiffres.')
    .transform((v) => (v ? formatSiret(v) : null)),
  tvaIntra: optText(20, 'TVA intracommunautaire')
    .transform((v) => (v ? v.replace(/\s/g, '').toUpperCase() : null))
    .refine((v) => v === null || /^FR[0-9A-Z]{2}\d{9}$/.test(v), 'TVA intracommunautaire : format FR suivi de 11 caractères (ex. FR12345678901).'),
  prenom: optText(60, 'Prénom'),
  nom: optText(60, 'Nom'),
  email: optText(120, 'E-mail')
    .transform((v) => (v ? v.toLowerCase() : null))
    .refine((v) => v === null || z.email().safeParse(v).success, 'Adresse e-mail invalide.'),
  telephone: optText(30, 'Téléphone').refine((v) => v === null || /^\+?[0-9 .()-]{6,25}$/.test(v), 'Numéro de téléphone invalide.'),
  adresse: optText(200, 'Adresse'),
  codePostal: optText(10, 'Code postal').refine((v) => v === null || /^\d{5}$/.test(v), 'Code postal : 5 chiffres.'),
  ville: optText(80, 'Ville'),
  notes: optText(5000, 'Notes'),
}

type Fields = { [K in keyof typeof clientFields]?: z.infer<(typeof clientFields)[K]> } & { type?: Client['type'] }

/** Un particulier n'a ni raison sociale, ni SIRET, ni TVA. */
export const normalize = <T extends Fields>(c: T): T => (c.type === 'particulier' ? { ...c, raisonSociale: null, siret: null, tvaIntra: null } : c)

/** Identité minimale : la raison sociale d'un professionnel, le nom d'un particulier. */
export function identityError(c: Fields) {
  if (c.type === 'professionnel' && !c.raisonSociale) return { error: 'La raison sociale est requise.', field: 'raisonSociale' }
  if (c.type === 'particulier' && !c.nom) return { error: 'Le nom est requis.', field: 'nom' }
  return null
}

export const type = z.enum(CLIENT_TYPES, { error: 'Type de client inconnu.' })
// Une fiche créée à la main ; « site » est réservé aux commandes passées sur le site
const createBody = z.object({ type, origine: z.enum(['atelier', 'telephone', 'email'], { error: 'Origine inconnue.' }).default('atelier'), ...clientFields })
// proVerifie : l'atelier valide (ou retire) le statut professionnel d'un client inscrit sur le site
const updateBody = z.object({ type, ...clientFields, proVerifie: z.boolean({ error: 'Statut professionnel : oui ou non.' }) }).partial()

const siteBody = z.object({
  libelle: z.string().trim().min(1, 'Donnez un nom au chantier.').max(80, 'Nom du chantier : 80 caractères maximum.'),
  adresse: z.string().trim().min(1, 'L’adresse est requise.').max(200, 'Adresse : 200 caractères maximum.'),
  codePostal: z.string().trim().regex(/^\d{5}$/, 'Code postal : 5 chiffres.'),
  ville: z.string().trim().min(1, 'La ville est requise.').max(80, 'Ville : 80 caractères maximum.'),
})

const FILTRES = ['tous', 'particulier', 'professionnel', 'archives'] as const
const listQuery = z.object({
  filtre: z.enum(FILTRES).default('tous'),
  q: z.string().trim().max(80).optional(),
})

/** Nom affiché : la raison sociale d'un professionnel, « Prénom Nom » d'un particulier. */
export const clientName = (c: Pick<Client, 'type' | 'raisonSociale' | 'prenom' | 'nom'>) =>
  c.type === 'professionnel' ? (c.raisonSociale ?? '') : [c.prenom, c.nom].filter(Boolean).join(' ')

// Libellés des champs pour le journal ; le contenu des notes n'y est jamais copié
const LABELS: Record<string, string> = {
  type: 'type',
  proVerifie: 'statut professionnel',
  raisonSociale: 'raison sociale',
  siret: 'SIRET',
  tvaIntra: 'TVA intracommunautaire',
  prenom: 'prénom',
  nom: 'nom',
  email: 'e-mail',
  telephone: 'téléphone',
  adresse: 'adresse',
  codePostal: 'code postal',
  ville: 'ville',
  notes: 'notes',
}

const EMAIL_TAKEN = 'Un client existe déjà avec cette adresse e-mail.'

/** Client qui a déjà cette adresse e-mail (pour proposer d'ouvrir sa fiche). */
async function emailOwner(email: string | null | undefined) {
  if (!email) return null
  const [c] = await db.select({ id: clients.id }).from(clients).where(sql`lower(${clients.email}) = ${email.toLowerCase()}`)
  return c?.id ?? null
}

async function findClient(id: string, reply: FastifyReply) {
  if (!z.uuid().safeParse(id).success) {
    reply.code(404).send({ error: 'Client introuvable.' })
    return null
  }
  const [c] = await db.select().from(clients).where(eq(clients.id, id))
  if (!c) reply.code(404).send({ error: 'Client introuvable.' })
  return c ?? null
}

async function findSite(clientId: string, siteId: string, reply: FastifyReply) {
  const [s] = z.uuid().safeParse(siteId).success
    ? await db
        .select()
        .from(clientSites)
        .where(and(eq(clientSites.id, siteId), eq(clientSites.clientId, clientId)))
    : []
  if (!s) reply.code(404).send({ error: 'Adresse de chantier introuvable.' })
  return s ?? null
}

export async function clientRoutes(app: FastifyInstance) {
  const read = { preHandler: requirePerm('clients.read') }
  const manage = { preHandler: requirePerm('clients.manage') }

  app.get('/', read, async (req, reply) => {
    const parsed = listQuery.safeParse(req.query)
    if (!parsed.success) return reply.code(400).send({ error: 'Filtre invalide.' })
    const { filtre, q } = parsed.data

    const filters: (SQL | undefined)[] = [filtre === 'archives' ? isNotNull(clients.archivedAt) : isNull(clients.archivedAt)]
    if (filtre === 'particulier' || filtre === 'professionnel') filters.push(eq(clients.type, filtre))
    if (q) {
      const like = `%${q.replace(/[%_\\]/g, '\\$&')}%`
      filters.push(
        or(
          ilike(clients.raisonSociale, like),
          ilike(clients.nom, like),
          ilike(sql`coalesce(${clients.prenom}, '') || ' ' || coalesce(${clients.nom}, '')`, like),
          ilike(clients.email, like),
          ilike(clients.ville, like),
          ilike(clients.codePostal, like),
          // Téléphone tapé avec ou sans espaces
          ...(digits(q).length >= 4 ? [sql`regexp_replace(coalesce(${clients.telephone}, ''), '\\D', '', 'g') like ${`%${digits(q)}%`}`] : []),
        ),
      )
    }

    const rows = await db
      .select({
        id: clients.id,
        type: clients.type,
        raisonSociale: clients.raisonSociale,
        prenom: clients.prenom,
        nom: clients.nom,
        email: clients.email,
        telephone: clients.telephone,
        codePostal: clients.codePostal,
        ville: clients.ville,
        origine: clients.origine,
        archivedAt: clients.archivedAt,
        createdAt: clients.createdAt,
      })
      .from(clients)
      .where(and(...filters))
      .orderBy(asc(sql`lower(coalesce(${clients.raisonSociale}, ${clients.nom}))`), asc(clients.prenom))
      .limit(500)

    const [totals] = await db
      .select({
        particulier: count(sql`case when ${clients.archivedAt} is null and ${clients.type} = 'particulier' then 1 end`),
        professionnel: count(sql`case when ${clients.archivedAt} is null and ${clients.type} = 'professionnel' then 1 end`),
        archives: count(sql`case when ${clients.archivedAt} is not null then 1 end`),
      })
      .from(clients)

    return {
      clients: rows,
      totals: { particulier: Number(totals?.particulier ?? 0), professionnel: Number(totals?.professionnel ?? 0), archives: Number(totals?.archives ?? 0) },
    }
  })

  app.post('/', manage, async (req, reply) => {
    const parsed = createBody.safeParse(req.body)
    if (!parsed.success) return invalid(reply, parsed.error)
    const data = normalize(parsed.data)
    const bad = identityError(data)
    if (bad) return reply.code(400).send(bad)
    try {
      // Une fiche créée par l'atelier est reconnue tout de suite comme professionnelle
      const [c] = await db.insert(clients).values({ ...data, proVerifie: data.type === 'professionnel' }).returning()
      await audit(req, 'client.created', { targetType: 'client', targetId: c!.id, details: { nom: clientName(c!), type: c!.type, origine: c!.origine } })
      return reply.code(201).send({ id: c!.id })
    } catch (e) {
      if (isUniqueViolation(e)) return reply.code(409).send({ error: EMAIL_TAKEN, field: 'email', clientId: await emailOwner(data.email) })
      throw e
    }
  })

  app.get('/:id', read, async (req, reply) => {
    const c = await findClient((req.params as { id: string }).id, reply)
    if (!c) return
    const sites = await db.select().from(clientSites).where(eq(clientSites.clientId, c.id)).orderBy(asc(clientSites.createdAt))
    const rows = await db
      .select({
        id: auditLog.id,
        at: auditLog.at,
        action: auditLog.action,
        identifiant: auditLog.identifiant,
        userId: auditLog.userId,
        nom: users.nom,
        targetType: auditLog.targetType,
        targetId: auditLog.targetId,
        ip: auditLog.ip,
        userAgent: auditLog.userAgent,
        details: auditLog.details,
      })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.userId))
      .where(and(eq(auditLog.targetType, 'client'), eq(auditLog.targetId, c.id)))
      .orderBy(desc(auditLog.id))
      .limit(15)
    const activity = rows.map(({ userAgent, ...r }) => ({ ...r, device: describeDevice(userAgent), targetName: clientName(c) }))
    // Commandes et total dépensé : pour qui gère les commandes (pas la RH)
    let commandes = null
    if (can(req.user!.role, 'orders.manage')) {
      const list = await db
        .select({ id: orders.id, numero: orders.numero, statut: orders.statut, ttc: orders.ttc, createdAt: orders.createdAt })
        .from(orders)
        .where(eq(orders.clientId, c.id))
        .orderBy(desc(orders.createdAt))
      const totalTtc = Math.round(list.filter((o) => o.statut !== 'annulee').reduce((s, o) => s + o.ttc, 0) * 100) / 100
      commandes = { list, totalTtc }
    }
    return { client: c, sites: sites.map(({ clientId: _c, ...s }) => s), activity, commandes }
  })

  app.patch('/:id', manage, async (req, reply) => {
    const c = await findClient((req.params as { id: string }).id, reply)
    if (!c) return
    const parsed = updateBody.safeParse(req.body)
    if (!parsed.success) return invalid(reply, parsed.error)
    const given = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined)) as Fields
    const merged = normalize({ ...c, ...given }) as typeof c
    const bad = identityError(merged)
    if (bad) return reply.code(400).send(bad)
    // Statut professionnel : l'atelier qui passe une fiche en « professionnel » le reconnaît d'office ; un particulier ne l'est jamais
    const asked = (given as { proVerifie?: boolean }).proVerifie
    merged.proVerifie = merged.type !== 'professionnel' ? false : asked !== undefined ? asked : c.type !== 'professionnel' ? true : c.proVerifie

    const keys = Object.keys(LABELS) as (keyof typeof LABELS & keyof Client)[]
    const changed = keys.filter((k) => merged[k] !== c[k])
    if (!changed.length) return { ok: true }
    const changes = Object.fromEntries(changed.map((k) => [k, merged[k]]))
    try {
      await db
        .update(clients)
        .set({ ...changes, updatedAt: new Date() })
        .where(eq(clients.id, c.id))
    } catch (e) {
      if (isUniqueViolation(e)) return reply.code(409).send({ error: EMAIL_TAKEN, field: 'email', clientId: await emailOwner(merged.email) })
      throw e
    }
    await audit(req, 'client.updated', { targetType: 'client', targetId: c.id, details: { nom: clientName(merged), champs: changed.map((k) => LABELS[k]) } })
    return { ok: true }
  })

  // Archiver : la fiche sort de la liste, mais reste consultable avec son historique
  for (const [path, archived] of [
    ['archive', true],
    ['unarchive', false],
  ] as const) {
    app.post(`/:id/${path}`, manage, async (req, reply) => {
      const c = await findClient((req.params as { id: string }).id, reply)
      if (!c) return
      if (!!c.archivedAt === archived) return { ok: true }
      await db
        .update(clients)
        .set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
        .where(eq(clients.id, c.id))
      await audit(req, archived ? 'client.archived' : 'client.unarchived', { targetType: 'client', targetId: c.id, details: { nom: clientName(c) } })
      return { ok: true }
    })
  }

  // --- Adresses de chantier ---

  app.post('/:id/sites', manage, async (req, reply) => {
    const c = await findClient((req.params as { id: string }).id, reply)
    if (!c) return
    const parsed = siteBody.safeParse(req.body)
    if (!parsed.success) return invalid(reply, parsed.error)
    const [s] = await db
      .insert(clientSites)
      .values({ ...parsed.data, clientId: c.id })
      .returning()
    await audit(req, 'client.site_added', { targetType: 'client', targetId: c.id, details: { nom: clientName(c), chantier: s!.libelle, ville: s!.ville } })
    return reply.code(201).send({ id: s!.id })
  })

  app.patch('/:id/sites/:siteId', manage, async (req, reply) => {
    const params = req.params as { id: string; siteId: string }
    const c = await findClient(params.id, reply)
    if (!c) return
    const s = await findSite(c.id, params.siteId, reply)
    if (!s) return
    const parsed = siteBody.partial().safeParse(req.body)
    if (!parsed.success) return invalid(reply, parsed.error)
    const changed = (Object.keys(parsed.data) as (keyof typeof parsed.data)[]).filter((k) => parsed.data[k] !== undefined && parsed.data[k] !== s[k])
    if (!changed.length) return { ok: true }
    await db
      .update(clientSites)
      .set(Object.fromEntries(changed.map((k) => [k, parsed.data[k]])))
      .where(eq(clientSites.id, s.id))
    await audit(req, 'client.site_updated', { targetType: 'client', targetId: c.id, details: { nom: clientName(c), chantier: parsed.data.libelle ?? s.libelle } })
    return { ok: true }
  })

  app.delete('/:id/sites/:siteId', manage, async (req, reply) => {
    const params = req.params as { id: string; siteId: string }
    const c = await findClient(params.id, reply)
    if (!c) return
    const s = await findSite(c.id, params.siteId, reply)
    if (!s) return
    await db.delete(clientSites).where(eq(clientSites.id, s.id))
    await audit(req, 'client.site_removed', { targetType: 'client', targetId: c.id, details: { nom: clientName(c), chantier: s.libelle, ville: s.ville } })
    return { ok: true }
  })
}
