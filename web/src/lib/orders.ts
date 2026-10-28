export type OrderStatut = 'recue' | 'validee' | 'fabrication' | 'prete' | 'livree' | 'annulee'
export type Tone = 'ok' | 'warn' | 'accent' | 'info' | 'done' | 'bad' | 'neutral'

export const STATUTS: { value: OrderStatut; label: string; tone: Tone }[] = [
  { value: 'recue', label: 'Reçue', tone: 'warn' },
  { value: 'validee', label: 'Validée', tone: 'info' },
  { value: 'fabrication', label: 'En fabrication', tone: 'accent' },
  { value: 'prete', label: 'Prête', tone: 'ok' },
  { value: 'livree', label: 'Livrée / retirée', tone: 'done' },
  { value: 'annulee', label: 'Annulée', tone: 'bad' },
]
export const statutOf = (s: OrderStatut) => STATUTS.find((x) => x.value === s)!

// Libellé du bouton qui fait passer à l'étape
/** Le bouton de l'atelier pour une étape : « retirée » ou « livrée » selon la commande, jamais les deux. */
export const stepAction = (next: OrderStatut, livraisonMode: 'retrait' | 'livraison') => (next === 'livree' ? (livraisonMode === 'retrait' ? 'Marquer retirée' : 'Marquer livrée') : STEP_ACTIONS[next])

export const STEP_ACTIONS: Record<OrderStatut, string> = {
  recue: '',
  validee: 'Valider la commande',
  fabrication: 'Lancer la fabrication',
  prete: 'Marquer prête',
  livree: 'Marquer livrée / retirée',
  annulee: 'Annuler la commande',
}

/** Modèle de pièce du catalogue : une forme de départ que l'on ajuste. Angles signés : négatif = pli dans l'autre sens. */
export interface CatalogModel {
  id: string
  nom: string
  cotes: number[]
  angles: number[]
  // Nom de chaque cote (Larmier, Retombée…), vide si aucun
  noms: string[]
  // Orientation du dessin : direction du premier segment, en degrés
  cap: number
  longueur: number
  quantite: number
}

export interface CatalogMaterial {
  id: string
  label: string
  epaisseur: number
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
  models: CatalogModel[]
  materials: CatalogMaterial[]
  colors: CatalogColor[]
  accessories: CatalogAccessory[]
  limits: { largeurTole: number; longueurMin: number; longueurMax: number; plisMax: number; angleMin: number; angleMax: number; pince: boolean }
  retrait: boolean
}

export interface LineForm {
  repere: string
  modelId: string
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
  modelId: string | null
  modeleLabel: string
  cap: number
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
  kind?: 'sur_mesure' | 'boutique'
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
  // Boutique : articles du catalogue payés en ligne ; sur mesure : pièces dessinées
  kind: 'sur_mesure' | 'boutique'
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

export interface OrderPaiement {
  statut: 'attente' | 'paye' | 'echec' | 'rembourse'
  montantTtc: number
  paidAt: string | null
  refundedAt: string | null
  refundMotif: string | null
  prestataire: string
}

export interface OrderDetail {
  order: Order
  // Paiement en ligne d'une commande de la boutique
  paiement: OrderPaiement | null
  client: { id: string; nom: string; type: 'particulier' | 'professionnel'; telephone: string | null; email: string | null }
  lignes: (PricedLine & { id: string; materialId: string | null; colorId: string | null })[]
  events: OrderEvent[]
  // Ce qui empêcherait la facture d'être électronique conforme (l'émission reste possible)
  facturx: { manque: string[] }
}

/** Quantité d'accessoire proposée pour une ligne de n pièces. */
export function suggestedQuantity(a: CatalogAccessory, n: number) {
  if (a.quantiteAuto === 'fixe') return a.quantiteFixe
  if (a.quantiteAuto === 'par_piece') return n
  if (a.quantiteAuto === 'jonctions') return Math.max(n - 1, 0)
  return 0
}

/** Accessoires qui s'utilisent avec ce modèle. */
export const accessoriesFor = (c: OrderCatalog, modelId: string) => c.accessories.filter((a) => a.modeles.includes(modelId))
export const modelOf = (c: OrderCatalog, modelId: string) => c.models.find((m) => m.id === modelId)

/** Nouvelle ligne du modèle donné, avec les accessoires proposés. */
export function newLine(c: OrderCatalog, modelId = c.models[0]?.id ?? '', from?: Partial<LineForm>): LineForm {
  const m = modelOf(c, modelId) ?? { cotes: [60, 120], angles: [90], longueur: 2000, quantite: 1 }
  return {
    repere: '',
    modelId,
    materialId: from?.materialId ?? c.materials[0]?.id ?? '',
    colorId: from?.colorId ?? c.colors[0]?.id ?? '',
    cotes: [...m.cotes],
    angles: [...m.angles],
    longueur: m.longueur,
    quantite: m.quantite,
    accessoires: accessoriesFor(c, modelId).map((a) => ({ accessoryId: a.id, quantite: suggestedQuantity(a, m.quantite) })),
  }
}

/** Ligne enregistrée remise en formulaire. */
export const toLineForm = (l: OrderDetail['lignes'][number]): LineForm => ({
  repere: l.repere ?? '',
  modelId: l.modelId ?? '',
  materialId: l.materialId ?? '',
  colorId: l.colorId ?? '',
  cotes: [...l.cotes],
  angles: [...l.angles],
  longueur: l.longueur,
  quantite: l.quantite,
  accessoires: l.accessoires.filter((a) => a.accessoryId).map((a) => ({ accessoryId: a.accessoryId!, quantite: a.quantite })),
})

// Une pince (tôle repliée à plat, 0°) s'enregistre ±1 pour garder son sens (voir api/src/profile.ts)
export const PINCE = 1
export const isPince = (a: number) => Math.abs(a) === PINCE
/** « 135° », ou « pince » */
export const angleText = (a: number) => (isPince(a) ? 'pince' : `${Math.abs(a)}°`)

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

// Étapes où la commande est à l'atelier, et sa fiche de fabrication imprimable (PDF ouvert dans un nouvel onglet)
export const PRODUCTION_STATUTS: OrderStatut[] = ['validee', 'fabrication', 'prete']
export const sheetUrl = (id: string) => `/api/production/${id}/fiche.pdf`

const dayFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
/** « 2026-10-26 » → « lun. 26 oct. » */
export const shortDay = (d: string | null) => (d ? dayFmt.format(new Date(`${d}T00:00:00Z`)) : '—')
