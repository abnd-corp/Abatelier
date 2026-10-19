export type ClientType = 'particulier' | 'professionnel'
export type ClientOrigine = 'site' | 'atelier' | 'telephone' | 'email'

export const TYPE_LABELS: Record<ClientType, string> = { particulier: 'Particulier', professionnel: 'Professionnel' }
export const ORIGINE_LABELS: Record<ClientOrigine, string> = { site: 'Site internet', atelier: 'À l’atelier', telephone: 'Par téléphone', email: 'Par e-mail' }
// Origines possibles pour une fiche créée à la main
export const MANUAL_ORIGINES = ['atelier', 'telephone', 'email'] as const

export interface ClientFields {
  type: ClientType
  raisonSociale: string | null
  siret: string | null
  tvaIntra: string | null
  prenom: string | null
  nom: string | null
  email: string | null
  telephone: string | null
  adresse: string | null
  codePostal: string | null
  ville: string | null
  notes: string | null
}

export interface ClientSummary extends Pick<ClientFields, 'type' | 'raisonSociale' | 'prenom' | 'nom' | 'email' | 'telephone' | 'codePostal' | 'ville'> {
  id: string
  origine: ClientOrigine
  archivedAt: string | null
  createdAt: string
}

export interface Client extends ClientFields {
  id: string
  origine: ClientOrigine
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ClientSite {
  id: string
  libelle: string
  adresse: string
  codePostal: string
  ville: string
}

export const emptyClient = (): ClientFields => ({
  type: 'particulier',
  raisonSociale: '',
  siret: '',
  tvaIntra: '',
  prenom: '',
  nom: '',
  email: '',
  telephone: '',
  adresse: '',
  codePostal: '',
  ville: '',
  notes: '',
})

/** Copie modifiable d'une fiche (champs vides plutôt que null). */
export const toFields = (c: Client): ClientFields => {
  const f = emptyClient()
  for (const k of Object.keys(f) as (keyof ClientFields)[]) (f as unknown as Record<string, unknown>)[k] = c[k] ?? ''
  return f
}

/** Nom affiché : raison sociale d'un professionnel, « Prénom Nom » d'un particulier (comme l'API). */
export const clientName = (c: Pick<ClientFields, 'type' | 'raisonSociale' | 'prenom' | 'nom'>) =>
  c.type === 'professionnel' ? (c.raisonSociale ?? '') : [c.prenom, c.nom].filter(Boolean).join(' ')

/** Contact d'un professionnel (« Luc Morel »), vide pour un particulier. */
export const contactName = (c: Pick<ClientFields, 'type' | 'prenom' | 'nom'>) => (c.type === 'professionnel' ? [c.prenom, c.nom].filter(Boolean).join(' ') : '')

/** « 42490 Fraisses » */
export const place = (c: Pick<ClientFields, 'codePostal' | 'ville'>) => [c.codePostal, c.ville].filter(Boolean).join(' ')

/** Le minimum pour enregistrer : raison sociale (professionnel) ou nom (particulier). */
export const hasIdentity = (c: ClientFields) => !!(c.type === 'professionnel' ? c.raisonSociale?.trim() : c.nom?.trim())
