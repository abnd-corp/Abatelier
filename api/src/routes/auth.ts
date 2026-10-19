import type { FastifyInstance } from 'fastify'
import { and, desc, eq, ne } from 'drizzle-orm'
import { setTimeout as sleep } from 'node:timers/promises'
import { z } from 'zod'
import { db } from '../db/index.js'
import { sessions, users } from '../db/schema.js'
import { hashPassword, verifyPassword } from '../auth/password.js'
import { checkPasswordPolicy } from '../auth/password-policy.js'
import { permissionsOf } from '../auth/permissions.js'
import { requireAuth } from '../auth/plugin.js'
import {
  clearCookieOptions,
  cookieOptions,
  createSession,
  deleteSession,
  deleteUserSessions,
  SESSION_COOKIE,
  type SessionUser,
} from '../auth/session.js'
import { clearFailures, failureDelayMs, getLock, lockedMessage, MAX_FAILURES, recordFailure } from '../auth/throttle.js'
import { audit, describeDevice, userAgentOf } from '../audit.js'

export const publicUser = (u: SessionUser) => ({
  id: u.id,
  identifiant: u.identifiant,
  nom: u.nom,
  role: u.role,
  mustChangePassword: u.mustChangePassword,
  permissions: permissionsOf(u.role),
})

const loginBody = z.object({
  identifiant: z.string().trim().toLowerCase().min(1).max(100),
  password: z.string().min(1).max(200),
  remember: z.boolean().default(false),
})

const passwordBody = z.object({
  current: z.string().min(1).max(200),
  next: z.string().max(200),
})

export async function authRoutes(app: FastifyInstance) {
  app.post(
    '/login',
    // Limite par adresse IP, en plus du blocage par identifiant
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const parsed = loginBody.safeParse(req.body)
      if (!parsed.success) return reply.code(400).send({ error: 'Identifiant et mot de passe requis.' })
      const { identifiant, password, remember } = parsed.data

      const lockedUntil = await getLock(identifiant)
      if (lockedUntil) {
        await audit(req, 'login.locked', { actor: null, identifiant })
        return reply.code(429).send({ error: lockedMessage(lockedUntil) })
      }

      const [user] = await db.select().from(users).where(eq(users.identifiant, identifiant))
      const ok = await verifyPassword(user?.passwordHash, password)

      if (!ok || !user) {
        const { failures, lockedUntil } = await recordFailure(identifiant)
        await audit(req, 'login.failed', { actor: user ? { id: user.id, identifiant: user.identifiant } : null, identifiant })
        await sleep(failureDelayMs(failures))
        if (lockedUntil) return reply.code(429).send({ error: lockedMessage(lockedUntil) })
        const left = MAX_FAILURES - failures
        const warning = left <= 2 ? ` Encore ${left} essai${left > 1 ? 's' : ''} avant un blocage de 15 minutes.` : ''
        return reply.code(401).send({ error: `Identifiant ou mot de passe incorrect.${warning}` })
      }

      if (user.disabledAt) {
        await audit(req, 'login.disabled', { actor: { id: user.id, identifiant: user.identifiant } })
        return reply.code(403).send({ error: 'Ce compte est désactivé. Contactez l’administrateur.' })
      }

      await clearFailures(identifiant)
      const { token, expiresAt } = await createSession(user.id, { remember, ip: req.ip, userAgent: userAgentOf(req) })
      await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id))
      await audit(req, 'login.success', { actor: { id: user.id, identifiant: user.identifiant }, details: { remember } })
      reply.setCookie(SESSION_COOKIE, token, cookieOptions(remember, expiresAt))
      return { user: publicUser(user) }
    },
  )

  app.post('/logout', { config: { allowWhilePasswordChange: true } }, async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE]
    if (token) await deleteSession(token)
    if (req.user) await audit(req, 'logout')
    reply.clearCookie(SESSION_COOKIE, clearCookieOptions)
    return reply.code(204).send()
  })

  app.get('/me', { preHandler: requireAuth, config: { allowWhilePasswordChange: true } }, async (req) => ({
    user: publicUser(req.user!),
  }))

  app.post(
    '/password',
    { preHandler: requireAuth, config: { allowWhilePasswordChange: true, rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const parsed = passwordBody.safeParse(req.body)
      if (!parsed.success) return reply.code(400).send({ error: 'Mot de passe actuel et nouveau mot de passe requis.' })
      const { current, next } = parsed.data
      const me = req.user!

      const [row] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, me.id))
      if (!(await verifyPassword(row?.passwordHash, current))) {
        await audit(req, 'password.change_failed')
        return reply.code(400).send({ error: 'Le mot de passe actuel est incorrect.', field: 'current' })
      }
      if (next === current) return reply.code(400).send({ error: 'Le nouveau mot de passe doit être différent de l’actuel.', field: 'next' })
      const policyError = checkPasswordPolicy(next, { identifiant: me.identifiant, nom: me.nom })
      if (policyError) return reply.code(400).send({ error: policyError, field: 'next' })

      await db
        .update(users)
        .set({ passwordHash: await hashPassword(next), passwordChangedAt: new Date(), mustChangePassword: false })
        .where(eq(users.id, me.id))
      // Les autres appareils sont déconnectés : si quelqu'un connaissait l'ancien mot de passe, il perd l'accès
      const closed = await deleteUserSessions(me.id, req.authSession!.id)
      await audit(req, 'password.changed', { details: { autresSessionsFermees: closed } })
      return { user: publicUser({ ...me, mustChangePassword: false }), closedSessions: closed }
    },
  )

  app.get('/sessions', { preHandler: requireAuth, config: { allowWhilePasswordChange: true } }, async (req) => {
    const rows = await db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, req.user!.id))
      .orderBy(desc(sessions.lastSeenAt))
    return {
      sessions: rows
        .filter((s) => s.expiresAt > new Date())
        .map((s) => ({
          id: s.publicId,
          device: describeDevice(s.userAgent),
          ip: s.ip,
          remember: s.remember,
          createdAt: s.createdAt,
          lastSeenAt: s.lastSeenAt,
          current: s.id === req.authSession!.id,
        })),
    }
  })

  app.delete('/sessions/:id', { preHandler: requireAuth, config: { allowWhilePasswordChange: true } }, async (req, reply) => {
    const { id } = req.params as { id: string }
    if (!z.uuid().safeParse(id).success) return reply.code(404).send({ error: 'Session introuvable.' })
    const deleted = await db
      .delete(sessions)
      .where(and(eq(sessions.publicId, id), eq(sessions.userId, req.user!.id), ne(sessions.id, req.authSession!.id)))
      .returning({ ua: sessions.userAgent })
    if (!deleted.length) return reply.code(404).send({ error: 'Session introuvable.' })
    await audit(req, 'session.revoked', { details: { appareil: describeDevice(deleted[0]!.ua) } })
    return reply.code(204).send()
  })

  app.delete('/sessions', { preHandler: requireAuth, config: { allowWhilePasswordChange: true } }, async (req) => {
    const closed = await deleteUserSessions(req.user!.id, req.authSession!.id)
    if (closed) await audit(req, 'session.revoked_all', { details: { nombre: closed } })
    return { closedSessions: closed }
  })
}
