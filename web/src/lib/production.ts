// Suivi de la fabrication : le plan de la commande rangé feuille par feuille, et ce qui est déjà coché (voir api/src/production-plan.ts)

export interface Chute {
  nombre: number
  largeur: number
  longueur: number
}

export interface PlanDecoupe {
  cle: string
  ligneId: string
  piece: number
  titre: string
  consigne: string
  pose: string | null
  quantite: number
  plan: { feuilleLargeur: number; feuilleLongueur: number; parFeuille: number; sensLongueur: boolean; colonnes: number; rangees: number; developpe: number; longueur: number } | null
}

export interface PlanEtape {
  pts: [number, number][]
  plat: boolean
}

export interface PlanPliage {
  cle: string
  ligneId: string
  piece: number
  titre: string
  consigne: string
  plis: { angle: number; pince: boolean }[]
  traits: number[]
  etapes: PlanEtape[]
  quantite: number
}

export interface PlanGroupe {
  id: string
  numero: number
  label: string
  recuperer: { cle: string; ligneId: string; piece: number; texte: string }[]
  decoupes: PlanDecoupe[]
  pliages: PlanPliage[]
  coteCle: string
  chutes: null | { garder: Chute[]; jeter: Chute[]; pourcent: number; m2: number; minimum: number }
  feuilles: { sheetId: string; nombre: number }[]
  stockCle: string
}

export interface Plan {
  groupes: PlanGroupe[]
  apreparer: { cle: string; texte: string }[]
}

export interface Check {
  count: number
  par: string | null
  le: string
}

export interface Suivi {
  plan: Plan
  checks: Record<string, Check>
  modifiable: boolean
}

export const mm = (n: number) => `${n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} mm`
export const dimChute = (c: Chute) => `${c.nombre} × ${c.largeur.toLocaleString('fr-FR')} × ${c.longueur.toLocaleString('fr-FR')} mm`

/** Avancement de toute la commande : cases faites sur cases à faire, les pièces comptant une à une. */
export function avancement(plan: Plan, checks: Record<string, Check>) {
  let fait = 0
  let total = 0
  const compte = (cle: string, max: number) => {
    total += max
    fait += Math.min(checks[cle]?.count ?? 0, max)
  }
  for (const g of plan.groupes) {
    for (const r of g.recuperer) compte(r.cle, 1)
    for (const d of g.decoupes) compte(d.cle, d.quantite)
    for (const p of g.pliages) compte(p.cle, p.quantite)
    compte(g.coteCle, 1)
  }
  for (const a of plan.apreparer) compte(a.cle, 1)
  return { fait, total, pourcent: total ? Math.round((fait / total) * 100) : 0 }
}
