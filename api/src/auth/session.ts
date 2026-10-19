import { createHash, randomBytes } from 'node:crypto'
import { and, eq, gt, isNull, lt, ne } from 'drizzle-orm'
import { db } from '../db/index.js'
import { sessions, users, type User } from '../db/schema.js'
import { env } from '../env.js'

// Le préfixe __Host- interdit au navigateur d'accepter ce cookie s'il n'est pas Secure et posé par ce domaine exact
export const SESSION_COOKIE = env.COOKIE_SECURE ? '__Host-aps_session' : 'aps_session'

const REMEMBER_MS = env.SESSION_TTL_DAYS * 24 * 3600 * 1000
const IDLE_MS = env.IDLE_TIMEOUT_HOURS * 3600 * 1000
// On n'écrit la dernière activité en base qu'une fois par minute au plus
const TOUCH_EVERY_MS = 60 * 1000

const ttl = (remember: boolean) => (remember ? REMEMBER_MS : IDLE_MS)
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

export type SessionUser = Pick<User, 'id' | 'identifiant' | 'nom' | 'role' | 'mustChangePassword'>
export interface CurrentSession {
  id: string
  publicId: string
  remember: boolean
  expiresAt: Date
}

export async function createSession(userId: string, opts: { remember: boolean; ip?: string; userAgent?: string }) {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + ttl(opts.remember))
  await db.insert(sessions).values({ id: hashToken(token), userId, remember: opts.remember, ip: opts.ip, userAgent: opts.userAgent, expiresAt })
  return { token, expiresAt }
}

/** Renvoie l'utilisateur et la session, ou null si la session est expirée, inconnue, ou le compte désactivé. */
export async function validateSession(token: string) {
  const id = hashToken(token)
  const [row] = await db
    .select({
      publicId: sessions.publicId,
      remember: sessions.remember,
      lastSeenAt: sessions.lastSeenAt,
      expiresAt: sessions.expiresAt,
      user: { id: users.id, identifiant: users.identifiant, nom: users.nom, role: users.role, mustChangePassword: users.mustChangePassword },
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date()), isNull(users.disabledAt)))
  if (!row) return null

  let { expiresAt } = row
  let refreshed = false
  if (Date.now() - row.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
    expiresAt = new Date(Date.now() + ttl(row.remember))
    await db.update(sessions).set({ lastSeenAt: new Date(), expiresAt }).where(eq(sessions.id, id))
    refreshed = true
  }
  const session: CurrentSession = { id, publicId: row.publicId, remember: row.remember, expiresAt }
  return { user: row.user as SessionUser, session, refreshed }
}

export async function deleteSession(token: string) {
  await db.delete(sessions).where(eq(sessions.id, hashToken(token)))
}

/** Ferme toutes les sessions d'un utilisateur, sauf éventuellement celle en cours. Renvoie le nombre fermé. */
export async function deleteUserSessions(userId: string, exceptSessionId?: string) {
  const rows = await db
    .delete(sessions)
    .where(exceptSessionId ? and(eq(sessions.userId, userId), ne(sessions.id, exceptSessionId)) : eq(sessions.userId, userId))
    .returning({ id: sessions.id })
  return rows.length
}

export async function deleteExpiredSessions() {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()))
}

const baseCookie = { path: '/', httpOnly: true, sameSite: 'lax' as const, secure: env.COOKIE_SECURE }

/** Sans « Rester connecté », cookie de session : il disparaît aussi à la fermeture du navigateur. */
export const cookieOptions = (remember: boolean, expiresAt: Date) => (remember ? { ...baseCookie, expires: expiresAt } : baseCookie)
export const clearCookieOptions = baseCookie
