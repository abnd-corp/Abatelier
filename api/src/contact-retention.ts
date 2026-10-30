import { and, isNull, lt } from 'drizzle-orm'
import { db } from './db/index.js'
import { contactRequests } from './db/schema.js'
import { auditSystem } from './audit.js'

/** Durée de conservation d'une demande de contact restée sans suite (annoncée dans la politique de confidentialité). */
export const CONTACT_RETENTION_MONTHS = 12

/** Supprime les demandes de contact de plus de 12 mois qui n'ont pas donné de commande (RGPD : minimisation). */
export async function deleteOldContactRequests(now = new Date()) {
  const limit = new Date(now)
  limit.setMonth(limit.getMonth() - CONTACT_RETENTION_MONTHS)
  const gone = await db
    .delete(contactRequests)
    .where(and(lt(contactRequests.createdAt, limit), isNull(contactRequests.commandeId)))
    .returning({ id: contactRequests.id })
  if (gone.length) await auditSystem('contact.purged', { targetType: 'contact', details: { nombre: gone.length, mois: CONTACT_RETENTION_MONTHS } })
  return gone.length
}
