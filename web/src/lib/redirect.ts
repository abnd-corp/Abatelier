/**
 * Page où revenir après la connexion. Seuls les chemins internes sont acceptés : « //site.com »
 * ou « https://… » permettraient d'envoyer l'utilisateur vers un faux site après sa connexion.
 */
export function safeRedirect(value: unknown): string {
  if (typeof value !== 'string') return '/'
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/'
  return value
}
