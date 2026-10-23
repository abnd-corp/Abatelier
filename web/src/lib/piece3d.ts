import { profilePoints } from './orders'

// Pièce pliée en 3D : le profil vu en coupe, étiré sur sa longueur.
// Chaque segment devient une plaque (longueur du segment × épaisseur × longueur de la pièce),
// et chaque pli un cylindre qui fait la jonction entre deux plaques.

export interface PieceParts {
  plates: { x: number; y: number; len: number; angle: number }[]
  joints: { x: number; y: number }[]
  // Épaisseur dessinée : la vraie, grossie si besoin pour rester visible
  thickness: number
  // Longueur dessinée, raccourcie quand la pièce est très longue par rapport à son profil
  length: number
  shortened: boolean
  // Plus grande dimension du profil, pour cadrer la vue
  span: number
}

/** Dimensions en mm ; l'axe y monte (le dessin 2D, lui, a l'axe y vers le bas). */
export function pieceParts(cotes: number[], angles: number[], cap: number, longueur: number, epaisseur: number): PieceParts {
  const { pts, heads } = profilePoints(cotes, angles, cap)
  const up = pts.map(([x, y]) => [x, -y] as const)
  const xs = up.map((p) => p[0])
  const ys = up.map((p) => p[1])
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 20)
  const thickness = Math.max(epaisseur, span / 90)
  const plates = cotes.flatMap((len, i) => {
    const a = up[i]!
    const b = up[i + 1]!
    if (!(len > 0)) return []
    return [{ x: (a[0] + b[0]) / 2 - cx, y: (a[1] + b[1]) / 2 - cy, len: Math.max(Number(len) || 0, 0), angle: -heads[i]! }]
  })
  const joints = up.slice(1, -1).map(([x, y]) => ({ x: x - cx, y: y - cy }))
  const maxLength = span * 4
  const length = Math.max(Math.min(longueur || 0, maxLength), 1)
  return { plates, joints, thickness, length, shortened: longueur > maxLength, span }
}
