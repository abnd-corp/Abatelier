// Géométrie d'un profil plié vu en coupe. Même calcul que le front (web/src/lib/orders.ts).
//
// Chaque pli a un angle intérieur signé : négatif quand il se fait dans l'autre sens.
// Une pince (tôle repliée à plat sur elle-même, 0°) s'enregistre ±PINCE pour garder son sens :
// un vrai pli de 1° est impossible, la valeur ne peut donc pas prêter à confusion.
export const PINCE = 1
export const isPince = (a: number) => Math.abs(a) === PINCE

/** Points du profil, à partir des cotes et des angles signés ; `heads` : direction de chaque segment. */
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

type P = [number, number]
const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]]
const dot = (a: P, b: P) => a[0] * b[0] + a[1] * b[1]
const cross = (a: P, b: P) => a[0] * b[1] - a[1] * b[0]

/** Distance d'un point à un segment. */
function pointSegment(p: P, a: P, b: P) {
  const ab = sub(b, a)
  const len = dot(ab, ab)
  const t = len ? Math.max(0, Math.min(1, dot(sub(p, a), ab) / len)) : 0
  return Math.hypot(p[0] - a[0] - t * ab[0], p[1] - a[1] - t * ab[1])
}

/** Distance entre deux segments (0 s'ils se croisent). */
export function segmentDistance(a: P, b: P, c: P, d: P) {
  const r = sub(b, a)
  const s = sub(d, c)
  const den = cross(r, s)
  if (den !== 0) {
    const t = cross(sub(c, a), s) / den
    const u = cross(sub(c, a), r) / den
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0
  }
  return Math.min(pointSegment(a, c, d), pointSegment(b, c, d), pointSegment(c, a, b), pointSegment(d, a, b))
}

/**
 * Premiers segments non voisins qui se croisent ou se touchent (à moins d'une épaisseur de tôle) :
 * le profil se refermerait sur lui-même et ne pourrait pas être plié. Renvoie leurs index, ou null.
 * Deux segments voisins partagent un pli : ils ne comptent pas (une pince les met l'un sur l'autre).
 */
export function selfIntersection(cotes: number[], angles: number[], epaisseur: number): [number, number] | null {
  const { pts } = profilePoints(cotes, angles)
  const gap = Math.max(epaisseur, 0.5)
  for (let i = 0; i < cotes.length; i++)
    for (let j = i + 2; j < cotes.length; j++) {
      if (segmentDistance(pts[i]!, pts[i + 1]!, pts[j]!, pts[j + 1]!) < gap) return [i, j]
    }
  return null
}
