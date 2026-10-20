import type { Emplacement } from './site'

export interface Champ {
  key: string
  groupe: string
  label: string
  long?: boolean
  max: number
  defaut: string
  valeur: string
  modifie: boolean
}
export interface PhotoAdmin {
  id: string
  emplacement: Emplacement
  alt: string
  largeur: number
  hauteur: number
  position: number
}
export interface Demande {
  id: string
  createdAt: string
  nom: string
  email: string
  telephone: string | null
  adresse: string | null
  codePostal: string | null
  ville: string | null
  objet: string
  message: string
  fichierNom: string | null
  fichierType: string | null
  traiteAt: string | null
}

export interface MailStatus {
  configure: boolean
  expediteur: string | null
  alertes: string[]
  journal: { id: string; at: string; kind: 'contact' | 'document' | 'test'; destinataires: string; objet: string; statut: 'envoye' | 'echec'; erreur: string | null }[]
}

export const EMPLACEMENTS: { value: Emplacement; label: string; aide: string }[] = [
  { value: 'accueil', label: 'Accueil (grande photo)', aide: 'La première photo s’affiche à côté du titre de la page d’accueil.' },
  { value: 'realisation', label: 'Réalisations', aide: 'Galerie « Quelques réalisations » de l’accueil.' },
  { value: 'couvertine', label: 'Couvertine', aide: 'Page « Pliage aluminium » et carte de l’accueil.' },
  { value: 'bavette', label: 'Bavette d’appui', aide: 'Page « Pliage aluminium » et carte de l’accueil.' },
  { value: 'bandeau', label: 'Bandeau', aide: 'Page « Pliage aluminium » et carte de l’accueil.' },
]
