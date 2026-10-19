export type DocumentType = 'devis' | 'facture'

export interface Company {
  raisonSociale: string
  formeJuridique: string
  capital: string
  adresse: string
  telephone: string
  email: string
  siteWeb: string
  siret: string
  rcs: string
  tvaIntra: string
  iban: string
  bic: string
  // Un logo a été envoyé (sinon : celui de l'appli)
  logo: boolean
  logoUpdatedAt: string | null
}

export interface Template {
  couleur: string
  entete: string
  conditionsPaiement: string
  validiteDevis: number
  echeanceFacture: number
  noteDevis: string
  noteFacture: string
  mentionsLegales: string
  piedDePage: string
  prefixeDevis: string
  prefixeFacture: string
}

export interface Numbering {
  annee: number
  devis: { numero: number; label: string }
  facture: { numero: number; label: string }
}

export interface DocumentSettings {
  company: Company
  template: Template
  numbering: Numbering
}

export const COMPANY_FIELDS = ['raisonSociale', 'formeJuridique', 'capital', 'adresse', 'telephone', 'email', 'siteWeb', 'siret', 'rcs', 'tvaIntra', 'iban', 'bic'] as const
export const TEMPLATE_FIELDS = [
  'couleur',
  'entete',
  'conditionsPaiement',
  'validiteDevis',
  'echeanceFacture',
  'noteDevis',
  'noteFacture',
  'mentionsLegales',
  'piedDePage',
  'prefixeDevis',
  'prefixeFacture',
] as const

/** D, 2026, 1 → « D-2026-0001 » (même format que l'API) */
export const formatNumber = (prefixe: string, annee: number, n: number) => `${prefixe}-${annee}-${String(n).padStart(4, '0')}`

export const LOGO_MAX = 1024 * 1024
