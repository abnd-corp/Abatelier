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
