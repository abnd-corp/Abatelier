import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import { clearCookieOptions, cookieOptions, SESSION_COOKIE, validateSession, type CurrentSession, type SessionUser } from './session.js'
import { can, type Permission } from './permissions.js'

declare module 'fastify' {
  interface FastifyRequest {
    user: SessionUser | null
    authSession: CurrentSession | null
  }
  interface FastifyContextConfig {
    // Route accessible même si l'utilisateur doit d'abord changer son mot de passe
    allowWhilePasswordChange?: boolean
    // Notification d'un prestataire extérieur (signée) : exemptée du contrôle d'origine, jamais d'une session
    webhook?: boolean
  }
}

/** Lit le cookie de session sur chaque requête et remplit request.user. */
export const authPlugin = fp(async (app: FastifyInstance) => {
  app.decorateRequest('user', null)
  app.decorateRequest('authSession', null)

  app.addHook('onRequest', async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE]
    if (!token) return
    const result = await validateSession(token)
    if (!result) {
      reply.clearCookie(SESSION_COOKIE, clearCookieOptions)
      return
    }
    req.user = result.user
    req.authSession = result.session
    if (result.refreshed && result.session.remember) {
      reply.setCookie(SESSION_COOKIE, token, cookieOptions(true, result.session.expiresAt))
    }
  })
})

/** À mettre en preHandler sur toute route réservée aux utilisateurs connectés. */
export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  if (!req.user) return reply.code(401).send({ error: 'Votre session a expiré. Reconnectez-vous.' })
  if (req.user.mustChangePassword && !req.routeOptions.config.allowWhilePasswordChange) {
    return reply.code(403).send({ error: 'Vous devez d’abord changer votre mot de passe.', code: 'PASSWORD_CHANGE_REQUIRED' })
  }
}

/** Connexion obligatoire + permission donnée. */
export function requirePerm(perm: Permission) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    await requireAuth(req, reply)
    if (reply.sent) return
    if (!can(req.user!, perm)) return reply.code(403).send({ error: 'Vous n’avez pas accès à cette fonction.' })
  }
}

/** Connexion obligatoire + au moins une des permissions données. */
export function requireAnyPerm(...perms: Permission[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    await requireAuth(req, reply)
    if (reply.sent) return
    if (!perms.some((p) => can(req.user!, p))) return reply.code(403).send({ error: 'Vous n’avez pas accès à cette fonction.' })
  }
}
