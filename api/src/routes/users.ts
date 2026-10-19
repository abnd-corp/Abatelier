import type { FastifyInstance, FastifyReply } from 'fastify'
import { and, asc, count, eq, gt, isNull, ne } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/index.js'
import { ROLES, sessions, users } from '../db/schema.js'
import { hashPassword } from '../auth/password.js'
import { generateTempPassword } from '../auth/password-policy.js'
import { requirePerm } from '../auth/plugin.js'
import { deleteUserSessions } from '../auth/session.js'
import { audit } from '../audit.js'

const identifiantSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,40}$/, 'L’identifiant fait 3 à 40 caractères : lettres sans accent, chiffres, point, tiret ou tiret bas.')
const nomSchema = z.string().trim().min(1, 'Le nom est requis.').max(80)

const createBody = z.object({ identifiant: identifiantSchema, nom: nomSchema, role: z.enum(ROLES) })
const updateBody = z.object({ nom: nomSchema.optional(), role: z.enum(ROLES).optional() })

const firstError = (e: z.ZodError) => e.issues[0]?.message ?? 'Données invalides.'

async function findUser(id: string, reply: FastifyReply) {
  if (!z.uuid().safeParse(id).success) {
    reply.code(404).send({ error: 'Utilisateur introuvable.' })
    return null
  }
  const [u] = await db.select().from(users).where(eq(users.id, id))
  if (!u) reply.code(404).send({ error: 'Utilisateur introuvable.' })
  return u ?? null
}

/** Nombre d'admins actifs autres que userId : on refuse de retirer le dernier. */
async function otherActiveAdmins(userId: string) {
  const [row] = await db
    .select({ n: count() })
    .from(users)
    .where(and(eq(users.role, 'admin'), isNull(users.disabledAt), ne(users.id, userId)))
  return row?.n ?? 0
}

export async function userRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requirePerm('users.manage'))

  app.get('/', async () => {
    const active = db
      .select({ userId: sessions.userId, n: count().as('n') })
      .from(sessions)
      .where(gt(sessions.expiresAt, new Date()))
      .groupBy(sessions.userId)
      .as('active')
    const rows = await db
      .select({
        id: users.id,
        identifiant: users.identifiant,
        nom: users.nom,
        role: users.role,
        mustChangePassword: users.mustChangePassword,
        disabledAt: users.disabledAt,
        createdAt: users.createdAt,
        lastLoginAt: users.lastLoginAt,
        activeSessions: active.n,
      })
      .from(users)
      .leftJoin(active, eq(active.userId, users.id))
      .orderBy(asc(users.disabledAt), asc(users.nom))
    return { users: rows.map((r) => ({ ...r, activeSessions: Number(r.activeSessions ?? 0) })) }
  })

  app.post('/', async (req, reply) => {
    const parsed = createBody.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: firstError(parsed.error) })
    const { identifiant, nom, role } = parsed.data

    const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.identifiant, identifiant))
    if (exists) return reply.code(409).send({ error: `L’identifiant « ${identifiant} » est déjà utilisé.` })

    const tempPassword = generateTempPassword()
    const [created] = await db
      .insert(users)
      .values({ identifiant, nom, role, passwordHash: await hashPassword(tempPassword), mustChangePassword: true })
      .returning({ id: users.id })
    await audit(req, 'user.created', { targetType: 'user', targetId: created!.id, details: { identifiant, nom, role } })
    // Le mot de passe temporaire n'est renvoyé qu'ici, une seule fois
    return reply.code(201).send({ id: created!.id, tempPassword })
  })

  app.patch('/:id', async (req, reply) => {
    const u = await findUser((req.params as { id: string }).id, reply)
    if (!u) return
    const parsed = updateBody.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: firstError(parsed.error) })
    const changes = parsed.data

    if (changes.role && changes.role !== 'admin' && u.role === 'admin' && !u.disabledAt && (await otherActiveAdmins(u.id)) === 0) {
      return reply.code(400).send({ error: 'Il doit rester au moins un administrateur actif.' })
    }
    const diff: Record<string, { avant: string; apres: string }> = {}
    if (changes.nom && changes.nom !== u.nom) diff.nom = { avant: u.nom, apres: changes.nom }
    if (changes.role && changes.role !== u.role) diff.role = { avant: u.role, apres: changes.role }
    if (!Object.keys(diff).length) return { ok: true }

    await db.update(users).set(changes).where(eq(users.id, u.id))
    await audit(req, 'user.updated', { targetType: 'user', targetId: u.id, details: { identifiant: u.identifiant, ...diff } })
    return { ok: true }
  })

  app.post('/:id/disable', async (req, reply) => {
    const u = await findUser((req.params as { id: string }).id, reply)
    if (!u) return
    if (u.id === req.user!.id) return reply.code(400).send({ error: 'Vous ne pouvez pas désactiver votre propre compte.' })
    if (u.disabledAt) return { ok: true }
    if (u.role === 'admin' && (await otherActiveAdmins(u.id)) === 0) {
      return reply.code(400).send({ error: 'Il doit rester au moins un administrateur actif.' })
    }
    await db.update(users).set({ disabledAt: new Date() }).where(eq(users.id, u.id))
    const closed = await deleteUserSessions(u.id)
    await audit(req, 'user.disabled', { targetType: 'user', targetId: u.id, details: { identifiant: u.identifiant, sessionsFermees: closed } })
    return { ok: true }
  })

  app.post('/:id/enable', async (req, reply) => {
    const u = await findUser((req.params as { id: string }).id, reply)
    if (!u) return
    if (!u.disabledAt) return { ok: true }
    await db.update(users).set({ disabledAt: null }).where(eq(users.id, u.id))
    await audit(req, 'user.enabled', { targetType: 'user', targetId: u.id, details: { identifiant: u.identifiant } })
    return { ok: true }
  })

  app.post('/:id/reset-password', async (req, reply) => {
    const u = await findUser((req.params as { id: string }).id, reply)
    if (!u) return
    if (u.id === req.user!.id) return reply.code(400).send({ error: 'Pour votre propre compte, utilisez « Mon compte ».' })
    const tempPassword = generateTempPassword()
    await db
      .update(users)
      .set({ passwordHash: await hashPassword(tempPassword), mustChangePassword: true, passwordChangedAt: new Date() })
      .where(eq(users.id, u.id))
    const closed = await deleteUserSessions(u.id)
    await audit(req, 'user.password_reset', { targetType: 'user', targetId: u.id, details: { identifiant: u.identifiant, sessionsFermees: closed } })
    return { tempPassword }
  })
}
