import { and, eq, inArray, isNotNull, isNull, lte } from 'drizzle-orm'
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
    .select({ userId: users.id, dateSortie: employees.dateSortie })
    .from(employees)
    .innerJoin(users, eq(users.id, employees.userId))
    .where(and(isNotNull(employees.dateSortie), lte(employees.dateSortie, todayParis()), isNull(users.disabledAt)))
  if (!due.length) return 0

  // Mise à jour conditionnelle : si deux appels tournent en même temps, un seul désactive chaque compte
  // et l'écrit au journal (le second ne trouve plus de compte actif).
  const disabled = await db
    .update(users)
    .set({ disabledAt: new Date() })
    .where(
      and(
        inArray(
          users.id,
          due.map((d) => d.userId),
        ),
        isNull(users.disabledAt),
      ),
    )
    .returning({ id: users.id, identifiant: users.identifiant, nom: users.nom })

  for (const u of disabled) {
    const closed = await deleteUserSessions(u.id)
    await auditSystem('user.disabled', {
      targetType: 'user',
      targetId: u.id,
      details: {
        identifiant: u.identifiant,
        nom: u.nom,
        raison: 'date de sortie',
        dateSortie: due.find((d) => d.userId === u.id)?.dateSortie,
        sessionsFermees: closed,
      },
    })
  }
  return disabled.length
}
