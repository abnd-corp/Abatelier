const dateTimeFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const rtf = new Intl.RelativeTimeFormat('fr-FR', { numeric: 'auto' })

export const dateTime = (d: string | Date) => dateTimeFmt.format(new Date(d))

/** « à l'instant », « il y a 5 minutes », « hier »… puis la date au-delà d'une semaine. */
export function relative(d: string | Date | null) {
  if (!d) return 'Jamais'
  const diff = (new Date(d).getTime() - Date.now()) / 1000
  const abs = Math.abs(diff)
  if (abs < 60) return 'à l’instant'
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour')
  if (abs < 7 * 86400) return rtf.format(Math.round(diff / 86400), 'day')
  return dateTime(d)
}
