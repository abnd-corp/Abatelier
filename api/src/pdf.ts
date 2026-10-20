import { createRequire } from 'node:module'
import PDFDocument from 'pdfkit'
import { FACTURX_FILENAME, FACTURX_XMP, MENTIONS_FACTURE } from './facturx.js'
import type { CompanySettings, DocumentTemplate, DocumentType } from './db/schema.js'

// Génération des devis et factures en PDF (A4), avec les polices standard du PDF (Helvetica).
// Les factures et avoirs sont des PDF/A-3 Factur-X : police Inter incorporée et fichier XML embarqué (voir facturx.ts).

export interface DocLine {
  designation: string
  // Précisions sous la désignation (coloris, cotes…)
  detail?: string
  quantite: number
  prixUnitaire: number
}

export type PdfType = DocumentType | 'avoir'

export interface DocData {
  type: PdfType
  numero: string
  date: Date
  // Validité du devis ou échéance de la facture. Sans elle : date + durée du modèle.
  echeance?: Date
  // Lignes sous la date : commande, livraison…
  references?: string[]
  client: { nom: string; adresse: string }
  lignes: DocLine[]
  // Taux de TVA en %
  tva: number
  // Montants imposés (un avoir reprend exactement l'opposé de la facture)
  totaux?: { ht: number; tva: number; ttc: number }
  // Avoir : facture annulée et raison
  avoir?: { facture: string; factureDate: Date; motif: string }
  // Filigrane « APERÇU » : document d'exemple, sans valeur
  apercu?: boolean
}

const TITRES: Record<PdfType, string> = { devis: 'Devis', facture: 'Facture', avoir: 'Avoir' }

type Company = Omit<CompanySettings, 'id' | 'updatedAt' | 'logo' | 'logoType' | 'logoUpdatedAt'>
type Template = Omit<DocumentTemplate, 'id' | 'updatedAt'>

const PAGE = { w: 595.28, h: 841.89, m: 50 }
const RIGHT = PAGE.w - PAGE.m
const WIDTH = PAGE.w - 2 * PAGE.m
const FOOTER_H = 58
const BOTTOM = PAGE.h - PAGE.m - FOOTER_H
const INK = '#1d1f24'
const MUTED = '#6b7280'
const LINE = '#d9dbe1'
const ZEBRA = '#f6f6f8'

// Les polices standard ne connaissent que le jeu WinAnsi : les autres caractères deviennent « ? »
const WIN_ANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ')
export function clean(s: string) {
  return s
    .replace(/[    ]/g, ' ')
    .replace(/−/g, '-')
    .replace(/[^\n\t -~ -ÿ]/g, (c) => (WIN_ANSI_EXTRA.has(c) ? c : '?'))
}

const eurFmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })
export const eur = (n: number) => clean(eurFmt.format(n))
const qty = (n: number) => clean(n.toLocaleString('fr-FR', { maximumFractionDigits: 2 }))
const day = (d: Date) => d.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000)
const cents = (n: number) => Math.round(n * 100) / 100

/** Totaux d'un document : chaque ligne est arrondie au centime, puis la TVA sur le total HT. */
export function totals(lignes: DocLine[], tva: number) {
  const ht = cents(lignes.reduce((s, l) => s + cents(l.quantite * l.prixUnitaire), 0))
  const montantTva = cents((ht * tva) / 100)
  return { ht, tva: montantTva, ttc: cents(ht + montantTva) }
}

/** Logo de l'appli (voir web/src/components/BrandMark.vue), dessiné en vectoriel. */
export function drawBrandMark(doc: PDFKit.PDFDocument, x: number, y: number, height: number) {
  const s = height / 234
  doc.save().translate(x - 8 * s, y - 18 * s).scale(s)
  const shapes: { points: [number, number][]; y1: number; y2: number; stops: [number, string][] }[] = [
    { points: [[97, 62], [125, 120], [70, 246], [14, 246]], y1: 62, y2: 246, stops: [[0, '#4a1873'], [1, '#b768cf']] },
    { points: [[165.5, 62.5], [253.5, 246], [200, 246], [137.5, 122]], y1: 62, y2: 246, stops: [[0, '#2d4d90'], [0.35, '#6f93c7'], [1, '#c4d9f1']] },
    { points: [[91.5, 26], [171.5, 26], [132.5, 107.5]], y1: 26, y2: 108, stops: [[0, '#c7a3e6'], [1, '#a191dc']] },
    { points: [[131.5, 133], [162, 198], [102, 198]], y1: 133, y2: 198, stops: [[0, '#6c42a6'], [1, '#ad8ade']] },
  ]
  for (const sh of shapes) {
    const g = doc.linearGradient(0, sh.y1, 0, sh.y2)
    for (const [o, c] of sh.stops) g.stop(o, c)
    doc.polygon(...sh.points).fill(g)
  }
  doc.restore()
}

const requireFont = createRequire(import.meta.url)
// PDF/A exige que toutes les polices soient incorporées au fichier : Inter remplace Helvetica pour les factures
const FONTS = { regular: requireFont.resolve('@fontsource/inter/files/inter-latin-400-normal.woff'), bold: requireFont.resolve('@fontsource/inter/files/inter-latin-700-normal.woff') }

/** `facturx` : XML à embarquer ; le document devient alors un PDF/A-3 (facture ou avoir électronique). */
export function renderDocument(company: Company, template: Template, logo: Buffer | null, data: DocData, facturx?: { xml: string }): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margin: PAGE.m,
    bufferPages: true,
    info: { Title: clean(`${TITRES[data.type]} ${data.numero}`), Author: clean(company.raisonSociale), ...(facturx ? { Creator: 'Patalu', Producer: 'Patalu', CreationDate: data.date } : {}) },
    ...(facturx ? { pdfVersion: '1.7' as const, subset: 'PDF/A-3b' as const } : {}),
  })
  const F = facturx ? { r: 'Inter', b: 'Inter-Bold' } : { r: 'Helvetica', b: 'Helvetica-Bold' }
  if (facturx) {
    // Le reste du code écrit avec « F.r » et « F.b » : Helvetica pour un devis, Inter incorporée pour une facture
    doc.registerFont('Inter', FONTS.regular)
    doc.registerFont('Inter-Bold', FONTS.bold)
    // La police courante au départ est « Helvetica » (non incorporée) : on la remplace tout de suite
    doc.font('Inter')
  }
  const chunks: Buffer[] = []
  doc.on('data', (c: Buffer) => chunks.push(c))
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })

  const accent = template.couleur
  const isDevis = data.type === 'devis'
  const isAvoir = data.type === 'avoir'
  const text = (s: string, x: number, y: number, o: PDFKit.Mixins.TextOptions = {}) => doc.text(clean(s), x, y, o)

  // --- En-tête : logo et entreprise à gauche, titre et numéro à droite ---
  if (logo) doc.image(logo, PAGE.m, 45, { fit: [130, 56] })
  else drawBrandMark(doc, PAGE.m, 45, 56)

  let y = 112
  doc.font(F.b).fontSize(12).fillColor(INK)
  text(company.raisonSociale, PAGE.m, y, { width: 260 })
  y = doc.y + 2
  doc.font(F.r).fontSize(9).fillColor(INK)
  if (company.adresse) {
    text(company.adresse, PAGE.m, y, { width: 260, lineGap: 1 })
    y = doc.y + 3
  }
  const contact = [company.telephone && `Tél. ${company.telephone}`, company.email, company.siteWeb].filter(Boolean).join('\n')
  if (contact) {
    doc.fillColor(MUTED)
    text(contact, PAGE.m, y, { width: 260, lineGap: 1 })
  }
  const leftBottom = doc.y

  const colX = 330
  const colW = RIGHT - colX
  doc.font(F.b).fontSize(24).fillColor(accent)
  text(TITRES[data.type].toUpperCase(), colX, 44, { width: colW, align: 'right', characterSpacing: 1 })
  doc.font(F.b).fontSize(11).fillColor(INK)
  text(`N° ${data.numero}`, colX, doc.y + 2, { width: colW, align: 'right' })
  doc.font(F.r).fontSize(9.5)
  const limite = data.echeance ?? addDays(data.date, isDevis ? template.validiteDevis : template.echeanceFacture)
  const dates = [`Date : ${day(data.date)}`, isAvoir ? `Facture : ${data.avoir?.facture ?? ''}` : `${isDevis ? 'Valable jusqu’au' : 'Échéance'} : ${day(limite)}`, ...(data.references ?? [])]
  text(dates.join('\n'), colX, doc.y + 2, { width: colW, align: 'right', lineGap: 1 })

  // Bloc client, sous les références
  const boxY = Math.max(132, doc.y + 12)
  doc.font(F.b).fontSize(10.5)
  const nameH = doc.heightOfString(clean(data.client.nom), { width: colW - 24 })
  doc.font(F.r).fontSize(9.5)
  const addrH = doc.heightOfString(clean(data.client.adresse), { width: colW - 24, lineGap: 1 })
  const boxH = 30 + nameH + addrH
  doc.roundedRect(colX, boxY, colW, boxH, 6).fill(ZEBRA)
  doc.font(F.b).fontSize(7.5).fillColor(MUTED)
  text('CLIENT', colX + 12, boxY + 10, { characterSpacing: 0.8 })
  doc.font(F.b).fontSize(10.5).fillColor(INK)
  text(data.client.nom, colX + 12, boxY + 22, { width: colW - 24 })
  doc.font(F.r).fontSize(9.5)
  text(data.client.adresse, colX + 12, doc.y + 1, { width: colW - 24, lineGap: 1 })

  y = Math.max(leftBottom, boxY + boxH) + 24

  const ensure = (h: number) => {
    if (y + h > BOTTOM) {
      doc.addPage()
      y = PAGE.m
    }
  }

  if (template.entete) {
    doc.font(F.r).fontSize(9.5).fillColor(INK)
    const h = doc.heightOfString(clean(template.entete), { width: WIDTH, lineGap: 1.5 })
    ensure(h)
    text(template.entete, PAGE.m, y, { width: WIDTH, lineGap: 1.5 })
    y = doc.y + 14
  }

  // --- Lignes ---
  const cols = [
    { label: 'Désignation', x: PAGE.m, w: 255, align: 'left' as const },
    { label: 'Qté', x: PAGE.m + 255, w: 55, align: 'right' as const },
    { label: 'PU HT', x: PAGE.m + 310, w: 85, align: 'right' as const },
    { label: 'Total HT', x: PAGE.m + 395, w: WIDTH - 395, align: 'right' as const },
  ]
  const pad = 8
  const header = () => {
    doc.rect(PAGE.m, y, WIDTH, 22).fill(accent)
    doc.font(F.b).fontSize(8.5).fillColor('#ffffff')
    for (const c of cols) text(c.label, c.x + pad, y + 7, { width: c.w - 2 * pad, align: c.align })
    y += 22
  }
  ensure(60)
  header()
  data.lignes.forEach((l, i) => {
    doc.font(F.b).fontSize(9.5)
    let h = doc.heightOfString(clean(l.designation), { width: cols[0]!.w - 2 * pad })
    doc.font(F.r).fontSize(8.5)
    if (l.detail) h += 2 + doc.heightOfString(clean(l.detail), { width: cols[0]!.w - 2 * pad })
    h += 16
    if (y + h > BOTTOM) {
      doc.addPage()
      y = PAGE.m
      header()
    }
    if (i % 2 === 1) doc.rect(PAGE.m, y, WIDTH, h).fill(ZEBRA)
    doc.font(F.b).fontSize(9.5).fillColor(INK)
    text(l.designation, cols[0]!.x + pad, y + 8, { width: cols[0]!.w - 2 * pad })
    if (l.detail) {
      doc.font(F.r).fontSize(8.5).fillColor(MUTED)
      text(l.detail, cols[0]!.x + pad, doc.y + 2, { width: cols[0]!.w - 2 * pad })
    }
    doc.font(F.r).fontSize(9.5).fillColor(INK)
    const values = [qty(l.quantite), eur(l.prixUnitaire), eur(cents(l.quantite * l.prixUnitaire))]
    values.forEach((v, j) => text(v, cols[j + 1]!.x + pad, y + 8, { width: cols[j + 1]!.w - 2 * pad, align: 'right' }))
    y += h
  })
  doc.moveTo(PAGE.m, y).lineTo(RIGHT, y).lineWidth(0.6).strokeColor(LINE).stroke()

  // --- Totaux ---
  const t = data.totaux ?? totals(data.lignes, data.tva)
  ensure(80)
  y += 12
  const rows: [string, string, boolean][] = [
    ['Total HT', eur(t.ht), false],
    [`TVA ${qty(data.tva)} %`, eur(t.tva), false],
    ['Total TTC', eur(t.ttc), true],
  ]
  for (const [label, value, strong] of rows) {
    if (strong) {
      doc.roundedRect(colX, y - 4, colW, 24, 4).fill(accent)
      doc.font(F.b).fontSize(11).fillColor('#ffffff')
    } else doc.font(F.r).fontSize(9.5).fillColor(INK)
    text(label, colX + 12, y + (strong ? 3 : 0), { width: colW / 2 })
    text(value, colX + colW / 2, y + (strong ? 3 : 0), { width: colW / 2 - 12, align: 'right' })
    y += strong ? 28 : 18
  }
  y += 14

  // --- Conditions et textes ---
  const section = (title: string, body: string) => {
    if (!body.trim()) return
    doc.font(F.r).fontSize(9)
    const h = 14 + doc.heightOfString(clean(body), { width: WIDTH, lineGap: 1.5 })
    ensure(h)
    doc.font(F.b).fontSize(9).fillColor(accent)
    text(title, PAGE.m, y)
    doc.font(F.r).fontSize(9).fillColor(INK)
    text(body, PAGE.m, doc.y + 3, { width: WIDTH, lineGap: 1.5 })
    y = doc.y + 12
  }
  const jours = Math.round((limite.getTime() - data.date.getTime()) / 86_400_000)
  if (isAvoir && data.avoir) {
    section('Annulation', `Cet avoir annule la facture ${data.avoir.facture} du ${day(data.avoir.factureDate)}.`)
    section('Motif', data.avoir.motif)
  } else {
    section(
      isDevis ? 'Validité' : 'Échéance',
      isDevis ? `Ce devis est valable ${jours} jours, jusqu’au ${day(limite)}.` : `Paiement au plus tard le ${day(limite)} (${jours} jours).`,
    )
    section('Conditions de paiement', template.conditionsPaiement)
    if (!isDevis && company.iban) section('Règlement par virement', [`IBAN : ${company.iban}`, company.bic && `BIC : ${company.bic}`].filter(Boolean).join('   ·   '))
    section('À noter', isDevis ? template.noteDevis : template.noteFacture)
  }

  if (isDevis) {
    ensure(92)
    const w = 240
    doc.roundedRect(RIGHT - w, y, w, 80, 6).lineWidth(0.8).strokeColor(LINE).stroke()
    doc.font(F.b).fontSize(9).fillColor(INK)
    text('Bon pour accord', RIGHT - w + 12, y + 10)
    doc.font(F.r).fontSize(8).fillColor(MUTED)
    text('Date, signature et cachet, précédés de la mention « Bon pour accord »', RIGHT - w + 12, doc.y + 2, { width: w - 24 })
    y += 92
  }

  // Mentions du modèle, puis (factures et avoirs électroniques) les trois mentions que la loi impose et que le XML reprend à l'identique
  const mentions = [template.mentionsLegales.trim(), ...(facturx ? MENTIONS_FACTURE.map((m) => m.texte) : [])].filter(Boolean).join('\n')
  if (mentions) {
    doc.font(F.r).fontSize(7.5)
    const h = doc.heightOfString(clean(mentions), { width: WIDTH, lineGap: 1 })
    ensure(h)
    doc.fillColor(MUTED)
    text(mentions, PAGE.m, y, { width: WIDTH, lineGap: 1 })
  }

  // --- Pied de page et filigrane, sur chaque page ---
  const identity = [
    company.raisonSociale,
    [company.formeJuridique, company.capital && `au capital de ${company.capital}`].filter(Boolean).join(' '),
    company.siret && `SIRET ${company.siret}`,
    company.rcs && `RCS ${company.rcs}`,
    company.tvaIntra && `TVA ${company.tvaIntra}`,
  ]
    .filter(Boolean)
    .join(' · ')
  const range = doc.bufferedPageRange()
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i)
    // Sans marge basse le temps d'écrire le pied de page, sinon pdfkit ajoute une page
    const margin = doc.page.margins.bottom
    doc.page.margins.bottom = 0
    if (data.apercu) {
      doc.save().rotate(-32, { origin: [PAGE.w / 2, PAGE.h / 2] }).fillOpacity(0.07).fillColor(accent).font(F.b).fontSize(110)
      doc.text('APERÇU', 0, PAGE.h / 2 - 55, { width: PAGE.w, align: 'center', lineBreak: false })
      doc.restore()
    }
    const fy = PAGE.h - PAGE.m - FOOTER_H + 14
    doc.moveTo(PAGE.m, fy).lineTo(RIGHT, fy).lineWidth(0.6).strokeColor(LINE).stroke()
    doc.font(F.r).fontSize(7.5).fillColor(MUTED)
    const lines = [template.piedDePage, identity].filter((s) => s.trim()).join('\n')
    text(lines, PAGE.m, fy + 8, { width: WIDTH - 50, lineGap: 1 })
    text(`${i + 1} / ${range.count}`, RIGHT - 50, fy + 8, { width: 50, align: 'right' })
    doc.page.margins.bottom = margin
  }

  if (facturx) {
    // Le XML est joint au PDF (« Alternative » : il dit la même chose que la page) et déclaré dans les métadonnées XMP
    doc.file(Buffer.from(facturx.xml, 'utf8'), { name: FACTURX_FILENAME, type: 'text/xml', description: 'Factur-X', relationship: 'Alternative', creationDate: data.date, modifiedDate: data.date } as Parameters<typeof doc.file>[1])
    doc.appendXML(FACTURX_XMP)
  }
  doc.end()
  return done
}

/** Données fictives pour l'aperçu du modèle. */
export function sampleDocument(type: DocumentType, numero: string, tva: number): DocData {
  return {
    type,
    numero,
    date: new Date(),
    apercu: true,
    client: { nom: 'Martin Couverture (exemple)', adresse: '12 rue de l’Exemple\n42000 Saint-Étienne' },
    tva,
    lignes: [
      { designation: 'Couvertine aluminium 1,50 mm', detail: 'RAL 7016 · développé 420 mm · 4 plis · longueur 3 000 mm', quantite: 4, prixUnitaire: 96.4 },
      { designation: 'Bouchon de couvertine', detail: 'RAL 7016', quantite: 2, prixUnitaire: 6.9 },
      { designation: 'Éclisse de jonction', detail: 'RAL 7016', quantite: 3, prixUnitaire: 7.8 },
      { designation: 'Livraison', detail: 'Zone jusqu’à 30 km', quantite: 1, prixUnitaire: 39 },
    ],
  }
}

/**
 * Vérifie qu'un fichier envoyé est bien une image PNG ou JPEG lisible : on l'intègre pour de vrai
 * dans un petit PDF, ce qui attrape aussi les fichiers abîmés. Renvoie le type et les dimensions.
 */
export async function inspectImage(buf: Buffer): Promise<{ type: 'image/png' | 'image/jpeg'; width: number; height: number } | null> {
  const isPng = buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  const isJpeg = buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff
  if (!isPng && !isJpeg) return null
  try {
    const doc = new PDFDocument({ size: [100, 100], margin: 0 })
    const ended = new Promise<void>((resolve, reject) => {
      doc.on('data', () => {})
      doc.on('end', resolve)
      doc.on('error', reject)
    })
    const img = (doc as unknown as { openImage(b: Buffer): { width: number; height: number } }).openImage(buf)
    if (!img.width || !img.height) return null
    doc.image(buf, 0, 0, { fit: [100, 100] })
    doc.end()
    await ended
    return { type: isPng ? 'image/png' : 'image/jpeg', width: img.width, height: img.height }
  } catch {
    return null
  }
}
