import type { EtatStock, Feuille } from './stock'
import type { OrderStatut } from './orders'

// Plan de l'atelier : où se trouve chaque commande et chaque feuille, d'après les données de l'application.
// Le dessin du bâtiment est fixe (unité : 1,4 m environ) ; seuls les commandes, le stock et le camion changent.

export interface PlanOrder {
  id: string
  numero: string
  client: string
  modeles: string
  statut: OrderStatut
  livraisonMode: 'retrait' | 'livraison'
  datePrevue: string | null
  pieces: number
  prisPar: string | null
}

/** Ce que renvoie GET /api/plan. */
export interface PlanData {
  orders: PlanOrder[]
  feuilles: PlanFeuille[]
  // Des feuilles sont entrées en stock il y a moins de vingt minutes : le camion est encore sur le parking
  reception: { feuilles: number } | null
}

export type Lieu = 'a-lancer' | 'fabrication' | 'a-retirer' | 'a-livrer'
export const LIEUX: { id: Lieu; titre: string; tone: 'info' | 'accent' | 'ok' }[] = [
  { id: 'a-lancer', titre: 'À lancer', tone: 'info' },
  { id: 'fabrication', titre: 'En fabrication', tone: 'accent' },
  { id: 'a-retirer', titre: 'À retirer', tone: 'ok' },
  { id: 'a-livrer', titre: 'À livrer', tone: 'ok' },
]
export const lieuOf = (o: Pick<PlanOrder, 'statut' | 'livraisonMode'>): Lieu =>
  o.statut === 'validee' ? 'a-lancer' : o.statut === 'fabrication' ? 'fabrication' : o.livraisonMode === 'retrait' ? 'a-retirer' : 'a-livrer'

export interface Placed {
  order: PlanOrder
  lieu: Lieu
  x: number
  y: number
  // Machine qui fabrique la commande (seulement en fabrication)
  machine: 'plieuse' | 'cisaille' | null
}

// Les emplacements où se posent les colis : la file devant l'écran de l'atelier, les deux machines, le comptoir de retrait, le véhicule de livraison
const slotLancer = (i: number): [number, number] => [10.1 + (i % 3) * 0.7, 1.5 + Math.floor(i / 3) * 0.7]
const slotRetrait = (i: number): [number, number] => [1.8 - Math.floor(i / 4) * 0.7, 6.5 + (i % 4) * 0.6]
const slotLivrer = (i: number): [number, number] => [-2.9 - Math.floor(i / 4) * 0.7, 6.4 + (i % 4) * 0.6]
export const MACHINES = { plieuse: { x: 5.3, y: 2.9 }, cisaille: { x: 5.3, y: 6.3 } } as const

/** Place chaque commande à l'atelier selon son état. Les commandes d'un même lieu se rangent dans l'ordre reçu (les plus urgentes d'abord). */
export function placeOrders(orders: PlanOrder[]): Placed[] {
  const count: Record<Lieu, number> = { 'a-lancer': 0, fabrication: 0, 'a-retirer': 0, 'a-livrer': 0 }
  return orders
    .filter((o) => o.statut === 'validee' || o.statut === 'fabrication' || o.statut === 'prete')
    .map((order) => {
      const lieu = lieuOf(order)
      const i = count[lieu]++
      if (lieu === 'fabrication') {
        // Une machine sur deux ; plusieurs commandes sur la même machine se décalent le long de celle-ci
        const machine = i % 2 === 0 ? 'plieuse' : 'cisaille'
        const m = MACHINES[machine]
        return { order, lieu, machine, x: m.x + Math.floor(i / 2) * 0.9, y: m.y } as Placed
      }
      const [x, y] = lieu === 'a-lancer' ? slotLancer(i) : lieu === 'a-retirer' ? slotRetrait(i) : slotLivrer(i)
      return { order, lieu, machine: null, x, y } as Placed
    })
}

/** Ce que le plan sait d'une référence de feuilles : sa quantité, son seuil et son état (le plan ne montre ni prix ni codes-barres). */
export type PlanFeuille = Pick<Feuille, 'id' | 'chute' | 'quantite' | 'seuil' | 'libelle' | 'etat'> & { archivee?: boolean }

export interface Rack {
  id: 'rack1' | 'rack2'
  feuilles: PlanFeuille[]
  total: number
  // Hauteur de la pile dessinée : 0 à 8 feuilles empilées
  couches: number
  alerte: boolean
}
const ALERTES: EtatStock[] = ['vide', 'critique', 'bas']
/** Répartit les références de feuilles entières sur les deux racks (la première moitié sur le premier), et les chutes dans leur bac. */
export function stockLayout(feuilles: PlanFeuille[]) {
  const entieres = feuilles.filter((f) => !f.chute && !f.archivee)
  const chutes = feuilles.filter((f) => f.chute && !f.archivee)
  const milieu = Math.ceil(entieres.length / 2)
  const rack = (id: Rack['id'], list: PlanFeuille[]): Rack => {
    const total = list.reduce((n, f) => n + f.quantite, 0)
    return { id, feuilles: list, total, couches: total <= 0 ? 0 : Math.min(8, Math.ceil(total / 5)), alerte: list.some((f) => ALERTES.includes(f.etat)) }
  }
  const nChutes = chutes.reduce((n, f) => n + f.quantite, 0)
  return { racks: [rack('rack1', entieres.slice(0, milieu)), rack('rack2', entieres.slice(milieu))], chutes: nChutes, couchesChutes: nChutes <= 0 ? 0 : Math.min(5, Math.ceil(nChutes / 4)) }
}

/** Résumé lu par un lecteur d'écran à la place du dessin. */
export function resume(placed: Placed[], racks: Rack[], chutes: number) {
  const n = (l: Lieu) => placed.filter((p) => p.lieu === l).length
  const alertes = racks.flatMap((r) => r.feuilles.filter((f) => ALERTES.includes(f.etat))).length
  return `Plan de l’atelier : ${n('a-lancer')} commande(s) à lancer, ${n('fabrication')} en fabrication, ${n('a-retirer')} à retirer, ${n('a-livrer')} à livrer. Stock : ${racks.reduce((s, r) => s + r.total, 0)} feuilles entières, ${chutes} chute(s), ${alertes} référence(s) sous le seuil.`
}

/* ---------- Le bâtiment : lieux, équipements, passages ---------- */
export type ZoneId = 'atelier' | 'stockage' | 'direction' | 'pause' | 'retrait' | 'reception'
export interface Zone {
  name: string
  short?: string
  x0: number
  y0: number
  x1: number
  y1: number
  outside?: boolean
  tint: 'surface2' | 'accentSoft' | 'infoSoft' | 'warnSoft' | 'badSoft'
}
export const ZONES: Record<ZoneId, Zone> = {
  atelier: { name: 'Atelier', x0: 2.9, y0: 0, x1: 12.15, y1: 8.85, tint: 'surface2' },
  stockage: { name: 'Stockage', x0: 12.15, y0: 0, x1: 15.6, y1: 13.5, tint: 'accentSoft' },
  direction: { name: 'Direction', x0: 2.9, y0: 8.85, x1: 8.3, y1: 13.5, tint: 'infoSoft' },
  pause: { name: 'Salle de pause', x0: 8.3, y0: 8.85, x1: 12.15, y1: 13.5, tint: 'warnSoft' },
  retrait: { name: 'Retrait des commandes', short: 'Retrait', x0: 0, y0: 5.8, x1: 2.9, y1: 9.6, outside: true, tint: 'badSoft' },
  reception: { name: 'Réception des feuilles', short: 'Réception', x0: 11.4, y0: 14.3, x1: 16.4, y1: 17.8, outside: true, tint: 'accentSoft' },
}
export const ZONE_ORDER: ZoneId[] = ['atelier', 'stockage', 'direction', 'pause', 'retrait', 'reception']
export const BATIMENT: ZoneId[] = ['atelier', 'stockage', 'direction', 'pause']
// Porte entre l'atelier et la zone de retrait, ouvertures entre les pièces (seules la direction, la pause et le stockage s'ouvrent sur l'atelier),
// et porte du stockage sur le parking, en face de la réception
export const PORTE_RETRAIT = { c: 2.9, a: 6.5, b: 7.7 }
export const PORTES_INTERIEURES = [
  { ax: 'x' as const, c: 8.85, a: 5.2, b: 6.0 },
  { ax: 'x' as const, c: 8.85, a: 9.8, b: 10.6 },
  { ax: 'y' as const, c: 12.15, a: 3.6, b: 5.2 },
]
export const PORTE_STOCKAGE = { y: 13.5, a: 13.3, b: 14.6 }
export const PARKING = { x0: -7.5, y0: -4, x1: 17, y1: 22 }

export type Materiau = 'metal' | 'wood' | 'server' | 'blue' | 'white' | 'green' | 'sheet'
export interface Objet {
  id: string
  x: number
  y: number
  w: number
  d: number
  h: number
  z?: number
  c: Materiau
  nom?: string
  deco?: boolean
  type?: 'plieuse' | 'ecran' | 'rack' | 'bac' | 'serveur' | 'ecran-poste' | 'portail' | 'arbre' | 'tour' | 'camion'
}
export const OBJETS: Objet[] = [
  { id: 'plieuse', x: 4.0, y: 1.0, w: 2.6, d: 1.2, h: 17, c: 'metal', type: 'plieuse', nom: 'Plieuse' },
  { id: 'cisaille', x: 4.2, y: 4.6, w: 2.2, d: 1.1, h: 12, c: 'metal', nom: 'Cisaille / découpe' },
  { id: 'controle', x: 8.2, y: 5.6, w: 1.3, d: 1.0, h: 7, c: 'wood', nom: 'Poste de contrôle' },
  { id: 'chariot', x: 8.4, y: 2.4, w: 1.1, d: 0.9, h: 5, c: 'metal', nom: 'Chariot des pièces' },
  { id: 'ecran', x: 8.0, y: 0.12, w: 1.9, d: 0.14, h: 11, z: 17, c: 'server', type: 'ecran', nom: 'Écran de l’atelier' },
  { id: 'rack1', x: 12.8, y: 0.8, w: 0.8, d: 6.5, h: 21, c: 'metal', type: 'rack', nom: 'Rack de feuilles 1' },
  { id: 'rack2', x: 14.2, y: 0.8, w: 0.8, d: 6.5, h: 21, c: 'metal', type: 'rack', nom: 'Rack de feuilles 2' },
  { id: 'recues', x: 12.7, y: 9.4, w: 1.8, d: 1.2, h: 4, c: 'sheet', nom: 'Feuilles reçues, à ranger' },
  { id: 'chutes', x: 14.2, y: 12.0, w: 0.8, d: 0.8, h: 6, c: 'wood', type: 'bac', nom: 'Bac à chutes' },
  { id: 'desk1', x: 3.4, y: 9.5, w: 1.6, d: 0.9, h: 7, c: 'wood', nom: 'Poste de direction' },
  { id: 'mon1', x: 3.85, y: 9.6, w: 0.7, d: 0.1, h: 6, z: 7, c: 'server', type: 'ecran-poste', deco: true },
  { id: 'desk2', x: 5.5, y: 9.5, w: 1.2, d: 0.9, h: 7, c: 'wood', nom: 'Poste de direction' },
  { id: 'mon2', x: 5.75, y: 9.6, w: 0.6, d: 0.1, h: 6, z: 7, c: 'server', type: 'ecran-poste', deco: true },
  { id: 'table', x: 3.4, y: 11.5, w: 1.7, d: 1.0, h: 6, c: 'wood', nom: 'Table de réunion' },
  { id: 'rasp', x: 7.4, y: 10.7, w: 0.6, d: 0.6, h: 19, c: 'server', type: 'serveur', nom: 'Serveur de l’application' },
  { id: 'nas', x: 7.4, y: 11.8, w: 0.6, d: 0.6, h: 8, c: 'server', type: 'serveur', nom: 'NAS' },
  { id: 'tpause', x: 8.9, y: 11.0, w: 1.5, d: 1.0, h: 5, c: 'white', nom: 'Table de la salle de pause' },
  { id: 'cafe', x: 11.2, y: 9.5, w: 0.5, d: 0.5, h: 11, c: 'metal', nom: 'Machine à café' },
  { id: 'comptoir', x: 0.4, y: 6.2, w: 0.5, d: 2.6, h: 8, c: 'wood', nom: 'Comptoir de retrait' },
  { id: 'vehicule', x: -4.6, y: 7.0, w: 1.0, d: 1.9, h: 7, c: 'white', nom: 'Véhicule de livraison' },
  { id: 'scan', x: 11.6, y: 15.0, w: 0.6, d: 0.5, h: 9, c: 'blue', nom: 'Poste de réception' },
  { id: 'portail', x: -5.5, y: 21.6, w: 4.6, d: 0.3, h: 12, c: 'green', type: 'portail', nom: 'Portail', deco: true },
  { id: 'voit1', x: -4.8, y: 1.0, w: 1.0, d: 1.9, h: 6, c: 'blue', deco: true },
  { id: 'voit2', x: -4.8, y: 11.0, w: 1.0, d: 1.9, h: 6, c: 'metal', deco: true },
  { id: 'voit3', x: 2.0, y: 18.2, w: 1.9, d: 1.0, h: 6, c: 'white', deco: true },
  { id: 'arbre', x: 17.8, y: 2.0, w: 1.4, d: 1.4, h: 12, c: 'green', type: 'arbre', deco: true },
  { id: 'arbre2', x: 18.2, y: 6.0, w: 1.2, d: 1.2, h: 10, c: 'green', type: 'arbre', deco: true },
]
export const CAMION: Objet = { id: 'camion', x: 12.2, y: 15.2, w: 3.4, d: 1.4, h: 15, c: 'white', type: 'camion', nom: 'Camion de feuilles' }
