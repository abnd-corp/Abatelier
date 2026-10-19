import type { FastifyInstance } from 'fastify'
import { and, desc, eq, inArray, like, lt, notLike, or, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/index.js'
import { auditLog, users } from '../db/schema.js'
import { requirePerm } from '../auth/plugin.js'
import { can } from '../auth/permissions.js'
import { describeDevice } from '../audit.js'

const query = z.object({
  userId: z.uuid().optional(),
  type: z.enum(['all', 'login', 'failures', 'accounts', 'catalog', 'documents', 'clients', 'orders']).default('all'),
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

const TYPE_FILTERS: Record<string, SQL | undefined> = {
  all: undefined,
  login: or(like(auditLog.action, 'login.%'), eq(auditLog.action, 'logout')),
  failures: inArray(auditLog.action, ['login.failed', 'login.locked', 'login.disabled', 'password.change_failed']),
  accounts: or(
    like(auditLog.action, 'user.%'),
    like(auditLog.action, 'employee.%'),
    like(auditLog.action, 'password.%'),
    like(auditLog.action, 'session.%'),
  ),
  catalog: like(auditLog.action, 'catalog.%'),
  documents: or(like(auditLog.action, 'documents.%'), like(auditLog.action, 'billing.%')),
  clients: like(auditLog.action, 'client.%'),
  orders: like(auditLog.action, 'order.%'),
}

export async function auditRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: requirePerm('audit.read') }, async (req, reply) => {
    const parsed = query.safeParse(req.query)
    if (!parsed.success) return reply.code(400).send({ error: 'Filtre invalide.' })
    const { userId, type, before, limit } = parsed.data

    const filters = [
      TYPE_FILTERS[type],
      userId ? eq(auditLog.userId, userId) : undefined,
      before ? lt(auditLog.id, before) : undefined,
      // La RH lit le journal, mais ne voit ni les devis, ni les factures
      can(req.user!.role, 'billing.manage') ? undefined : notLike(auditLog.action, 'billing.%'),
    ]
    const rows = await db
      .select({
        id: auditLog.id,
        at: auditLog.at,
        action: auditLog.action,
        identifiant: auditLog.identifiant,
        nom: users.nom,
        userId: auditLog.userId,
        targetType: auditLog.targetType,
        targetId: auditLog.targetId,
        ip: auditLog.ip,
        userAgent: auditLog.userAgent,
        details: auditLog.details,
      })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.userId))
      .where(and(...filters))
      .orderBy(desc(auditLog.id))
      .limit(limit + 1)

    const hasMore = rows.length > limit
    const page = rows.slice(0, limit)

    // Nom actuel des comptes visés (ex. « a désactivé Paul »)
    const targetIds = [...new Set(page.filter((r) => r.targetType === 'user' && r.targetId).map((r) => r.targetId!))]
    const targets = targetIds.length
      ? await db.select({ id: users.id, nom: users.nom }).from(users).where(inArray(users.id, targetIds))
      : []
    const targetName = new Map(targets.map((t) => [t.id, t.nom]))

    return {
      entries: page.map(({ userAgent, ...r }) => ({
        ...r,
        device: describeDevice(userAgent),
        targetName: r.targetId ? (targetName.get(r.targetId) ?? null) : null,
      })),
      nextBefore: hasMore ? page.at(-1)!.id : null,
    }
  })
}
