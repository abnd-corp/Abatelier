export type OrderStatut = 'recue' | 'validee' | 'fabrication' | 'prete' | 'livree' | 'annulee'
export type LineModele = 'couvertine' | 'bavette' | 'bandeau' | 'autre'
export type Tone = 'ok' | 'warn' | 'accent' | 'neutral'

export const STATUTS: { value: OrderStatut; label: string; tone: Tone }[] = [
  { value: 'recue', label: 'Reçue', tone: 'warn' },
  { value: 'validee', label: 'Validée', tone: 'accent' },
  { value: 'fabrication', label: 'En fabrication', tone: 'accent' },
  { value: 'prete', label: 'Prête', tone: 'ok' },
  { value: 'livree', label: 'Livrée / retirée', tone: 'neutral' },
  { value: 'annulee', label: 'Annulée', tone: 'neutral' },
]
export const statutOf = (s: OrderStatut) => STATUTS.find((x) => x.value === s)!

// Libellé du bouton qui fait passer à l'étape
export const STEP_ACTIONS: Record<OrderStatut, string> = {
  recue: '',
  validee: 'Valider la commande',
  fabrication: 'Lancer la fabrication',
  prete: 'Marquer prête',
  livree: 'Marquer livrée / retirée',
  annulee: 'Annuler la commande',
}

/** Modèles de pièces, avec une forme de départ que l'on ajuste. Angles signés : négatif = pli dans l'autre sens. */
export const MODELES: Record<LineModele, { label: string; cotes: number[]; angles: number[]; longueur: number; quantite: number; cap: number; noms: string[] }> = {
  couvertine: { label: 'Couvertine', cotes: [20, 70, 300, 70, 20], angles: [-135, 90, 90, -135], longueur: 3000, quantite: 4, cap: -45, noms: ['Larmier', 'Retombée', 'Dessus', 'Retombée', 'Larmier'] },
  bavette: { label: 'Bavette d’appui', cotes: [30, 220, 45, 15], angles: [-95, 95, 135], longueur: 1400, quantite: 2, cap: 90, noms: ['Rejingot', 'Dessus', 'Nez', 'Retour'] },
  bandeau: { label: 'Bandeau', cotes: [40, 150], angles: [-90], longueur: 3000, quantite: 6, cap: 180, noms: ['Retour', 'Face'] },
  autre: { label: 'Autre profil', cotes: [60, 120], angles: [90], longueur: 2000, quantite: 1, cap: 0, noms: [] },
}
export const MODELE_KEYS = Object.keys(MODELES) as LineModele[]

export interface CatalogMaterial {
  id: string
  label: string
  retourMin: number
}
export interface CatalogColor {
  id: string
  label: string
  hex: string
}
export interface CatalogAccessory {
  id: string
  nom: string
  prix: number
  unite: 'piece' | 'paire'
  modeles: string[]
  quantiteAuto: 'aucune' | 'fixe' | 'par_piece' | 'jonctions'
  quantiteFixe: number
}
export interface OrderCatalog {
  materials: CatalogMaterial[]
  colors: CatalogColor[]
  accessories: CatalogAccessory[]
  limits: { largeurTole: number; longueurMin: number; longueurMax: number; plisMax: number }
  retrait: boolean
}

export interface LineForm {
  repere: string
  modele: LineModele
  materialId: string
  colorId: string
  cotes: number[]
  angles: number[]
  longueur: number
  quantite: number
  accessoires: { accessoryId: string; quantite: number }[]
}

export type Livraison = { mode: 'retrait' } | { mode: 'livraison'; adresse: string; codePostal: string; ville: string }

export interface OrderForm {
  clientId: string
  lignes: LineForm[]
  livraison: Livraison
  notes: string
}

export interface PricedLine {
  repere: string | null
  modele: LineModele
  materialLabel: string
  colorLabel: string
  colorHex: string
  cotes: number[]
  angles: number[]
  longueur: number
  quantite: number
  accessoires: { accessoryId?: string; nom: string; unite: 'piece' | 'paire'; prix?: number; quantite: number }[]
  prixUnitaire: number
  remiseQuantite: number
  montantPieces: number
  montantAccessoires: number
  miseEnRoute: number
  total: number
}

export interface Totals {
  brut: number
  tauxRemisePro: number
  remisePro: number
  complementMinimum: number
  livraisonPrix: number
  livraisonOfferte?: boolean
  ht: number
  tauxTva: number
  tva: number
  ttc: number
  delaiJours: number
}

export interface OrderSummary {
  id: string
  numero: string
  statut: OrderStatut
  clientId: string
  client: string
  livraisonMode: 'retrait' | 'livraison'
  livraisonVille: string | null
  ht: number
  ttc: number
  datePrevue: string | null
  createdAt: string
  pieces: number
}

export interface OrderEvent {
  statut: OrderStatut
  at: string
  note: string | null
  nom: string | null
}

export interface Order extends Totals {
  id: string
  numero: string
  statut: OrderStatut
  statutLabel: string
  next: OrderStatut[]
  clientId: string
  livraisonMode: 'retrait' | 'livraison'
  livraisonAdresse: string | null
  livraisonCodePostal: string | null
  livraisonVille: string | null
  distanceKm: number | null
  notes: string | null
  datePrevue: string | null
  createdAt: string
}

export interface OrderDetail {
  order: Order
  client: { id: string; nom: string; type: 'particulier' | 'professionnel'; telephone: string | null; email: string | null }
  lignes: (PricedLine & { id: string; materialId: string | null; colorId: string | null })[]
  events: OrderEvent[]
}

/** Quantité d'accessoire proposée pour une ligne de n pièces. */
export function suggestedQuantity(a: CatalogAccessory, n: number) {
  if (a.quantiteAuto === 'fixe') return a.quantiteFixe
  if (a.quantiteAuto === 'par_piece') return n
  if (a.quantiteAuto === 'jonctions') return Math.max(n - 1, 0)
  return 0
}

/** Accessoires qui s'utilisent avec ce modèle (tous pour un profil libre). */
export const accessoriesFor = (c: OrderCatalog, modele: LineModele) => c.accessories.filter((a) => modele === 'autre' || a.modeles.includes(modele))

/** Nouvelle ligne du modèle donné, avec les accessoires proposés. */
export function newLine(c: OrderCatalog, modele: LineModele = 'couvertine', from?: Partial<LineForm>): LineForm {
  const m = MODELES[modele]
  return {
    repere: '',
    modele,
    materialId: from?.materialId ?? c.materials[0]?.id ?? '',
    colorId: from?.colorId ?? c.colors[0]?.id ?? '',
    cotes: [...m.cotes],
    angles: [...m.angles],
    longueur: m.longueur,
    quantite: m.quantite,
    accessoires: accessoriesFor(c, modele).map((a) => ({ accessoryId: a.id, quantite: suggestedQuantity(a, m.quantite) })),
  }
}

/** Ligne enregistrée remise en formulaire. */
export const toLineForm = (l: OrderDetail['lignes'][number]): LineForm => ({
  repere: l.repere ?? '',
  modele: l.modele,
  materialId: l.materialId ?? '',
  colorId: l.colorId ?? '',
  cotes: [...l.cotes],
  angles: [...l.angles],
  longueur: l.longueur,
  quantite: l.quantite,
  accessoires: l.accessoires.filter((a) => a.accessoryId).map((a) => ({ accessoryId: a.accessoryId!, quantite: a.quantite })),
})

export const letter = (i: number) => String.fromCharCode(65 + i)
export const developpe = (cotes: number[]) => cotes.reduce((s, v) => s + (Number(v) || 0), 0)

/** Points du profil vu en coupe, à partir des cotes et des angles signés. */
export function profilePoints(cotes: number[], angles: number[], cap = 0) {
  let x = 0
  let y = 0
  let h = (cap * Math.PI) / 180
  const pts: [number, number][] = [[0, 0]]
  const heads: number[] = []
  cotes.forEach((len, i) => {
    heads.push(h)
    const l = Math.max(Number(len) || 0, 0)
    x += l * Math.cos(h)
    y += l * Math.sin(h)
    pts.push([x, y])
    const a = angles[i]
    if (a !== undefined) h += ((180 - Math.min(Math.abs(a), 180)) * Math.sign(a) * Math.PI) / 180
  })
  return { pts, heads }
}

const dayFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
/** « 2026-10-26 » → « lun. 26 oct. » */
export const shortDay = (d: string | null) => (d ? dayFmt.format(new Date(`${d}T00:00:00Z`)) : '—')
