import type { FastifyRequest } from 'fastify'
import { lt } from 'drizzle-orm'
import { db } from './db/index.js'
import { auditLog } from './db/schema.js'

export const userAgentOf = (req: FastifyRequest) => req.headers['user-agent']?.slice(0, 300)

interface AuditOptions {
  // Par défaut l'utilisateur connecté ; null pour une action anonyme (échec de connexion)
  actor?: { id: string; identifiant: string } | null
  // Identifiant à noter quand il n'y a pas d'acteur (identifiant tapé à la connexion)
  identifiant?: string
  targetType?: string
  targetId?: string
  details?: Record<string, unknown>
}

/** Ajoute une ligne au journal d'activité. Une erreur d'écriture est journalisée sans faire échouer la requête. */
export async function audit(req: FastifyRequest, action: string, opts: AuditOptions = {}) {
  const actor = opts.actor !== undefined ? opts.actor : req.user
  try {
    await db.insert(auditLog).values({
      userId: actor?.id ?? null,
      identifiant: actor?.identifiant ?? opts.identifiant ?? null,
      action,
      targetType: opts.targetType,
      targetId: opts.targetId,
      ip: req.ip,
      userAgent: userAgentOf(req),
      details: opts.details,
    })
  } catch (e) {
    req.log.error(e, `Écriture du journal impossible (${action})`)
  }
}

/** Action faite automatiquement par l'application (pas d'utilisateur ni d'IP), par exemple une sortie de salarié. */
export async function auditSystem(action: string, opts: Pick<AuditOptions, 'targetType' | 'targetId' | 'details'> = {}) {
  await db.insert(auditLog).values({ action, targetType: opts.targetType, targetId: opts.targetId, details: opts.details })
}

/** Durée de conservation du journal (RGPD : données de connexion). */
const RETENTION_DAYS = 365

export async function deleteOldAuditEntries() {
  await db.delete(auditLog).where(lt(auditLog.at, new Date(Date.now() - RETENTION_DAYS * 24 * 3600 * 1000)))
}

/** « Firefox sur Linux », « Chrome sur Android »… */
export function describeDevice(ua?: string | null) {
  if (!ua) return 'Appareil inconnu'
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : /^curl\//.test(ua)
              ? 'curl'
              : 'Navigateur'
  const os = /iPhone|iPad/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS X/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : ''
  return os ? `${browser} sur ${os}` : browser
}
