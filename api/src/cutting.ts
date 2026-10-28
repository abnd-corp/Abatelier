// Quelle feuille prendre pour une pièce ? Calcul simple et prévisible, pour guider l'opérateur (il garde la main) :
// la pièce est une bande « développé × longueur », posée sur la feuille dans le sens qui en entre le plus (en grille).
// On préfère, à nombre de feuilles égal, celle qui perd le moins de matière, et on entame les chutes avant les feuilles entières.

export interface SheetOption {
  id: string
  largeur: number
  longueur: number
  chute: boolean
  quantite: number
  libelle: string
}

export interface PieceNeed {
  /** Largeur de tôle dépliée (somme des cotes), en mm */
  developpe: number
  longueur: number
  quantite: number
}

export interface SheetAdvice {
  sheetId: string
  libelle: string
  chute: boolean
  /** Dimensions de la feuille, en mm */
  feuilleLargeur: number
  feuilleLongueur: number
  /** Pièces que l'on tire d'une feuille */
  parFeuille: number
  /** Feuilles à prendre pour toute la ligne */
  feuilles: number
  /** Feuille posée : bandes dans la largeur (a) et dans la longueur (b) */
  disposition: { sensLongueur: boolean; colonnes: number; rangees: number }
  /** Part de matière perdue sur les feuilles utilisées, en % */
  perte: number
  /** Surface restante de la dernière feuille, en mm² (une chute possible) */
  enStock: number
}

/** Nombre de bandes de la pièce qui entrent dans une feuille, et dans quel sens. */
export function fit(sheet: Pick<SheetOption, 'largeur' | 'longueur'>, piece: Pick<PieceNeed, 'developpe' | 'longueur'>) {
  // Sens 1 : la longueur de la pièce suit la longueur de la feuille
  const a = Math.floor(sheet.largeur / piece.developpe) * Math.floor(sheet.longueur / piece.longueur)
  // Sens 2 : la pièce est tournée d'un quart de tour
  const b = Math.floor(sheet.longueur / piece.developpe) * Math.floor(sheet.largeur / piece.longueur)
  return b > a
    ? { n: b, sensLongueur: false, colonnes: Math.floor(sheet.longueur / piece.developpe), rangees: Math.floor(sheet.largeur / piece.longueur) }
    : { n: a, sensLongueur: true, colonnes: Math.floor(sheet.largeur / piece.developpe), rangees: Math.floor(sheet.longueur / piece.longueur) }
}

/** Les feuilles du stock qui conviennent, de la meilleure à la moins bonne. Vide si aucune ne peut porter la pièce. */
export function adviseSheets(piece: PieceNeed, sheets: SheetOption[]): SheetAdvice[] {
  const out: SheetAdvice[] = []
  for (const s of sheets) {
    if (s.quantite <= 0) continue
    const f = fit(s, piece)
    if (f.n < 1) continue
    const feuilles = Math.ceil(piece.quantite / f.n)
    const surfaceUtile = piece.quantite * piece.developpe * piece.longueur
    const surfaceFeuilles = feuilles * s.largeur * s.longueur
    out.push({
      sheetId: s.id,
      libelle: s.libelle,
      chute: s.chute,
      feuilleLargeur: s.largeur,
      feuilleLongueur: s.longueur,
      parFeuille: f.n,
      feuilles,
      disposition: { sensLongueur: f.sensLongueur, colonnes: f.colonnes, rangees: f.rangees },
      perte: Math.round((1 - surfaceUtile / surfaceFeuilles) * 1000) / 10,
      enStock: s.quantite,
    })
  }
  // Assez de feuilles d'abord, puis chutes avant feuilles entières, puis moins de perte, puis moins de feuilles
  return out.sort((x, y) => Number(x.feuilles > x.enStock) - Number(y.feuilles > y.enStock) || Number(y.chute) - Number(x.chute) || x.perte - y.perte || x.feuilles - y.feuilles)
}
