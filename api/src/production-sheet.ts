import PDFDocument from 'pdfkit'
import { clean, drawBrandMark } from './pdf.js'
import { isPince, profilePoints } from './profile.js'

// Fiche de fabrication imprimable (A4) pour l'atelier : les pièces à plier avec leur profil coté.
// Jamais de client ni de prix : les données reçues n'en contiennent pas.

export interface SheetLine {
  repere: string | null
  modeleLabel: string
  // Orientation du dessin (direction du premier segment, en degrés)
  cap: number
  materialLabel: string
  colorLabel: string
  colorHex: string
  cotes: number[]
  angles: number[]
  longueur: number
  quantite: number
  accessoires: { nom: string; unite: 'piece' | 'paire'; quantite: number }[]
}

export interface SheetData {
  numero: string
  statutLabel: string
  datePrevue: string | null
  livraisonMode: 'retrait' | 'livraison'
  imprimeLe: Date
  lignes: SheetLine[]
}

const PAGE = { w: 595.28, h: 841.89, m: 40 }
const RIGHT = PAGE.w - PAGE.m
const WIDTH = PAGE.w - 2 * PAGE.m
const FOOTER_H = 34
const BOTTOM = PAGE.h - PAGE.m - FOOTER_H
const INK = '#1d1f24'
const MUTED = '#6b7280'
const LINE = '#c9ccd3'
const ZEBRA = '#f3f4f6'
// Le profil est tracé en noir : un coloris clair (blanc, crème) disparaîtrait à l'impression
const STROKE = '#1d1f24'

const num = (n: number) => clean(n.toLocaleString('fr-FR', { maximumFractionDigits: 1 }))
export const letter = (i: number) => String.fromCharCode(65 + i)
const longDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const stamp = (d: Date) =>
  `${d.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })}`

/** Accessoires de toute la commande, regroupés, pour les préparer d'un coup. */
export function accessoryTotals(lignes: SheetLine[]) {
  const map = new Map<string, { nom: string; unite: 'piece' | 'paire'; quantite: number }>()
  for (const l of lignes)
    for (const a of l.accessoires) {
      if (!a.quantite) continue
      const key = `${a.nom}|${a.unite}`
      const cur = map.get(key)
      if (cur) cur.quantite += a.quantite
      else map.set(key, { ...a })
    }
  return [...map.values()]
}

export function renderProductionSheet(data: SheetData, opts: { accent: string; logo: Buffer | null }): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: PAGE.m, bufferPages: true, info: { Title: clean(`Fiche de fabrication ${data.numero}`) } })
  const chunks: Buffer[] = []
  doc.on('data', (c: Buffer) => chunks.push(c))
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })
  const accent = opts.accent
  const text = (s: string, x: number, y: number, o: PDFKit.Mixins.TextOptions = {}) => doc.text(clean(s), x, y, o)
  const pieces = data.lignes.reduce((s, l) => s + l.quantite, 0)

  // --- En-tête ---
  if (opts.logo) doc.image(opts.logo, PAGE.m, PAGE.m - 2, { fit: [110, 40] })
  else drawBrandMark(doc, PAGE.m, PAGE.m - 2, 40)
  doc.font('Helvetica-Bold').fontSize(18).fillColor(accent)
  text('FICHE DE FABRICATION', PAGE.m + 150, PAGE.m - 2, { width: WIDTH - 150, align: 'right', characterSpacing: 0.8 })
  doc.font('Helvetica-Bold').fontSize(13).fillColor(INK)
  text(`N° ${data.numero}`, PAGE.m + 150, doc.y + 2, { width: WIDTH - 150, align: 'right' })

  let y = PAGE.m + 56
  const cells: [string, string][] = [
    ['PRÉVUE LE', data.datePrevue ? longDay(data.datePrevue) : 'Non fixée'],
    ['PIÈCES', `${pieces} pièce${pieces > 1 ? 's' : ''} · ${data.lignes.length} ligne${data.lignes.length > 1 ? 's' : ''}`],
    ['DÉPART', data.livraisonMode === 'retrait' ? 'Retrait à l’atelier' : 'Livraison sur chantier'],
    ['ÉTAPE', data.statutLabel],
  ]
  const cw = WIDTH / cells.length
  doc.roundedRect(PAGE.m, y, WIDTH, 44, 6).fill(ZEBRA)
  cells.forEach(([label, value], i) => {
    const x = PAGE.m + i * cw + 12
    doc.font('Helvetica-Bold').fontSize(7).fillColor(MUTED)
    text(label, x, y + 9, { width: cw - 20, characterSpacing: 0.7 })
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(INK)
    text(value, x, y + 21, { width: cw - 20, lineBreak: false, ellipsis: true })
  })
  y += 58

  const continued = () => {
    doc.addPage()
    doc.font('Helvetica-Bold').fontSize(10).fillColor(accent)
    text(`${data.numero} · suite`, PAGE.m, PAGE.m)
    y = PAGE.m + 22
  }

  // --- Pièces ---
  const SK_W = 190
  const SK_H = 134
  const PAD = 12
  const infoX = PAGE.m + PAD + SK_W + 16
  const infoW = RIGHT - PAD - infoX
  const labelW = 70
  const valueX = infoX + labelW
  const valueW = infoW - labelW

  // Liste de petits éléments côte à côte (cotes, plis), sur plusieurs lignes si besoin
  type Chip = { strong?: string; rest: string; arrow?: 1 | -1 }
  const chipWidth = (c: Chip) => {
    doc.font('Helvetica-Bold').fontSize(9.5)
    let w = c.strong ? doc.widthOfString(clean(c.strong)) + 3 : 0
    doc.font('Helvetica').fontSize(9.5)
    w += doc.widthOfString(clean(c.rest))
    return w + (c.arrow ? 10 : 0)
  }
  const layoutChips = (chips: Chip[]) => {
    const pos: { c: Chip; x: number; row: number }[] = []
    let x = 0
    let row = 0
    for (const c of chips) {
      const w = chipWidth(c)
      if (x > 0 && x + w > valueW) {
        x = 0
        row++
      }
      pos.push({ c, x, row })
      x += w + 12
    }
    return { pos, height: (row + 1) * 13 }
  }
  const drawChips = (chips: Chip[], y0: number) => {
    const { pos, height } = layoutChips(chips)
    for (const { c, x, row } of pos) {
      let cx = valueX + x
      const cy = y0 + row * 13
      if (c.strong) {
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor(accent)
        text(c.strong, cx, cy, { lineBreak: false })
        cx += doc.widthOfString(clean(c.strong)) + 3
      }
      doc.font('Helvetica').fontSize(9.5).fillColor(INK)
      text(c.rest, cx, cy, { lineBreak: false })
      cx += doc.widthOfString(clean(c.rest))
      if (c.arrow) {
        // Flèche vers le haut ou le bas : sens du pli (négatif = pli dans l'autre sens)
        const ax = cx + 5
        const ay = cy + 4.5
        doc.polygon(...((c.arrow > 0 ? [[ax - 3, ay + 2.5], [ax + 3, ay + 2.5], [ax, ay - 2.5]] : [[ax - 3, ay - 2.5], [ax + 3, ay - 2.5], [ax, ay + 2.5]]) as [number, number][])).fill(INK)
      }
    }
    return height
  }

  const accessoryText = (l: SheetLine) =>
    l.accessoires
      .filter((a) => a.quantite > 0)
      .map((a) => `${a.quantite} × ${a.nom}${a.unite === 'paire' ? ' (paire)' : ''}`)
      .join('\n')

  // Rangées de lignes d'information d'une pièce : [libellé, hauteur, dessin]
  const rowsOf = (l: SheetLine) => {
    const rows: { label: string; h: number; draw: (y0: number) => void }[] = []
    const cotes: Chip[] = l.cotes.map((c, j) => ({ strong: letter(j), rest: num(c) }))
    rows.push({ label: 'Cotes (mm)', h: layoutChips(cotes).height, draw: (y0) => drawChips(cotes, y0) })
    if (l.angles.length) {
      const plis: Chip[] = l.angles.map((a, j) => ({ strong: `${j + 1}.`, rest: isPince(a) ? 'pince' : `${Math.abs(a)}°`, arrow: a < 0 ? -1 : 1 }))
      rows.push({ label: 'Plis', h: layoutChips(plis).height, draw: (y0) => drawChips(plis, y0) })
    }
    const dev = `${num(l.cotes.reduce((s, v) => s + v, 0))} mm`
    rows.push({ label: 'Développé', h: 13, draw: (y0) => (doc.font('Helvetica').fontSize(9.5).fillColor(INK), text(dev, valueX, y0)) })
    const acc = accessoryText(l)
    if (acc) {
      doc.font('Helvetica').fontSize(9.5)
      const h = doc.heightOfString(clean(acc), { width: valueW })
      rows.push({ label: 'Accessoires', h, draw: (y0) => (doc.font('Helvetica').fontSize(9.5).fillColor(INK), text(acc, valueX, y0, { width: valueW })) })
    }
    return rows
  }

  const TALLY_MAX = 40
  const tallyHeight = (n: number) => (n <= TALLY_MAX ? Math.ceil(n / Math.floor(infoW / 15)) * 15 : 15)

  data.lignes.forEach((l, i) => {
    const rows = rowsOf(l)
    const titleH = 52
    const infoH = titleH + rows.reduce((s, r) => s + r.h + 5, 0) + 18 + tallyHeight(l.quantite)
    const h = Math.max(SK_H, infoH) + 2 * PAD
    if (y + h > BOTTOM) continued()
    const top = y
    doc.roundedRect(PAGE.m, top, WIDTH, h, 6).lineWidth(0.8).strokeColor(LINE).stroke()

    // Case « fait » pour toute la ligne, en haut à droite
    doc.rect(RIGHT - PAD - 16, top + PAD, 16, 16).lineWidth(1.2).strokeColor(INK).stroke()
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(MUTED)
    text('FAIT', RIGHT - PAD - 52, top + PAD + 5, { width: 30, align: 'right', characterSpacing: 0.6 })

    drawProfile(doc, l, l.cap, PAGE.m + PAD, top + PAD, SK_W, SK_H, accent)

    // Titre et quantité
    let yy = top + PAD
    doc.font('Helvetica-Bold').fontSize(11).fillColor(INK)
    text(`${i + 1}. ${l.modeleLabel}${l.repere ? ` · ${l.repere}` : ''}`, infoX, yy, { width: infoW - 60, lineBreak: false, ellipsis: true })
    doc.font('Helvetica-Bold').fontSize(12).fillColor(accent)
    const qty = `${num(l.quantite)} × ${num(l.longueur)} mm`
    text(qty, infoX, yy + 15, { lineBreak: false })
    yy += 32
    doc.rect(infoX, yy + 0.5, 9, 9).fill(l.colorHex)
    doc.rect(infoX, yy + 0.5, 9, 9).lineWidth(0.5).strokeColor(LINE).stroke()
    doc.font('Helvetica').fontSize(9.5).fillColor(INK)
    text(`${l.materialLabel} · ${l.colorLabel}`, infoX + 15, yy, { width: infoW - 15, height: 12, ellipsis: true })
    yy += 20

    for (const r of rows) {
      doc.font('Helvetica').fontSize(8.5).fillColor(MUTED)
      text(r.label, infoX, yy + 1, { width: labelW - 6, lineBreak: false })
      r.draw(yy)
      yy += r.h + 5
    }

    // Une case par pièce à cocher au fur et à mesure (ou un compteur au-delà de 40 pièces)
    yy += 6
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(MUTED)
    text('PIÈCES PLIÉES', infoX, yy, { characterSpacing: 0.6 })
    yy += 12
    if (l.quantite <= TALLY_MAX) {
      const perRow = Math.floor(infoW / 15)
      for (let k = 0; k < l.quantite; k++) doc.rect(infoX + (k % perRow) * 15, yy + Math.floor(k / perRow) * 15, 11, 11).lineWidth(0.8).strokeColor(INK).stroke()
    } else {
      doc.font('Helvetica').fontSize(10).fillColor(INK)
      text(`______ / ${num(l.quantite)}`, infoX, yy)
    }
    y = top + h + 10
  })

  // --- Récapitulatif et visa ---
  const acc = accessoryTotals(data.lignes)
  if (acc.length) {
    const h = 26 + acc.length * 15
    if (y + h > BOTTOM) continued()
    doc.font('Helvetica-Bold').fontSize(10).fillColor(accent)
    text('Accessoires à préparer', PAGE.m, y)
    y += 18
    for (const a of acc) {
      doc.rect(PAGE.m, y, 10, 10).lineWidth(0.8).strokeColor(INK).stroke()
      doc.font('Helvetica').fontSize(9.5).fillColor(INK)
      text(`${a.quantite} × ${a.nom}${a.unite === 'paire' ? ' (paires)' : ''}`, PAGE.m + 18, y + 1)
      y += 15
    }
    y += 10
  }
  if (y + 60 > BOTTOM) continued()
  const vw = (WIDTH - 20) / 3
  ;['Plié par', 'Contrôlé par', 'Date'].forEach((label, i) => {
    const x = PAGE.m + i * (vw + 10)
    doc.roundedRect(x, y, vw, 50, 5).lineWidth(0.8).strokeColor(LINE).stroke()
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(MUTED)
    text(label.toUpperCase(), x + 10, y + 8, { characterSpacing: 0.6 })
  })

  // --- Pied de page ---
  const range = doc.bufferedPageRange()
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i)
    const margin = doc.page.margins.bottom
    doc.page.margins.bottom = 0
    const fy = PAGE.h - PAGE.m - FOOTER_H + 14
    doc.moveTo(PAGE.m, fy).lineTo(RIGHT, fy).lineWidth(0.6).strokeColor(LINE).stroke()
    doc.font('Helvetica').fontSize(7.5).fillColor(MUTED)
    text(`${data.numero} · Fiche de fabrication · imprimée le ${stamp(data.imprimeLe)}`, PAGE.m, fy + 8, { width: WIDTH - 60, lineBreak: false })
    text(`${i + 1} / ${range.count}`, RIGHT - 60, fy + 8, { width: 60, align: 'right', lineBreak: false })
    doc.page.margins.bottom = margin
  }

  doc.end()
  return done
}

/** Profil vu en coupe, mis à l'échelle dans le cadre, avec les cotes (A, B…) et les angles. */
function drawProfile(doc: PDFKit.PDFDocument, l: SheetLine, cap: number, bx: number, by: number, bw: number, bh: number, accent: string) {
  doc.roundedRect(bx, by, bw, bh, 5).fill(ZEBRA)
  const { pts, heads } = profilePoints(l.cotes, l.angles, cap)
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const spanX = Math.max(...xs) - minX
  const spanY = Math.max(...ys) - minY
  const pad = 30
  const s = Math.min((bw - 2 * pad) / Math.max(spanX, 1), (bh - 2 * pad) / Math.max(spanY, 1))
  const ox = bx + (bw - spanX * s) / 2
  const oy = by + (bh - spanY * s) / 2
  const P = pts.map(([x, y]) => [ox + (x - minX) * s, oy + (y - minY) * s] as [number, number])
  const cx = P.reduce((t, p) => t + p[0], 0) / P.length
  const cy = P.reduce((t, p) => t + p[1], 0) / P.length

  doc.save()
  doc.moveTo(...P[0]!)
  for (const p of P.slice(1)) doc.lineTo(...p)
  doc.lineWidth(2.2).lineJoin('round').lineCap('round').strokeColor(STROKE).stroke()
  // Point de départ, pour lire les cotes dans l'ordre
  doc.circle(...P[0]!, 2.6).fill(accent)

  // Étiquettes déjà posées : une nouvelle qui en chevauche une est repoussée dans sa direction
  const placed: [number, number, number, number][] = []
  const overlaps = (r: [number, number, number, number]) => placed.some((q) => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1])
  const label = (s: string, x: number, y: number, dx: number, dy: number, color: string, bold: boolean, size: number) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size)
    const w = doc.widthOfString(s)
    const rectAt = (k: number): [number, number, number, number] => {
      const cx = x + dx * k
      const cy = y + dy * k
      return [cx - w / 2 - 1.5, cy - size / 2 - 1, cx + w / 2 + 1.5, cy + size / 2 + 1]
    }
    const inside = (r: [number, number, number, number]) => r[0] >= bx && r[1] >= by && r[2] <= bx + bw && r[3] <= by + bh
    // Positions essayées : prévue, puis de plus en plus loin de part et d'autre
    const tries = [0, ...Array.from({ length: 14 }, (_, i) => (i % 2 ? -1 : 1) * 3 * (Math.floor(i / 2) + 1))]
    const k = tries.find((t) => inside(rectAt(t)) && !overlaps(rectAt(t))) ?? tries.find((t) => !overlaps(rectAt(t))) ?? 0
    const r = rectAt(k)
    placed.push(r)
    doc.rect(r[0], r[1], r[2] - r[0], r[3] - r[1]).fill(ZEBRA)
    doc.fillColor(color).text(s, r[0] + 1.5, r[1] + 1.5, { lineBreak: false })
  }

  // Cotes : lettre et valeur au milieu du segment, côté extérieur
  l.cotes.forEach((len, i) => {
    const a = P[i]!
    const b = P[i + 1]!
    const h = heads[i]!
    const mx = (a[0] + b[0]) / 2
    const my = (a[1] + b[1]) / 2
    let nx = -Math.sin(h)
    let ny = Math.cos(h)
    if (nx * (mx - cx) + ny * (my - cy) < 0) {
      nx = -nx
      ny = -ny
    }
    label(clean(`${letter(i)} ${num(len)}`), mx + nx * 10, my + ny * 10, nx, ny, INK, true, 7.5)
  })
  // Angles : petit arc et valeur dans la bissectrice
  l.angles.forEach((a, i) => {
    const v = P[i + 1]!
    const p1 = P[i]!
    const p2 = P[i + 2]
    if (!p2) return
    const u1 = [p1[0] - v[0], p1[1] - v[1]]
    const u2 = [p2[0] - v[0], p2[1] - v[1]]
    const n1 = Math.hypot(u1[0]!, u1[1]!)
    const n2 = Math.hypot(u2[0]!, u2[1]!)
    if (!n1 || !n2) return
    const e1 = [u1[0]! / n1, u1[1]! / n1] as const
    const e2 = [u2[0]! / n2, u2[1]! / n2] as const
    const bis = [e1[0] + e2[0], e1[1] + e2[1]]
    const bn = Math.hypot(bis[0]!, bis[1]!)
    if (bn < 1e-3) return
    const r = 7
    const a1 = Math.atan2(e1[1], e1[0])
    let a2 = Math.atan2(e2[1], e2[0])
    // Arc par le petit côté (l'angle intérieur)
    let d = a2 - a1
    while (d > Math.PI) d -= 2 * Math.PI
    while (d < -Math.PI) d += 2 * Math.PI
    a2 = a1 + d
    const steps = 10
    doc.moveTo(v[0] + Math.cos(a1) * r, v[1] + Math.sin(a1) * r)
    for (let k = 1; k <= steps; k++) {
      const t = a1 + (d * k) / steps
      doc.lineTo(v[0] + Math.cos(t) * r, v[1] + Math.sin(t) * r)
    }
    doc.lineWidth(0.6).strokeColor(MUTED).stroke()
    label(isPince(a) ? 'pince' : `${Math.abs(a)}°`, v[0] + (bis[0]! / bn) * 16, v[1] + (bis[1]! / bn) * 16, bis[0]! / bn, bis[1]! / bn, MUTED, false, 7)
  })

  doc.restore()
}
