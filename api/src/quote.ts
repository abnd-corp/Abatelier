// Chiffrage d'une commande à partir du catalogue. Même calcul pour l'équipe et, plus tard, pour le panier du site.
//
// Par pièce : développé (m) × longueur (m) × prix au m² de la matière × (1 + majoration du coloris)
//           + nombre de plis × prix du pli au mètre × longueur (m)
// Par ligne : pièces × quantité − remise quantité, + accessoires, + mise en route (une par ligne)
// Commande  : somme des lignes − remise pro, complétée jusqu'au minimum de commande, + livraison, + TVA
import type { Accessory, Color, DeliverySettings, LineModele, Material, OrderLineAccessory, PricingSettings } from './db/schema.js'
import { deliveryQuote } from './delivery.js'

export interface LineInput {
  repere?: string | null
  modele: LineModele
  materialId: string
  colorId: string
  cotes: number[]
  angles: number[]
  longueur: number
  quantite: number
  accessoires: { accessoryId: string; quantite: number }[]
}

export interface Catalog {
  materials: Material[]
  colors: Color[]
  accessories: Accessory[]
  settings: PricingSettings
  delivery: DeliverySettings
}

export interface PricedLine {
  repere: string | null
  modele: LineModele
  materialId: string
  materialLabel: string
  colorId: string
  colorLabel: string
  colorHex: string
  cotes: number[]
  angles: number[]
  longueur: number
  quantite: number
  accessoires: OrderLineAccessory[]
  developpe: number
  prixUnitaire: number
  remiseQuantite: number
  montantPieces: number
  montantAccessoires: number
  miseEnRoute: number
  total: number
  delaiJours: number
}

export interface QuoteError {
  error: string
  field: string
}

export type Delivery = { mode: 'retrait' } | { mode: 'livraison'; distanceKm: number }

export interface Totals {
  brut: number
  tauxRemisePro: number
  remisePro: number
  complementMinimum: number
  livraisonPrix: number
  livraisonOfferte: boolean
  ht: number
  tauxTva: number
  tva: number
  ttc: number
  delaiJours: number
}

export const cents = (n: number) => Math.round(n * 100) / 100
const sum = (a: number[]) => a.reduce((s, v) => s + v, 0)
const num = (n: number) => n.toLocaleString('fr-FR')

export const materialLabel = (m: Pick<Material, 'nom' | 'epaisseur'>) => `${m.nom} ${m.epaisseur.toLocaleString('fr-FR')} mm`
export const colorLabel = (c: Pick<Color, 'nom' | 'reference'>) => `${c.nom} (${c.reference})`

/** Remise quantité de la ligne : le palier le plus haut atteint. */
export const quantityDiscount = (s: Pick<PricingSettings, 'remisesQuantite'>, quantite: number) =>
  [...s.remisesQuantite].sort((a, b) => b.seuil - a.seuil).find((p) => quantite >= p.seuil)?.remise ?? 0

/** Chiffre une ligne, ou renvoie la première erreur (avec le champ, ex. « lignes.0.cotes.2 »). */
export function priceLine(input: LineInput, i: number, c: Catalog): PricedLine | QuoteError {
  const f = (name: string) => `lignes.${i}.${name}`
  const s = c.settings
  const material = c.materials.find((m) => m.id === input.materialId && m.actif)
  if (!material) return { error: 'Matière inconnue ou désactivée.', field: f('materialId') }
  const color = c.colors.find((x) => x.id === input.colorId && x.actif)
  if (!color) return { error: 'Coloris inconnu ou désactivé.', field: f('colorId') }

  const plis = input.cotes.length - 1
  if (input.angles.length !== plis) return { error: 'Il faut un angle pour chaque pli.', field: f('angles') }
  if (plis > s.plisMax) return { error: `${s.plisMax} plis maximum par pièce.`, field: f('cotes') }
  const tooShort = input.cotes.findIndex((v) => v < material.retourMin)
  if (tooShort >= 0) {
    return { error: `Cote ${String.fromCharCode(65 + tooShort)} : ${material.retourMin} mm minimum en ${materialLabel(material)}.`, field: f(`cotes.${tooShort}`) }
  }
  const developpe = sum(input.cotes)
  if (developpe > s.largeurTole) return { error: `Développé de ${num(developpe)} mm : la tôle fait ${num(s.largeurTole)} mm de large au maximum.`, field: f('cotes') }
  if (input.longueur < s.longueurMin || input.longueur > s.longueurMax) {
    return { error: `Longueur entre ${num(s.longueurMin)} et ${num(s.longueurMax)} mm.`, field: f('longueur') }
  }

  const accessoires: OrderLineAccessory[] = []
  for (const [j, a] of input.accessoires.entries()) {
    if (!a.quantite) continue
    const acc = c.accessories.find((x) => x.id === a.accessoryId && x.actif)
    if (!acc) return { error: 'Accessoire inconnu ou désactivé.', field: f(`accessoires.${j}`) }
    if (input.modele !== 'autre' && !acc.modeles.includes(input.modele)) return { error: `${acc.nom} : ne s’utilise pas avec ce modèle.`, field: f(`accessoires.${j}`) }
    accessoires.push({ accessoryId: acc.id, nom: acc.nom, unite: acc.unite, prix: acc.prix, quantite: a.quantite })
  }

  const m = input.longueur / 1000
  const prixUnitaire = cents((developpe / 1000) * m * material.prixM2 * (1 + color.majoration / 100) + plis * s.prixPliMl * m)
  const remiseQuantite = quantityDiscount(s, input.quantite)
  const montantPieces = cents(prixUnitaire * input.quantite * (1 - remiseQuantite / 100))
  const montantAccessoires = cents(sum(accessoires.map((a) => a.prix * a.quantite)))
  const miseEnRoute = s.miseEnRoute
  return {
    repere: input.repere?.trim() || null,
    modele: input.modele,
    materialId: material.id,
    materialLabel: materialLabel(material),
    colorId: color.id,
    colorLabel: colorLabel(color),
    colorHex: color.hex,
    cotes: input.cotes,
    angles: input.angles,
    longueur: input.longueur,
    quantite: input.quantite,
    accessoires,
    developpe,
    prixUnitaire,
    remiseQuantite,
    montantPieces,
    montantAccessoires,
    miseEnRoute,
    total: cents(montantPieces + montantAccessoires + miseEnRoute),
    delaiJours: s.delaiStandard + color.delaiSup,
  }
}

/** Totaux de la commande. Renvoie une erreur si l'adresse est hors des zones de livraison. */
export function priceOrder(lines: PricedLine[], opts: { pro: boolean; delivery: Delivery }, c: Catalog): Totals | QuoteError {
  const s = c.settings
  const brut = cents(sum(lines.map((l) => l.total)))
  const tauxRemisePro = opts.pro ? s.remisePro : 0
  const remisePro = cents((brut * tauxRemisePro) / 100)
  const net = cents(brut - remisePro)
  const complementMinimum = net > 0 && net < s.minimumCommande ? cents(s.minimumCommande - net) : 0

  let livraisonPrix = 0
  let livraisonOfferte = false
  if (opts.delivery.mode === 'livraison') {
    const longueurMax = Math.max(0, ...lines.map((l) => l.longueur))
    const q = deliveryQuote(c.delivery, opts.delivery.distanceKm, { montant: net + complementMinimum, longueurMax })
    if (q.total === null) {
      const max = Math.max(0, ...c.delivery.zones.map((z) => z.distanceMax))
      return { error: `Adresse à ${num(opts.delivery.distanceKm)} km : au-delà de la zone de livraison (${max} km). Proposez le retrait à l’atelier.`, field: 'livraison' }
    }
    livraisonPrix = q.total
    livraisonOfferte = q.offerte
  }

  const ht = cents(net + complementMinimum + livraisonPrix)
  const tva = cents((ht * s.tva) / 100)
  return {
    brut,
    tauxRemisePro,
    remisePro,
    complementMinimum,
    livraisonPrix,
    livraisonOfferte,
    ht,
    tauxTva: s.tva,
    tva,
    ttc: cents(ht + tva),
    delaiJours: Math.max(s.delaiStandard, ...lines.map((l) => l.delaiJours)),
  }
}

export const isError = (x: unknown): x is QuoteError => typeof x === 'object' && x !== null && 'error' in x

/** Ajoute n jours ouvrés (du lundi au vendredi) à une date AAAA-MM-JJ. */
export function addWorkingDays(day: string, n: number) {
  const d = new Date(`${day}T12:00:00Z`)
  while (n > 0) {
    d.setUTCDate(d.getUTCDate() + 1)
    const w = d.getUTCDay()
    if (w !== 0 && w !== 6) n--
  }
  return d.toISOString().slice(0, 10)
}
