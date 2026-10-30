import { asc, gte } from 'drizzle-orm'
import { db } from './db/index.js'
import { closures } from './db/schema.js'
import { todayParis } from './departures.js'

/** Durée maximale d'une fermeture, en jours : au-delà, c'est sans doute une faute de frappe. */
export const CLOSURE_MAX_DAYS = 366

const dayMs = 86_400_000
const toMs = (d: string) => new Date(`${d}T12:00:00Z`).getTime()
/** Nombre de jours d'une fermeture, bornes comprises. */
export const spanDays = (debut: string, fin: string) => Math.round((toMs(fin) - toMs(debut)) / dayMs) + 1

/** Tous les jours (AAAA-MM-JJ) couverts par des fermetures qui ne sont pas passées. */
export async function loadClosedDays(): Promise<Set<string>> {
  const rows = await db.select({ debut: closures.debut, fin: closures.fin }).from(closures).where(gte(closures.fin, todayParis()))
  const out = new Set<string>()
  for (const r of rows) for (let t = toMs(r.debut); t <= toMs(r.fin); t += dayMs) out.add(new Date(t).toISOString().slice(0, 10))
  return out
}

/** Fermetures en cours ou à venir, de la plus proche à la plus lointaine. */
export const upcomingClosures = () =>
  db.select({ id: closures.id, debut: closures.debut, fin: closures.fin, motif: closures.motif }).from(closures).where(gte(closures.fin, todayParis())).orderBy(asc(closures.debut), asc(closures.fin))
