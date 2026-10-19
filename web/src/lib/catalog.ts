export interface Material {
  id: string
  nom: string
  epaisseur: number
  prixM2: number
  retourMin: number
  actif: boolean
  position: number
}

export interface Color {
  id: string
  nom: string
  reference: string
  hex: string
  majoration: number
  delaiSup: number
  actif: boolean
  position: number
}

const eurFmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })
export const eur = (n: number) => eurFmt.format(n)

/** 1.5 → « 1,50 mm » */
export const mm = (n: number) => `${n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} mm`

/** 12 → « +12 % », -15 → « −15 % », 0 → « — » */
export const pct = (n: number) => (n === 0 ? '—' : `${n > 0 ? '+' : '−'}${Math.abs(n).toLocaleString('fr-FR')} %`)

/** Montant affiché dans un champ de saisie : 0.9 → « 0,90 » */
export const toMoneyField = (n: number | null | undefined) =>
  n === null || n === undefined ? '' : n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false })

/** Nombre affiché dans un champ de saisie : 62.5 → « 62,5 » */
export const toField = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n).replace('.', ','))

export interface QuantityDiscount {
  seuil: number
  remise: number
}

export interface PricingSettings {
  prixPliMl: number
  miseEnRoute: number
  minimumCommande: number
  remisePro: number
  tva: number
  delaiStandard: number
  remisesQuantite: QuantityDiscount[]
  largeurTole: number
  longueurMin: number
  longueurMax: number
  plisMax: number
}

export type Modele = 'couvertine' | 'bavette' | 'bandeau'
export type Unite = 'piece' | 'paire'
export type QuantiteAuto = 'aucune' | 'fixe' | 'par_piece' | 'jonctions'

export interface Accessory {
  id: string
  nom: string
  prix: number
  unite: Unite
  modeles: Modele[]
  quantiteAuto: QuantiteAuto
  quantiteFixe: number
  actif: boolean
  position: number
}

export const MODELES: { id: Modele; label: string }[] = [
  { id: 'couvertine', label: 'Couvertine' },
  { id: 'bavette', label: 'Bavette' },
  { id: 'bandeau', label: 'Bandeau' },
]
export const UNITES: Record<Unite, string> = { piece: 'la pièce', paire: 'la paire' }
export const QUANTITES: Record<QuantiteAuto, string> = {
  aucune: 'Aucune (saisie libre)',
  fixe: 'Nombre fixe par ligne',
  par_piece: 'Une par pièce',
  jonctions: 'Une par jonction (pièces − 1)',
}

/** Quantité proposée pour une ligne de `pieces` pièces identiques. */
export function suggestedQty(a: Pick<Accessory, 'quantiteAuto' | 'quantiteFixe'>, pieces: number) {
  if (pieces <= 0) return 0
  switch (a.quantiteAuto) {
    case 'fixe':
      return a.quantiteFixe
    case 'par_piece':
      return pieces
    case 'jonctions':
      return pieces - 1
    default:
      return 0
  }
}

/** Règle en quelques mots, pour le tableau : « 2 par ligne », « 1 par pièce »… */
export function qtyRule(a: Pick<Accessory, 'quantiteAuto' | 'quantiteFixe'>) {
  switch (a.quantiteAuto) {
    case 'fixe':
      return `${a.quantiteFixe} par ligne`
    case 'par_piece':
      return '1 par pièce'
    case 'jonctions':
      return '1 par jonction'
    default:
      return '—'
  }
}

export interface DeliveryZone {
  distanceMax: number
  prix: number
  franco: number | null
}

export interface DeliverySettings {
  retraitActif: boolean
  retraitInfo: string
  atelierAdresse: string
  atelierLabel: string | null
  zones: DeliveryZone[]
  longueurSeuil: number | null
  longueurPrix: number
}

export interface DeliveryEstimate {
  adresse: string
  distanceKm: number
  methode: 'route' | 'estimation'
  retrait: { actif: boolean; info: string }
  zone: DeliveryZone | null
  offerte: boolean
  supplement: number
  total: number | null
}

/** 14.7 → « 14,7 km » */
export const km = (n: number) => `${n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km`
