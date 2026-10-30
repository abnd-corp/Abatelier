import PDFDocument from 'pdfkit'
import { clean, drawBrandMark } from './pdf.js'
import { isPince, profilePoints } from './profile.js'
import type { SheetAdvice } from './cutting.js'

// Fiche de fabrication imprimable (A4) pour l'atelier : le rendu des pièces, puis l'ordre de fabrication feuille par feuille
// (récupérer la feuille, toutes les découpes, tous les pliages, mettre de côté), avec la chute à garder ou à jeter. Sans QR code.
// Jamais de client ni de prix : les données reçues n'en contiennent pas.

export interface SheetLine {
  id?: string
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
  // Feuille conseillée d'après le stock (null : rien en stock qui convienne, ou article de la boutique)
  decoupe?: SheetAdvice | null
}

export interface SheetData {
  numero: string
  // Nom du client, seul renseignement sur lui que reçoit l'atelier
  client: string
  statutLabel: string
  // Date de création de la commande : l'atelier n'a plus d'estimation de délai
  creeLe: Date
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
const longDate = (d: Date) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' })
const stamp = (d: Date) => `${d.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })}`

/** Accessoires de toute la commande, regroupés, pour les préparer d'un coup. */
export function accessoryTotals(lignes: SheetLine[]) {
  const map = new Map<string, { nom: string; unite: 'piece' | 'paire'; quantite: number; couleur: string }>()
  for (const l of lignes)
    for (const a of l.accessoires) {
      if (!a.quantite) continue
      // Un accessoire se vend par coloris (bouchon, éclisse…) : il suit celui de la pièce
      const key = `${a.nom}|${a.unite}|${l.colorLabel}`
      const cur = map.get(key)
      if (cur) cur.quantite += a.quantite
      else map.set(key, { ...a, couleur: l.colorLabel })
    }
  return [...map.values()]
}

/** Chutes à garder : un morceau dont le plus petit côté atteint cette valeur (mm) peut encore servir ; en dessous, il part au rebut. */
export const CHUTE_MIN = 200

export interface Chute {
  /** Dimensions dans le repère de la feuille (largeur × longueur), en mm */
  largeur: number
  longueur: number
  garder: boolean
}

/**
 * Morceaux qui restent des feuilles d'une ligne une fois les bandes découpées. Les bandes sont posées rangée par rangée (comme sur le plan de découpe),
 * la dernière feuille pouvant en porter moins que les autres ; ce qui reste se coupe en rectangles à la guillotine.
 */
export function chutesOf(l: Pick<SheetLine, 'cotes' | 'longueur' | 'quantite'>, d: SheetAdvice, min = CHUTE_MIN): Chute[] {
  const dev = l.cotes.reduce((s, v) => s + v, 0)
  const sensLongueur = d.disposition.sensLongueur
  // Taille d'une bande dans le repère de la feuille : le long de sa longueur, puis le long de sa largeur
  const celluleL = sensLongueur ? l.longueur : dev
  const celluleW = sensLongueur ? dev : l.longueur
  // Bandes par rangée (le long de la longueur de la feuille)
  const nx = sensLongueur ? d.disposition.rangees : d.disposition.colonnes
  const out: Chute[] = []
  const push = (longueur: number, largeur: number) => {
    if (longueur < 1 || largeur < 1) return
    out.push({ largeur: Math.round(largeur), longueur: Math.round(longueur), garder: Math.min(longueur, largeur) >= min })
  }
  for (let s = 0; s < d.feuilles; s++) {
    const k = s < d.feuilles - 1 ? d.parFeuille : l.quantite - (d.feuilles - 1) * d.parFeuille
    const rangees = Math.ceil(k / nx)
    const derniere = k - (rangees - 1) * nx
    push(d.feuilleLongueur, d.feuilleLargeur - rangees * celluleW)
    if (derniere === nx) push(d.feuilleLongueur - nx * celluleL, rangees * celluleW)
    else {
      push(d.feuilleLongueur - nx * celluleL, (rangees - 1) * celluleW)
      push(d.feuilleLongueur - derniere * celluleL, celluleW)
    }
  }
  return out
}

/** Les mêmes morceaux regroupés (« 2 × 290 × 3 000 mm »), le plus grand d'abord. */
export function groupChutes(chutes: Chute[]) {
  const map = new Map<string, Chute & { nombre: number }>()
  for (const c of chutes) {
    const key = `${c.largeur}x${c.longueur}`
    const cur = map.get(key)
    if (cur) cur.nombre++
    else map.set(key, { ...c, nombre: 1 })
  }
  return [...map.values()].sort((a, b) => b.largeur * b.longueur - a.largeur * a.longueur)
}

/** Les lignes à découper, rangées par feuille : on prend une feuille, on fait toutes ses découpes, puis tous ses pliages, avant de passer à la suivante. */
export function sheetGroups(lignes: SheetLine[]) {
  const groups: { key: string; label: string; lignes: { l: SheetLine; i: number }[] }[] = []
  lignes.forEach((l, i) => {
    if (!l.cotes.length) return
    const key = l.decoupe ? `feuille:${l.decoupe.sheetId}` : `matiere:${l.materialLabel}|${l.colorLabel}`
    let g = groups.find((x) => x.key === key)
    if (!g) groups.push((g = { key, label: [l.materialLabel, l.colorLabel].filter(Boolean).join(' · '), lignes: [] }))
    g.lignes.push({ l, i })
  })
  return groups
}

const DEVELOPPE = (l: Pick<SheetLine, 'cotes'>) => l.cotes.reduce((s, v) => s + v, 0)
const m2 = (mm2: number) => clean((mm2 / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 2 }))

export function renderProductionSheet(data: SheetData, opts: { accent: string; logo: Buffer | null; chuteMin?: number }): Promise<Buffer> {
  const chuteMin = opts.chuteMin ?? CHUTE_MIN
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
  doc.font('Helvetica').fontSize(10).fillColor(MUTED)
  text(`Client : ${data.client}`, PAGE.m + 150, doc.y + 2, { width: WIDTH - 150, align: 'right', lineBreak: false, ellipsis: true })

  let y = PAGE.m + 70
  const cells: [string, string][] = [
    ['CRÉÉE LE', longDate(data.creeLe)],
    ['PIÈCES', `${pieces} pièce${pieces > 1 ? 's' : ''} · ${data.lignes.length} ligne${data.lignes.length > 1 ? 's' : ''}`],
    ['REMISE', data.livraisonMode === 'retrait' ? 'Retrait à l’atelier' : 'Livraison sur chantier'],
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
  const need = (h: number) => {
    if (y + h > BOTTOM) continued()
  }
  const section = (titre: string, note?: string) => {
    need(60)
    doc.font('Helvetica-Bold').fontSize(11).fillColor(accent)
    text(titre.toUpperCase(), PAGE.m, y, { characterSpacing: 0.8, lineBreak: false })
    if (note) {
      doc.font('Helvetica').fontSize(8.5).fillColor(MUTED)
      text(note, PAGE.m + 150, y + 2, { width: WIDTH - 150, align: 'right', lineBreak: false })
    }
    doc
      .moveTo(PAGE.m, y + 16)
      .lineTo(RIGHT, y + 16)
      .lineWidth(0.8)
      .strokeColor(accent)
      .stroke()
    y += 26
  }
  const box = (x: number, yy: number, s = 11) => doc.rect(x, yy, s, s).lineWidth(1).strokeColor(INK).stroke()

  const SK_W = 190
  const SK_H = 134
  const DG_H = 56
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
  const layoutChips = (chips: Chip[], maxW: number) => {
    const pos: { c: Chip; x: number; row: number }[] = []
    let x = 0
    let row = 0
    for (const c of chips) {
      const w = chipWidth(c)
      if (x > 0 && x + w > maxW) {
        x = 0
        row++
      }
      pos.push({ c, x, row })
      x += w + 12
    }
    return { pos, height: (row + 1) * 13 }
  }
  const drawChips = (chips: Chip[], x0: number, y0: number, maxW: number) => {
    const { pos, height } = layoutChips(chips, maxW)
    for (const { c, x, row } of pos) {
      let cx = x0 + x
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
        doc
          .polygon(
            ...((c.arrow > 0
              ? [
                  [ax - 3, ay + 2.5],
                  [ax + 3, ay + 2.5],
                  [ax, ay - 2.5],
                ]
              : [
                  [ax - 3, ay - 2.5],
                  [ax + 3, ay - 2.5],
                  [ax, ay + 2.5],
                ]) as [number, number][]),
          )
          .fill(INK)
      }
    }
    return height
  }
  const plisOf = (l: SheetLine): Chip[] => l.angles.map((a, j) => ({ strong: `${j + 1}.`, rest: isPince(a) ? 'pince' : `${Math.abs(a)}°`, arrow: a < 0 ? -1 : 1 }))

  const accessoryText = (l: SheetLine) =>
    l.accessoires
      .filter((a) => a.quantite > 0)
      .map((a) => `${a.quantite} × ${a.nom}${l.colorLabel ? ` · ${l.colorLabel}` : ''}${a.unite === 'paire' ? ' (paire)' : ''}`)
      .join('\n')

  // Une boîte de texte : sa hauteur d'abord (pour savoir si elle tient), puis son dessin
  const heightOf = (s: string, w: number, size = 9.5, bold = false) => (doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size), doc.heightOfString(clean(s), { width: w }))
  const para = (s: string, x: number, yy: number, w: number, o: { size?: number; bold?: boolean; color?: string } = {}) => {
    doc
      .font(o.bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(o.size ?? 9.5)
      .fillColor(o.color ?? INK)
    text(s, x, yy, { width: w })
  }

  // Une case par pièce à cocher au fur et à mesure (ou un compteur au-delà de 40)
  const TALLY_MAX = 40
  const tallyHeight = (n: number, w: number) => 12 + (n <= TALLY_MAX ? Math.ceil(n / Math.floor(w / 15)) * 15 : 15)
  const tally = (titre: string, n: number, x: number, yy: number, w: number) => {
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(MUTED)
    text(titre, x, yy, { characterSpacing: 0.6, lineBreak: false })
    const top = yy + 12
    if (n <= TALLY_MAX) {
      const perRow = Math.floor(w / 15)
      for (let k = 0; k < n; k++) box(x + (k % perRow) * 15, top + Math.floor(k / perRow) * 15)
    } else {
      doc.font('Helvetica').fontSize(10).fillColor(INK)
      text(`______ / ${num(n)}`, x, top)
    }
  }

  // ═════════ 1. Les pièces : le rendu de chacune ═════════
  section('Les pièces', `${pieces} pièce${pieces > 1 ? 's' : ''} à fabriquer`)

  const rowsOf = (l: SheetLine) => {
    const rows: { label: string; h: number; draw: (y0: number) => void }[] = []
    // Article de la boutique : rien à plier, seulement à préparer
    if (!l.cotes.length) return rows
    const cotes: Chip[] = l.cotes.map((c, j) => ({ strong: letter(j), rest: num(c) }))
    rows.push({ label: 'Cotes (mm)', h: layoutChips(cotes, valueW).height, draw: (y0) => drawChips(cotes, valueX, y0, valueW) })
    if (l.angles.length) {
      const plis = plisOf(l)
      rows.push({ label: 'Plis', h: layoutChips(plis, valueW).height, draw: (y0) => drawChips(plis, valueX, y0, valueW) })
    }
    const dev = `${num(DEVELOPPE(l))} mm`
    rows.push({ label: 'Développé', h: 13, draw: (y0) => (doc.font('Helvetica').fontSize(9.5).fillColor(INK), text(dev, valueX, y0)) })
    const acc = accessoryText(l)
    if (acc) rows.push({ label: 'Accessoires', h: heightOf(acc, valueW), draw: (y0) => para(acc, valueX, y0, valueW) })
    return rows
  }

  data.lignes.forEach((l, i) => {
    const rows = rowsOf(l)
    const infoH = 52 + rows.reduce((s, r) => s + r.h + 5, 0)
    const h = Math.max(SK_H, infoH) + 2 * PAD
    need(h + 10)
    const top = y
    doc.roundedRect(PAGE.m, top, WIDTH, h, 6).lineWidth(0.8).strokeColor(LINE).stroke()

    if (l.cotes.length) drawProfile(doc, l, l.cap, PAGE.m + PAD, top + PAD, SK_W, SK_H, accent)
    else {
      doc.roundedRect(PAGE.m + PAD, top + PAD, SK_W, SK_H, 6).fill(ZEBRA)
      doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED)
      text('ARTICLE DE LA BOUTIQUE', PAGE.m + PAD, top + PAD + SK_H / 2 - 5, { width: SK_W, align: 'center', characterSpacing: 0.6 })
    }

    let yy = top + PAD
    doc.font('Helvetica-Bold').fontSize(11).fillColor(INK)
    text(`${i + 1}. ${l.modeleLabel}${l.repere ? ` · ${l.repere}` : ''}`, infoX, yy, { width: infoW, lineBreak: false, ellipsis: true })
    doc.font('Helvetica-Bold').fontSize(12).fillColor(accent)
    text(l.cotes.length ? `${num(l.quantite)} × ${num(l.longueur)} mm` : `${num(l.quantite)} × à préparer`, infoX, yy + 15, { lineBreak: false })
    yy += 32
    if (l.cotes.length) {
      doc.rect(infoX, yy + 0.5, 9, 9).fill(l.colorHex)
      doc
        .rect(infoX, yy + 0.5, 9, 9)
        .lineWidth(0.5)
        .strokeColor(LINE)
        .stroke()
    }
    doc.font('Helvetica').fontSize(9.5).fillColor(INK)
    text([l.materialLabel, l.colorLabel].filter(Boolean).join(' · '), infoX + (l.cotes.length ? 15 : 0), yy, { width: infoW - 15, height: 12, ellipsis: true })
    yy += 20
    for (const r of rows) {
      doc.font('Helvetica').fontSize(8.5).fillColor(MUTED)
      text(r.label, infoX, yy + 1, { width: labelW - 6, lineBreak: false })
      r.draw(yy)
      yy += r.h + 5
    }
    y = top + h + 10
  })

  // ═════════ 2. Ordre de fabrication, feuille par feuille ═════════
  const groups = sheetGroups(data.lignes)
  const DG_W = 190
  const BAND_H = 46
  const TH_W = 84
  const TH_H = 64
  const IND = PAGE.m + 8
  groups.forEach((g, gi) => {
    y += 6
    section(`Feuille ${gi + 1} sur ${groups.length}`, g.label)
    const sub = (n: number, titre: string, note: string) => {
      need(18 + 40)
      doc.font('Helvetica-Bold').fontSize(10).fillColor(INK)
      text(`${n}. ${titre}`, PAGE.m, y, { lineBreak: false })
      doc.font('Helvetica').fontSize(8.5).fillColor(MUTED)
      text(note, PAGE.m + 150, y + 1, { width: WIDTH - 150, align: 'right', lineBreak: false })
      y += 18
    }

    // Récupérer la feuille
    sub(1, 'Récupérer la matière', 'avant de commencer')
    for (const { l, i } of g.lignes) {
      const d = l.decoupe
      const t = d
        ? `${d.feuilles} × feuille ${num(d.feuilleLargeur)} × ${num(d.feuilleLongueur)} mm${d.chute ? ' (une chute du stock)' : ''} · pièce ${i + 1}${d.feuilles > d.enStock ? ` · attention, ${d.enStock} seulement en stock` : ''}`
        : `Feuille à choisir : ${l.materialLabel}, ${l.colorLabel} · pièce ${i + 1} (aucune feuille conseillée en stock)`
      const h = Math.max(15, heightOf(t, WIDTH - 30) + 4)
      need(h)
      box(IND, y + 1)
      para(t, IND + 20, y + 1, WIDTH - 30)
      y += h
    }
    y += 6

    // Toutes les découpes d'abord
    sub(2, 'Découper', 'toutes les découpes d’abord')
    for (const { l, i } of g.lignes) {
      const d = l.decoupe
      const dev = DEVELOPPE(l)
      const leftW = WIDTH - DG_W - 24
      const titre = `Pièce ${i + 1} · ${l.modeleLabel}${l.repere ? ` · ${l.repere}` : ''}`
      const consigne = `${num(l.quantite)} bande${l.quantite > 1 ? 's' : ''} de ${num(dev)} mm de large × ${num(l.longueur)} mm de long`
      const pose = d
        ? `${d.parFeuille} bande${d.parFeuille > 1 ? 's' : ''} par feuille, ${d.disposition.sensLongueur ? 'dans le sens de la longueur de la feuille' : 'feuille tournée d’un quart de tour'}`
        : ''
      const hText = heightOf(titre, leftW, 9.5, true) + 2 + heightOf(consigne, leftW) + (pose ? 2 + heightOf(pose, leftW, 9) : 0)
      const leftOnly = WIDTH - DG_W - 24
      const rightH = (d ? DG_H + 6 : 0) + BAND_H
      const h = Math.max(hText + 6 + tallyHeight(l.quantite, leftOnly), rightH) + 8
      need(h)
      const top = y
      para(titre, IND, top, leftW, { bold: true })
      let yy = top + heightOf(titre, leftW, 9.5, true) + 2
      para(consigne, IND, yy, leftW, { color: accent, bold: true })
      yy += heightOf(consigne, leftW, 9.5, true) + 2
      if (pose) {
        para(pose, IND, yy, leftW, { size: 9, color: MUTED })
        yy += heightOf(pose, leftW, 9) + 2
      }
      tally('BANDES DÉCOUPÉES', l.quantite, IND, yy + 4, leftW)
      if (d) drawCutting(doc, l, d, RIGHT - DG_W, top, DG_W, DG_H, accent)
      // La bande à plat, toujours : même sans feuille conseillée, on voit ce qu'on découpe et où seront les plis
      drawBand(doc, l, RIGHT - DG_W, top + (d ? DG_H + 6 : 0), DG_W, BAND_H)
      y = top + h
    }

    // Tous les pliages ensuite
    const aPlier = g.lignes.filter(({ l }) => l.angles.length)
    if (aPlier.length) {
      y += 4
      sub(3, 'Plier', 'puis tous les pliages')
      for (const { l, i } of aPlier) {
        const w = WIDTH - 20
        const titre = `Pièce ${i + 1} · ${l.modeleLabel}${l.repere ? ` · ${l.repere}` : ''}`
        const consigne = `${l.angles.length} pli${l.angles.length > 1 ? 's' : ''} à la presse, dans l’ordre 1 à ${l.angles.length} (voir le rendu de la pièce)`
        const plis = plisOf(l)
        // Distance de chaque trait de pli depuis le bord, sur la bande à plat
        let cumul = 0
        const traits = l.cotes.slice(0, -1).map((c) => (cumul += c))
        const posTraits = `Traits de pli à partir du bord (mm) : ${traits.map((t) => num(t)).join(' · ')}`
        const hc = layoutChips(plis, w).height
        const perRow = Math.floor((w + 8) / (TH_W + 8))
        const hThumbs = Math.ceil(l.angles.length / perRow) * (TH_H + 18)
        const h = heightOf(titre, w, 9.5, true) + 2 + heightOf(consigne, w) + 3 + hc + 6 + hThumbs + heightOf(posTraits, w, 9) + 4 + tallyHeight(l.quantite, w) + 10
        need(h)
        const top = y
        para(titre, IND, top, w, { bold: true })
        let yy = top + heightOf(titre, w, 9.5, true) + 2
        para(consigne, IND, yy, w)
        yy += heightOf(consigne, w) + 3
        yy += drawChips(plis, IND, yy, w) + 6
        // La pièce après chaque pli : en trait plein ce qui est plié, en pointillé ce qui reste à plat
        const steps = bendSteps(l)
        const sc = bendScale(steps, TH_W, TH_H)
        steps.forEach((st, k) => {
          const bx = IND + (k % perRow) * (TH_W + 8)
          const by = yy + Math.floor(k / perRow) * (TH_H + 18)
          drawBendStep(doc, st, sc, bx, by, TH_W, TH_H, accent)
          doc.font('Helvetica-Bold').fontSize(7.5).fillColor(INK)
          text(`Pli ${k + 1} · ${isPince(l.angles[k]!) ? 'pince' : `${Math.abs(l.angles[k]!)}°`}`, bx, by + TH_H + 4, { width: TH_W, align: 'center', lineBreak: false })
        })
        yy += hThumbs
        para(posTraits, IND, yy, w, { size: 9, color: MUTED })
        yy += heightOf(posTraits, w, 9) + 4
        tally('PIÈCES PLIÉES', l.quantite, IND, yy, w)
        y = top + h
      }
    }

    // Mettre de côté
    const rangement =
      gi < groups.length - 1
        ? 'Mettre les pièces pliées de côté (repère de la commande dessus), puis passer à la feuille suivante.'
        : 'Mettre les pièces pliées de côté : elles sont prêtes pour le contrôle et l’emballage.'
    need(40)
    y += 4
    sub(aPlier.length ? 4 : 3, 'Mettre de côté', '')
    box(IND, y + 1)
    para(rangement, IND + 20, y + 1, WIDTH - 30)
    y += Math.max(15, heightOf(rangement, WIDTH - 30) + 4) + 6

    // La chute de cette feuille
    const avecPlan = g.lignes.filter(({ l }) => l.decoupe)
    if (avecPlan.length) {
      const chutes = avecPlan.flatMap(({ l }) => chutesOf(l, l.decoupe!, chuteMin))
      const garder = groupChutes(chutes.filter((c) => c.garder))
      const jeter = groupChutes(chutes.filter((c) => !c.garder))
      const surfaceChutes = chutes.reduce((s, c) => s + c.largeur * c.longueur, 0)
      const surfaceFeuilles = avecPlan.reduce((s, { l }) => s + l.decoupe!.feuilles * l.decoupe!.feuilleLargeur * l.decoupe!.feuilleLongueur, 0)
      const dim = (c: Chute & { nombre: number }) => `${c.nombre} × ${num(c.largeur)} × ${num(c.longueur)} mm`
      const lignesChute: [string, string, string][] = [
        ['À GARDER', garder.length ? garder.map(dim).join(' · ') + ' : remettre au stock en chute' : 'Rien : pas de morceau assez grand pour servir', INK],
        ['À JETER', jeter.length ? jeter.map(dim).join(' · ') + ' : au rebut' : 'Rien', INK],
        [
          'TOTAL',
          `${chutes.length ? `${(Math.round((surfaceChutes / surfaceFeuilles) * 1000) / 10).toLocaleString('fr-FR')} % de la matière, soit ${m2(surfaceChutes)} m²` : 'Aucune chute'} (on garde un morceau dont tous les côtés font au moins ${chuteMin} mm)`,
          MUTED,
        ],
      ]
      const lw = WIDTH - 24 - 60
      const hh = 24 + lignesChute.reduce((s, [, t]) => s + heightOf(t, lw) + 4, 0)
      need(hh + 8)
      doc.roundedRect(PAGE.m, y, WIDTH, hh, 5).fill(ZEBRA)
      doc.font('Helvetica-Bold').fontSize(8).fillColor(accent)
      text('CHUTE DE CETTE FEUILLE', PAGE.m + 12, y + 8, { characterSpacing: 0.6, lineBreak: false })
      let yy = y + 22
      for (const [label, t, color] of lignesChute) {
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor(MUTED)
        text(label, PAGE.m + 12, yy + 1, { lineBreak: false, characterSpacing: 0.4 })
        para(t, PAGE.m + 12 + 60, yy, lw, { color })
        yy += heightOf(t, lw) + 4
      }
      y += hh + 8
    } else {
      need(30)
      para('Chute : à noter après la découpe (aucune feuille conseillée en stock). Garder les morceaux dont tous les côtés font au moins ' + `${chuteMin} mm.`, PAGE.m, y, WIDTH, {
        size: 9,
        color: MUTED,
      })
      y += 30
    }
  })

  // ═════════ 3. À préparer à part : accessoires et articles de la boutique ═════════
  const accAll = accessoryTotals(data.lignes)
  const boutique = data.lignes.map((l, i) => ({ l, i })).filter(({ l }) => !l.cotes.length)
  if (accAll.length || boutique.length) {
    y += 6
    section('À préparer à part')
    const items = [
      ...accAll.map((a) => `${num(a.quantite)} × ${a.nom}${a.couleur ? ` · ${a.couleur}` : ''}${a.unite === 'paire' ? ' (paires)' : ''}`),
      ...boutique.map(({ l, i }) => `${num(l.quantite)} × ${l.modeleLabel}${l.repere ? ` · ${l.repere}` : ''} (ligne ${i + 1}, article de la boutique)`),
    ]
    for (const t of items) {
      const h = Math.max(15, heightOf(t, WIDTH - 30) + 4)
      need(h)
      box(IND, y + 1)
      para(t, IND + 20, y + 1, WIDTH - 30)
      y += h
    }
    y += 6
  }

  // --- Visas ---
  need(60)
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

type BendStep = { pts: [number, number][]; plat: boolean }

/** La pièce après chaque pli, dans l'ordre : ce qui est déjà plié, puis le reste de la bande encore à plat dans le prolongement. */
export function bendSteps(l: Pick<SheetLine, 'cotes' | 'angles' | 'cap'>): BendStep[] {
  return l.angles.map((_, j) => {
    const reste = l.cotes.slice(j + 1).reduce((s, v) => s + v, 0)
    const plies = l.cotes.slice(0, j + 1)
    const { pts } = profilePoints([...plies, reste], l.angles.slice(0, j + 1), l.cap)
    return { pts, plat: j < l.angles.length - 1 }
  })
}

const bounds = (pts: [number, number][]) => {
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  return { minX: Math.min(...xs), minY: Math.min(...ys), spanX: Math.max(...xs) - Math.min(...xs), spanY: Math.max(...ys) - Math.min(...ys) }
}
/** Une même échelle pour toutes les vignettes d'une pièce : on voit la bande se replier. */
const bendScale = (steps: BendStep[], bw: number, bh: number) => {
  const pad = 8
  const b = steps.map((s) => bounds(s.pts))
  return Math.min((bw - 2 * pad) / Math.max(1, ...b.map((x) => x.spanX)), (bh - 2 * pad) / Math.max(1, ...b.map((x) => x.spanY)))
}

function drawBendStep(doc: PDFKit.PDFDocument, st: BendStep, s: number, bx: number, by: number, bw: number, bh: number, accent: string) {
  doc.roundedRect(bx, by, bw, bh, 4).fill(ZEBRA)
  const b = bounds(st.pts)
  const ox = bx + (bw - b.spanX * s) / 2
  const oy = by + (bh - b.spanY * s) / 2
  const P = st.pts.map(([x, y]) => [ox + (x - b.minX) * s, oy + (y - b.minY) * s] as [number, number])
  doc.save()
  const pliee = st.plat ? P.slice(0, -1) : P
  doc.moveTo(...pliee[0]!)
  for (const p of pliee.slice(1)) doc.lineTo(...p)
  doc.lineWidth(1.8).lineJoin('round').lineCap('round').strokeColor(STROKE).stroke()
  if (st.plat) {
    // Le reste de la bande, pas encore plié
    doc.moveTo(...P[P.length - 2]!).lineTo(...P[P.length - 1]!)
    doc.lineWidth(1.2).dash(3, { space: 2 }).strokeColor(MUTED).stroke().undash()
  }
  // Le pli qu'on vient de faire
  doc.circle(...P[P.length - 2]!, 2.4).fill(accent)
  doc.restore()
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
    const a2 = Math.atan2(e2[1], e2[0])
    // Arc par le petit côté (l'angle intérieur)
    let d = a2 - a1
    while (d > Math.PI) d -= 2 * Math.PI
    while (d < -Math.PI) d += 2 * Math.PI
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

/** La bande à découper, à plat (longueur à l'horizontale), avec les traits de pli en pointillés. Trop mince pour l'échelle, elle est épaissie pour rester lisible. */
function drawBand(doc: PDFKit.PDFDocument, l: SheetLine, bx: number, by: number, bw: number, bh: number) {
  const dev = l.cotes.reduce((t, v) => t + v, 0)
  doc.roundedRect(bx, by, bw, bh, 5).fill(ZEBRA)
  const sw = bw - 16
  const sh = Math.min(Math.max((dev / l.longueur) * sw, 12), bh - 20)
  const ox = bx + 8
  const oy = by + 5
  doc.rect(ox, oy, sw, sh).fillAndStroke('#ffffff', STROKE)
  let cumul = 0
  doc.lineWidth(0.7).dash(3, { space: 2 }).strokeColor(MUTED)
  for (const c of l.cotes.slice(0, -1)) {
    cumul += c
    const y = oy + (cumul / dev) * sh
    doc
      .moveTo(ox, y)
      .lineTo(ox + sw, y)
      .stroke()
  }
  doc.undash()
  doc.font('Helvetica').fontSize(6.5).fillColor(MUTED)
  doc.text(clean(`Bande à plat ${dev.toLocaleString('fr-FR')} × ${l.longueur.toLocaleString('fr-FR')} mm · plis en pointillés`), bx, oy + sh + 3, { width: bw, align: 'center', lineBreak: false })
}

/** Plan de découpe : la feuille conseillée (longueur à l'horizontale) avec les bandes de la pièce posées dedans, à l'échelle. */
function drawCutting(doc: PDFKit.PDFDocument, l: SheetLine, d: SheetAdvice, bx: number, by: number, bw: number, bh: number, accent: string) {
  doc.roundedRect(bx, by, bw, bh, 5).fill(ZEBRA)
  const pad = 6
  const s = Math.min((bw - 2 * pad) / d.feuilleLongueur, (bh - 2 * pad - 9) / d.feuilleLargeur)
  const sw = d.feuilleLongueur * s
  const sh = d.feuilleLargeur * s
  const ox = bx + (bw - sw) / 2
  const oy = by + pad
  const dev = l.cotes.reduce((t, v) => t + v, 0)
  doc.rect(ox, oy, sw, sh).fillAndStroke('#ffffff', STROKE)
  // Sens 1 : la longueur de la pièce suit la longueur de la feuille ; sens 2 : quart de tour
  const cellW = (d.disposition.sensLongueur ? l.longueur : dev) * s
  const cellH = (d.disposition.sensLongueur ? dev : l.longueur) * s
  const nx = d.disposition.sensLongueur ? d.disposition.rangees : d.disposition.colonnes
  const ny = d.disposition.sensLongueur ? d.disposition.colonnes : d.disposition.rangees
  doc.fillOpacity(0.3)
  let left = d.parFeuille
  for (let j = 0; j < ny && left > 0; j++)
    for (let i = 0; i < nx && left > 0; i++, left--) {
      doc
        .rect(ox + i * cellW, oy + j * cellH, cellW, cellH)
        .lineWidth(0.6)
        .fillAndStroke(accent, STROKE)
    }
  doc.fillOpacity(1)
  doc.font('Helvetica').fontSize(6.5).fillColor(MUTED)
  doc.text(clean(`Feuille ${d.feuilleLargeur.toLocaleString('fr-FR')} × ${d.feuilleLongueur.toLocaleString('fr-FR')} mm · ${d.parFeuille} bande${d.parFeuille > 1 ? 's' : ''}`), bx, oy + sh + 3, {
    width: bw,
    align: 'center',
    lineBreak: false,
  })
}
