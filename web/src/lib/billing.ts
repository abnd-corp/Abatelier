import type { OrderStatut } from './orders'

export type BillingType = 'devis' | 'facture' | 'avoir'
export type BillingStatut = 'emis' | 'envoye' | 'accepte' | 'refuse' | 'expire' | 'emise' | 'envoyee' | 'en_retard' | 'payee' | 'annulee'
export type PaiementMode = 'virement' | 'cheque' | 'carte' | 'especes'
export type Tone = 'ok' | 'warn' | 'accent' | 'neutral' | 'bad'

export const TYPES: { value: BillingType; label: string; one: string }[] = [
  { value: 'devis', label: 'Devis', one: 'Devis' },
  { value: 'facture', label: 'Factures', one: 'Facture' },
  { value: 'avoir', label: 'Avoirs', one: 'Avoir' },
]
export const typeOf = (t: BillingType) => TYPES.find((x) => x.value === t)!

// Statuts de chaque type, dans l'ordre des filtres
export const STATUTS: Record<BillingType, { value: BillingStatut; label: string; tone: Tone }[]> = {
  devis: [
    { value: 'emis', label: 'À envoyer', tone: 'warn' },
    { value: 'envoye', label: 'Envoyé', tone: 'accent' },
    { value: 'accepte', label: 'Accepté', tone: 'ok' },
    { value: 'refuse', label: 'Refusé', tone: 'neutral' },
    { value: 'expire', label: 'Expiré', tone: 'neutral' },
  ],
  facture: [
    { value: 'emise', label: 'À envoyer', tone: 'warn' },
    { value: 'envoyee', label: 'Envoyée', tone: 'accent' },
    { value: 'en_retard', label: 'En retard', tone: 'bad' },
    { value: 'payee', label: 'Payée', tone: 'ok' },
    { value: 'annulee', label: 'Annulée', tone: 'neutral' },
  ],
  avoir: [{ value: 'emis', label: 'Émis', tone: 'neutral' }],
}
export const statutOf = (type: BillingType, s: BillingStatut) => STATUTS[type].find((x) => x.value === s) ?? { value: s, label: s, tone: 'neutral' as Tone }

export const MODES: { value: PaiementMode; label: string }[] = [
  { value: 'virement', label: 'Virement' },
  { value: 'cheque', label: 'Chèque' },
  { value: 'carte', label: 'Carte bancaire' },
  { value: 'especes', label: 'Espèces' },
]
export const modeLabel = (m: PaiementMode | null) => MODES.find((x) => x.value === m)?.label ?? '—'

export interface BillingLine {
  designation: string
  detail?: string
  quantite: number
  prixUnitaire: number
}

export interface BillingSummary {
  id: string
  type: BillingType
  numero: string
  orderId: string
  orderNumero: string
  clientId: string
  client: string
  emisLe: string
  echeance: string | null
  ht: number
  ttc: number
  payeLe: string | null
  statut: BillingStatut
}

export interface BillingDoc {
  id: string
  type: BillingType
  numero: string
  orderId: string
  clientId: string
  factureId: string | null
  emisLe: string
  echeance: string | null
  clientNom: string
  clientAdresse: string
  lignes: BillingLine[]
  ht: number
  tauxTva: number
  tva: number
  ttc: number
  motif: string | null
  envoyeLe: string | null
  reponse: 'accepte' | 'refuse' | null
  reponseLe: string | null
  payeLe: string | null
  modePaiement: PaiementMode | null
  createdByNom: string | null
  statut: BillingStatut
}

export interface BillingDetail {
  document: BillingDoc
  order: { id: string; numero: string; statut: OrderStatut; statutLabel: string }
  // Facture : son avoir ; avoir : la facture annulée
  lie: { id: string; numero: string } | null
}

// Étapes de la commande où l'on peut faire un devis, ou la facturer (comme l'API)
export const DEVIS_STATUTS: OrderStatut[] = ['recue', 'validee', 'fabrication', 'prete', 'livree']
export const FACTURE_STATUTS: OrderStatut[] = ['validee', 'fabrication', 'prete', 'livree']

/** PDF tel qu'il a été émis (ouvert dans un nouvel onglet). */
export const pdfUrl = (id: string) => `/api/billing/${id}/pdf`

/** Ligne : quantité × prix, arrondie au centime. */
export const lineTotal = (l: BillingLine) => Math.round(l.quantite * l.prixUnitaire * 100) / 100
