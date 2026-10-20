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
}

export interface NextNumber {
  numero: number
  label: string
  // Un document de ce type a déjà été créé : le prochain numéro ne se modifie plus
  verrouille: boolean
}

export interface Numbering {
  annee: number
  devis: NextNumber
  facture: NextNumber
}

export interface DocumentSettings {
  company: Company
  template: Template
  numbering: Numbering
  // Ce qui manque pour des factures électroniques conformes (calculé par l'API)
  facturx?: { manque: string[] }
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
] as const

// Préfixes fixes, comme dans l'API
export const PREFIXES: Record<DocumentType, string> = { devis: 'D', facture: 'F' }

/** devis, 2026, 1 → « D-2026-0001 » (même format que l'API) */
export const formatNumber = (type: DocumentType, annee: number, n: number) => `${PREFIXES[type]}-${annee}-${String(n).padStart(4, '0')}`

export const LOGO_MAX = 1024 * 1024

/**
 * Ce qui manque à l'entreprise pour émettre des factures électroniques conformes.
 * Mêmes règles que l'API (api/src/facturx.ts) : on les refait ici pour réagir pendant la saisie.
 */
export function facturxMissing(c: Pick<Company, 'siret' | 'tvaIntra' | 'adresse'>) {
  const out: string[] = []
  if (c.siret.replace(/\D/g, '').length !== 14) out.push('le SIRET')
  if (!c.tvaIntra.trim()) out.push('le numéro de TVA intracommunautaire')
  const lines = c.adresse.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length < 2 || !/^\d{5}\s+\S/.test(lines.at(-1) ?? '')) out.push('l’adresse complète (rue, code postal et ville)')
  return out
}
