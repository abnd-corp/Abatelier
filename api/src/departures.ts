import { and, eq, isNotNull, isNull, lte } from 'drizzle-orm'
import { db } from './db/index.js'
import { employees, users } from './db/schema.js'
import { deleteUserSessions } from './auth/session.js'
import { auditSystem } from './audit.js'

/** Date du jour à Fraisses, au format AAAA-MM-JJ (le serveur peut être en UTC). */
export const todayParis = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date())

/**
 * Désactive les comptes des salariés dont la date de sortie est atteinte, et les déconnecte partout.
 * Appelé au démarrage, toutes les heures, et après chaque modification d'une fiche.
 */
export async function applyDepartures() {
  const due = await db
    .select({ userId: users.id, identifiant: users.identifiant, nom: users.nom, dateSortie: employees.dateSortie })
    .from(employees)
    .innerJoin(users, eq(users.id, employees.userId))
    .where(and(isNotNull(employees.dateSortie), lte(employees.dateSortie, todayParis()), isNull(users.disabledAt)))

  for (const u of due) {
    await db.update(users).set({ disabledAt: new Date() }).where(eq(users.id, u.userId))
    const closed = await deleteUserSessions(u.userId)
    await auditSystem('user.disabled', {
      targetType: 'user',
      targetId: u.userId,
      details: { identifiant: u.identifiant, nom: u.nom, raison: 'date de sortie', dateSortie: u.dateSortie, sessionsFermees: closed },
    })
  }
  return due.length
}
