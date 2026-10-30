import { createHash, randomBytes } from 'node:crypto'
import { and, eq, gt, isNull, lt, sql } from 'drizzle-orm'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import { db } from '../db/index.js'
import { clientAccounts, clientSessions, clients } from '../db/schema.js'
import { env } from '../env.js'

// Sessions de l'espace client : même principe que celles de l'équipe (jeton aléatoire dans un cookie HttpOnly, seule
// son empreinte est en base), mais dans d'autres tables et avec un autre cookie. Une session client n'ouvre aucune route de l'atelier.
export const CLIENT_COOKIE = env.COOKIE_SECURE ? '__Host-aps_client' : 'aps_client'

const REMEMBER_MS = env.SESSION_TTL_DAYS * 24 * 3600 * 1000
const IDLE_MS = env.IDLE_TIMEOUT_HOURS * 3600 * 1000
const TOUCH_EVERY_MS = 60 * 1000
const ttl = (remember: boolean) => (remember ? REMEMBER_MS : IDLE_MS)
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

export interface ClientAccount {
  id: string
  clientId: string
  email: string
  prenom: string | null
  nom: string | null
  telephone: string | null
  type: 'particulier' | 'professionnel'
  proVerifie: boolean
  /** Faux pour un espace créé avec Google, tant que le client n'a pas choisi de mot de passe */
  motDePasse: boolean
}

declare module 'fastify' {
  interface FastifyRequest {
    account: ClientAccount | null
    accountSessionId: string | null
  }
}

const baseCookie = { path: '/', httpOnly: true, sameSite: 'lax' as const, secure: env.COOKIE_SECURE }
export const clientCookieOptions = (remember: boolean, expiresAt: Date) => (remember ? { ...baseCookie, expires: expiresAt } : baseCookie)
export const clearClientCookieOptions = baseCookie

export async function createClientSession(accountId: string, opts: { remember: boolean; ip?: string; userAgent?: string }) {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + ttl(opts.remember))
  await db.insert(clientSessions).values({ id: hashToken(token), accountId, remember: opts.remember, ip: opts.ip, userAgent: opts.userAgent, expiresAt })
  return { token, expiresAt }
}

export async function deleteClientSession(token: string) {
  await db.delete(clientSessions).where(eq(clientSessions.id, hashToken(token)))
}

export async function deleteExpiredClientSessions() {
  await db.delete(clientSessions).where(lt(clientSessions.expiresAt, new Date()))
}

async function validateClientSession(token: string) {
  const id = hashToken(token)
  const [row] = await db
    .select({
      remember: clientSessions.remember,
      lastSeenAt: clientSessions.lastSeenAt,
      expiresAt: clientSessions.expiresAt,
      account: {
        id: clientAccounts.id,
        clientId: clients.id,
        email: clients.email,
        prenom: clients.prenom,
        nom: clients.nom,
        telephone: clients.telephone,
        type: clients.type,
        proVerifie: clients.proVerifie,
        motDePasse: sql<boolean>`${clientAccounts.passwordHash} is not null`,
      },
    })
    .from(clientSessions)
    .innerJoin(clientAccounts, eq(clientAccounts.id, clientSessions.accountId))
    .innerJoin(clients, eq(clients.id, clientAccounts.clientId))
    // Compte désactivé ou fiche archivée : plus d'accès
    .where(and(eq(clientSessions.id, id), gt(clientSessions.expiresAt, new Date()), isNull(clientAccounts.disabledAt), isNull(clients.archivedAt)))
  if (!row) return null
  let { expiresAt } = row
  let refreshed = false
  if (Date.now() - row.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
    expiresAt = new Date(Date.now() + ttl(row.remember))
    await db.update(clientSessions).set({ lastSeenAt: new Date(), expiresAt }).where(eq(clientSessions.id, id))
    refreshed = true
  }
  return { account: row.account as ClientAccount, id, remember: row.remember, expiresAt, refreshed }
}

/** Lit le cookie de l'espace client et remplit request.account. */
export const clientAuthPlugin = fp(async (app: FastifyInstance) => {
  app.decorateRequest('account', null)
  app.decorateRequest('accountSessionId', null)
  app.addHook('onRequest', async (req, reply) => {
    const token = req.cookies[CLIENT_COOKIE]
    if (!token) return
    const result = await validateClientSession(token)
    if (!result) {
      reply.clearCookie(CLIENT_COOKIE, clearClientCookieOptions)
      return
    }
    req.account = result.account
    req.accountSessionId = result.id
    if (result.refreshed && result.remember) reply.setCookie(CLIENT_COOKIE, token, clientCookieOptions(true, result.expiresAt))
  })
})

/** À mettre en preHandler sur toute route de l'espace client réservée aux clients connectés. */
export async function requireAccount(req: FastifyRequest, reply: FastifyReply) {
  if (!req.account) return reply.code(401).send({ error: 'Votre session a expiré. Reconnectez-vous.' })
}
