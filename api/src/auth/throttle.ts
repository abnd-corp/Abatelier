import { and, eq, gt, lt, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { loginAttempts } from '../db/schema.js'
import { env } from '../env.js'

export const MAX_FAILURES = 5
export const LOCK_MINUTES = 15
// Les échecs plus vieux que cette fenêtre ne comptent plus
const WINDOW_MINUTES = 15

/** Date de fin de blocage si l'identifiant est bloqué, sinon null. */
export async function getLock(identifiant: string) {
  const [row] = await db
    .select({ lockedUntil: loginAttempts.lockedUntil })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.identifiant, identifiant), gt(loginAttempts.lockedUntil, new Date())))
  return row?.lockedUntil ?? null
}

/** Compte un échec et bloque l'identifiant au 5e échec. */
export async function recordFailure(identifiant: string) {
  const expired = sql`login_attempts.last_failed_at < now() - make_interval(mins => ${WINDOW_MINUTES})`
  const next = sql`case when ${expired} then 1 else login_attempts.failures + 1 end`
  const { rows } = await db.execute<{ failures: number; locked_until: Date | null }>(sql`
    insert into login_attempts (identifiant, failures, last_failed_at)
    values (${identifiant}, 1, now())
    on conflict (identifiant) do update set
      failures = ${next},
      last_failed_at = now(),
      locked_until = case when ${next} >= ${MAX_FAILURES} then now() + make_interval(mins => ${LOCK_MINUTES}) else null end
    returning failures, locked_until`)
  const row = rows[0]!
  return { failures: Number(row.failures), lockedUntil: row.locked_until ? new Date(row.locked_until) : null }
}

export async function clearFailures(identifiant: string) {
  await db.delete(loginAttempts).where(eq(loginAttempts.identifiant, identifiant))
}

export async function deleteOldAttempts() {
  await db.delete(loginAttempts).where(lt(loginAttempts.lastFailedAt, new Date(Date.now() - 24 * 3600 * 1000)))
}

/** Délai avant de répondre après un échec : 1 s, 2 s, 4 s, puis 8 s (avec la base par défaut). */
export const failureDelayMs = (failures: number) => Math.min(env.LOGIN_DELAY_BASE_MS * 2 ** (failures - 1), env.LOGIN_DELAY_BASE_MS * 8)

export function lockedMessage(until: Date) {
  const min = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 60000))
  return `Trop d’essais pour cet identifiant. Réessayez dans ${min} minute${min > 1 ? 's' : ''}.`
}
