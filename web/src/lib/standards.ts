// Tailles standard de la boutique d'Alu Pliage Service (relevé du 20 octobre 2026) : on choisit une largeur et une longueur
// courantes en un clic, puis on ajuste si besoin. Elles s'appliquent au modèle du même nom.
export interface StandardSizes {
  // Cote du modèle qui prend la largeur standard, et son intitulé
  cote: number
  label: string
  largeurs: number[]
  // Longueurs proposées, en mm
  longueurs: number[]
}

const range = (from: number, to: number, step: number) => Array.from({ length: (to - from) / step + 1 }, (_, i) => from + i * step)

const STANDARDS: Record<string, StandardSizes> = {
  'Couvertine': { cote: 2, label: 'Largeur du dessus', largeurs: [270, 320], longueurs: [1000, 2000, 3000] },
  'Bavette d’appui': { cote: 1, label: 'Profondeur', largeurs: range(150, 500, 25), longueurs: [1000, 2000, 3000] },
  'Bandeau': { cote: 1, label: 'Hauteur', largeurs: range(200, 350, 25), longueurs: [1200, 1500, 3000] },
}

/** Tailles standard d'un modèle (par son nom), ou rien si le modèle n'en a pas. */
export const standardsOf = (nom: string | undefined): StandardSizes | undefined => (nom ? STANDARDS[nom] : undefined)

/** Longueur en mètres, à la française : « 1,50 m », « 3 m ». */
export const metres = (mm: number) => `${(mm / 1000).toLocaleString('fr-FR')} m`
