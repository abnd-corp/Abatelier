export interface Feuille {
  id: string
  materialId: string
  matiere: string
  epaisseur: number
  colorId: string | null
  coloris: string | null
  reference: string | null
  hex: string | null
  largeur: number
  longueur: number
  chute: boolean
  quantite: number
  seuil: number
  note: string
  libelle: string
  bas: boolean
  // Noir (vide), rouge (critique), jaune (bas) ou vert (ok) : calculé par l'API, jamais réglable ici (R7)
  etat: EtatStock
  // Codes-barres des fournisseurs associés à cette référence (réception au scan)
  codes?: string[]
  archivee?: boolean
}
export type EtatStock = 'vide' | 'critique' | 'bas' | 'ok'
export const ETAT_LABELS: Record<EtatStock, string> = { vide: 'Vide', critique: 'Critique', bas: 'Stock bas', ok: 'Correct' }
export interface StockTotaux {
  references: number
  // Une chute n'est pas une feuille entière : comptées à part, jamais mélangées dans un même total
  feuillesEntieres: number
  chutes: number
  m2Entieres: number
  m2Chutes: number
  bas: number
}
export interface Mouvement {
  id: string
  at: string
  libelle: string
  delta: number
  apres: number
  motif: Motif
  note: string
  par: string | null
}
export interface StockOptions {
  materials: { id: string; label: string }[]
  colors: { id: string; label: string; hex: string }[]
}

export type Motif = 'reception' | 'inventaire' | 'fabrication' | 'chute' | 'perte' | 'autre'
export const MOTIFS: Record<Motif, string> = {
  reception: 'Réception de feuilles',
  inventaire: 'Inventaire',
  fabrication: 'Utilisée en fabrication',
  chute: 'Chute récupérée',
  perte: 'Perte ou casse',
  autre: 'Autre',
}
// Motifs proposés selon le sens du mouvement
export const MOTIFS_ENTREE: Motif[] = ['reception', 'chute', 'autre']
export const MOTIFS_SORTIE: Motif[] = ['fabrication', 'perte', 'autre']

export interface ConseilFeuille {
  sheetId: string
  libelle: string
  chute: boolean
  parFeuille: number
  feuilles: number
  disposition: { sensLongueur: boolean; colonnes: number; rangees: number }
  perte: number
  enStock: number
}
export interface LigneFeuilles {
  ligneId: string
  repere: string | null
  modeleLabel: string
  besoin: { developpe: number; longueur: number; quantite: number } | null
  conseils: ConseilFeuille[]
  raison: string | null
}
