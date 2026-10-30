<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  BATIMENT,
  CAMION,
  OBJETS,
  PARKING,
  PORTE_RETRAIT,
  PORTE_STOCKAGE,
  PORTES_INTERIEURES,
  ZONES,
  ZONE_ORDER,
  type Materiau,
  type Objet,
  type Placed,
  type Rack,
  type ZoneId,
} from '@/lib/plan-atelier'

// Le bâtiment en perspective isométrique, dessiné sur un canvas : les commandes y sont des colis posés dans leur lieu, le stock se lit sur les racks.
// Rien n'est modifiable ici : un clic sur un colis ou un rack ouvre la page correspondante.
const props = defineProps<{
  placed: Placed[]
  racks: Rack[]
  chutes: number
  couchesChutes: number
  camion: { feuilles: number } | null
  selected: string | null
  label: string
}>()
const emit = defineEmits<{ 'select-order': [id: string]; 'select-rack': [id: string] }>()

const canvas = ref<HTMLCanvasElement | null>(null)

const TW = 64
const TH = 32
const WALL = 34
const iso = (x: number, y: number, z = 0): [number, number] => [((x - y) * TW) / 2, ((x + y) * TH) / 2 - z]

type Palette = Record<string, string>
let P: Palette = {}
// Les couleurs viennent des variables CSS de l'application : le plan suit le thème clair ou sombre
function readPalette() {
  const css = getComputedStyle(document.documentElement)
  const g = (n: string) => {
    const v = css.getPropertyValue(n).trim()
    return /^#[0-9a-f]{6}$/i.test(v) ? v : '#888888'
  }
  P = {
    bg: g('--bg'),
    surface: g('--surface'),
    surface2: g('--surface-2'),
    surface2Soft: g('--surface-2'),
    ink: g('--ink'),
    muted: g('--muted'),
    line: g('--line'),
    accent: g('--accent'),
    accentSoft: g('--accent-soft'),
    ok: g('--ok'),
    warn: g('--warn'),
    bad: g('--bad'),
    warnSoft: g('--warn-soft'),
    badSoft: g('--bad-soft'),
    info: g('--info'),
    infoSoft: g('--info-soft'),
    done: g('--done'),
  }
}
const MAT: Record<Materiau, string> = { metal: '#aab4bf', wood: '#b08a5c', server: '#3b4352', blue: '#4a82c4', white: '#e7ecf0', green: '#2f7a54', sheet: '#dfe5ea' }

const hex = (c: string) => {
  const n = parseInt(c.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const mix = (c: string, t: string, k: number) => {
  const a = hex(c)
  const b = hex(t)
  return `rgb(${a.map((v, i) => Math.round(v + (b[i]! - v) * k)).join(',')})`
}
const rgba = (c: string, a: number) => {
  const [r, g, b] = hex(c)
  return `rgba(${r},${g},${b},${a})`
}

let ctx: CanvasRenderingContext2D | null = null
let W = 0
let H = 0
let dpr = 1
let cam = { x: 0, y: 0, s: 1 }
let fitted = false
let raf = 0
let hover: { type: 'order' | 'rack'; id: string } | null = null
const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

function poly(pts: [number, number][], fill?: string | null, stroke?: string | null, lw = 1, dash?: number[]) {
  if (!ctx) return
  ctx.beginPath()
  pts.forEach((p, i) => (i ? ctx!.lineTo(p[0], p[1]) : ctx!.moveTo(p[0], p[1])))
  ctx.closePath()
  if (fill) {
    ctx.fillStyle = fill
    ctx.fill()
  }
  if (stroke) {
    ctx.setLineDash(dash ?? [])
    ctx.strokeStyle = stroke
    ctx.lineWidth = lw
    ctx.stroke()
    ctx.setLineDash([])
  }
}
const rect = (x: number, y: number, w: number, d: number, z = 0): [number, number][] => [iso(x, y, z), iso(x + w, y, z), iso(x + w, y + d, z), iso(x, y + d, z)]
const zrect = (id: ZoneId) => {
  const z = ZONES[id]
  return rect(z.x0, z.y0, z.x1 - z.x0, z.y1 - z.y0)
}
const sil = (e: { x: number; y: number; w: number; d: number; h: number; z?: number }): [number, number][] => {
  const z0 = e.z ?? 0
  const z1 = z0 + e.h
  return [iso(e.x, e.y, z1), iso(e.x + e.w, e.y, z1), iso(e.x + e.w, e.y, z0), iso(e.x + e.w, e.y + e.d, z0), iso(e.x, e.y + e.d, z0), iso(e.x, e.y + e.d, z1)]
}

function fit() {
  const x0 = (-26 * TW) / 2
  const x1 = (20.5 * TW) / 2
  const y0 = (-1 * TH) / 2 - 40
  const y1 = (34.5 * TH) / 2
  cam.s = Math.max(0.2, Math.min(W / (x1 - x0 + 40), H / (y1 - y0 + 60)))
  cam.x = W / 2 - ((x0 + x1) / 2) * cam.s
  cam.y = H / 2 - ((y0 + y1) / 2) * cam.s
  fitted = true
}
function resize() {
  const c = canvas.value
  if (!c) return
  const r = c.getBoundingClientRect()
  dpr = Math.min(2, window.devicePixelRatio || 1)
  W = r.width
  H = r.height
  c.width = Math.round(W * dpr)
  c.height = Math.round(H * dpr)
  if (!fitted) fit()
  draw(performance.now())
}

/* ---------- Murs, sols, cloisons ---------- */
type Seg = [number, number]
function edges(k: ZoneId) {
  const z = ZONES[k]
  const out = { N: [] as Seg[], W: [] as Seg[], S: [] as Seg[], E: [] as Seg[] }
  const ov = (a0: number, a1: number, b0: number, b1: number): Seg => [Math.max(a0, b0), Math.min(a1, b1)]
  for (const c of BATIMENT) {
    if (c === k) continue
    const o = ZONES[c]
    if (Math.abs(o.y1 - z.y0) < 0.01) {
      const [a, b] = ov(z.x0, z.x1, o.x0, o.x1)
      if (b - a > 0.2) out.N.push([a, b])
    }
    if (Math.abs(o.y0 - z.y1) < 0.01) {
      const [a, b] = ov(z.x0, z.x1, o.x0, o.x1)
      if (b - a > 0.2) out.S.push([a, b])
    }
    if (Math.abs(o.x1 - z.x0) < 0.01) {
      const [a, b] = ov(z.y0, z.y1, o.y0, o.y1)
      if (b - a > 0.2) out.W.push([a, b])
    }
    if (Math.abs(o.x0 - z.x1) < 0.01) {
      const [a, b] = ov(z.y0, z.y1, o.y0, o.y1)
      if (b - a > 0.2) out.E.push([a, b])
    }
  }
  return out
}
// Les tronçons de [a0, a1] qui ne sont pas dans `shared`
function free(a0: number, a1: number, shared: Seg[]): Seg[] {
  let segs: Seg[] = [[a0, a1]]
  for (const [s0, s1] of shared) {
    segs = segs.flatMap(([p, q]): Seg[] =>
      s1 <= p || s0 >= q
        ? [[p, q]]
        : (
            [
              [p, Math.max(p, s0)],
              [Math.min(q, s1), q],
            ] as Seg[]
          ).filter(([u, v]) => v - u > 0.05),
    )
  }
  return segs
}

function drawGround() {
  poly(rect(PARKING.x0 - 6, PARKING.y0 - 8, PARKING.x1 - PARKING.x0 + 12, PARKING.y1 - PARKING.y0 + 12), mix(P.bg!, P.line!, 0.25))
  poly(rect(PARKING.x0, PARKING.y0, PARKING.x1 - PARKING.x0, PARKING.y1 - PARKING.y0), mix(P.surface2!, P.line!, 0.7), P.line)
  ctx!.strokeStyle = rgba(P.muted!, 0.5)
  ctx!.lineWidth = 1
  for (let y = 0; y <= 16; y += 2.2) {
    ctx!.beginPath()
    ctx!.moveTo(...iso(-6.4, y))
    ctx!.lineTo(...iso(-3.6, y))
    ctx!.stroke()
  }
  for (let x = -4; x <= 10; x += 2.2) {
    ctx!.beginPath()
    ctx!.moveTo(...iso(x, 16.6))
    ctx!.lineTo(...iso(x, 19.4))
    ctx!.stroke()
  }
  poly(rect(-5.4, 19.4, 4.4, 2.2), mix(P.surface!, P.line!, 0.5))
  for (const k of ZONE_ORDER) {
    const z = ZONES[k]
    const tint = P[z.tint]!
    if (z.outside) {
      poly(zrect(k), rgba(tint, 0.55), rgba(P.muted!, 0.6), 1.2, [5, 5])
      continue
    }
    for (let x = z.x0; x < z.x1 - 0.01; x++) {
      for (let y = z.y0; y < z.y1 - 0.01; y++) {
        poly(rect(x, y, Math.min(1, z.x1 - x), Math.min(1, z.y1 - y)), mix(tint, P.surface!, (Math.floor(x) + Math.floor(y)) % 2 ? 0.15 : 0.35), rgba(P.ink!, 0.04))
      }
    }
  }
  const nWalls: [number, number, number][] = []
  const wWalls: [number, number, number][] = []
  const parts: ['x' | 'y', number, number, number][] = []
  for (const k of BATIMENT) {
    const z = ZONES[k]
    const e = edges(k)
    for (const [a, b] of free(z.x0, z.x1, e.S)) poly([iso(a, z.y1), iso(b, z.y1), iso(b, z.y1, -8), iso(a, z.y1, -8)], mix(P.line!, P.ink!, 0.15))
    for (const [a, b] of free(z.y0, z.y1, e.E)) poly([iso(z.x1, a), iso(z.x1, b), iso(z.x1, b, -8), iso(z.x1, a, -8)], mix(P.line!, P.ink!, 0.3))
    for (const [a, b] of free(z.x0, z.x1, e.N)) nWalls.push([a, b, z.y0])
    const porte: Seg[] = k === 'atelier' ? [[PORTE_RETRAIT.a, PORTE_RETRAIT.b]] : []
    for (const [a, b] of free(z.y0, z.y1, e.W)) for (const [p, q] of free(a, b, porte)) wWalls.push([p, q, z.x0])
    for (const [a, b] of e.N)
      for (const [p, q] of free(
        a,
        b,
        PORTES_INTERIEURES.filter((d) => d.ax === 'x' && Math.abs(d.c - z.y0) < 0.01).map((d): Seg => [d.a, d.b]),
      ))
        parts.push(['x', p, q, z.y0])
    for (const [a, b] of e.W)
      for (const [p, q] of free(
        a,
        b,
        PORTES_INTERIEURES.filter((d) => d.ax === 'y' && Math.abs(d.c - z.x0) < 0.01).map((d): Seg => [d.a, d.b]),
      ))
        parts.push(['y', p, q, z.x0])
  }
  const panel = (p0: [number, number][], p1: [number, number][]) => {
    poly(p0, mix(P.surface!, P.line!, 0.3), rgba(P.ink!, 0.12))
    poly(p1, mix(P.line!, P.muted!, 0.35), rgba(P.ink!, 0.12))
  }
  for (const [a, b, y] of nWalls) {
    panel([iso(a, y, 0), iso(b, y, 0), iso(b, y, 11), iso(a, y, 11)], [iso(a, y, 11), iso(b, y, 11), iso(b, y, WALL), iso(a, y, WALL)])
    for (let x = a + 0.8; x < b - 1.4; x += 2.2) poly([iso(x, y, 4), iso(x + 0.8, y, 4), iso(x + 0.8, y, 9), iso(x, y, 9)], rgba(P.info!, 0.35), rgba(P.ink!, 0.25))
  }
  for (const [a, b, x] of wWalls) {
    panel([iso(x, a, 0), iso(x, b, 0), iso(x, b, 11), iso(x, a, 11)], [iso(x, a, 11), iso(x, b, 11), iso(x, b, WALL), iso(x, a, WALL)])
    for (let y = a + 0.8; y < b - 1.4; y += 2.2) poly([iso(x, y, 4), iso(x, y + 0.8, 4), iso(x, y + 0.8, 9), iso(x, y, 9)], rgba(P.info!, 0.35), rgba(P.ink!, 0.25))
  }
  // Porte de l'atelier vers le retrait : linteau au-dessus de l'ouverture, seuil au sol
  const d = PORTE_RETRAIT
  poly([iso(d.c, d.a, 22), iso(d.c, d.b, 22), iso(d.c, d.b, WALL), iso(d.c, d.a, WALL)], mix(P.line!, P.muted!, 0.35), rgba(P.ink!, 0.12))
  poly([iso(d.c, d.a, 0), iso(d.c, d.b, 0), iso(d.c, d.b, 22), iso(d.c, d.a, 22)], null, P.accent, 2)
  poly(rect(d.c - 0.3, d.a, 0.6, d.b - d.a), rgba(P.accent!, 0.2))
  // Façade basse du stockage côté parking, avec sa porte face à la réception
  const s = ZONES.stockage
  for (const [a, b] of free(s.x0, s.x1, [[PORTE_STOCKAGE.a, PORTE_STOCKAGE.b]]))
    poly([iso(a, s.y1, 0), iso(b, s.y1, 0), iso(b, s.y1, 22), iso(a, s.y1, 22)], mix(P.surface!, P.line!, 0.3), rgba(P.ink!, 0.12))
  poly([iso(PORTE_STOCKAGE.a, s.y1, 0), iso(PORTE_STOCKAGE.b, s.y1, 0), iso(PORTE_STOCKAGE.b, s.y1, 20), iso(PORTE_STOCKAGE.a, s.y1, 20)], null, P.accent, 2)
  poly(rect(PORTE_STOCKAGE.a, s.y1 - 0.3, PORTE_STOCKAGE.b - PORTE_STOCKAGE.a, 0.6), rgba(P.accent!, 0.2))
  const H1 = 11
  for (const [ax, a, b, c] of parts) {
    if (ax === 'x') {
      poly([iso(a, c, 0), iso(b, c, 0), iso(b, c, H1), iso(a, c, H1)], mix(P.surface!, P.ink!, 0.2))
      poly([iso(a, c, H1), iso(b, c, H1), iso(b, c + 0.12, H1), iso(a, c + 0.12, H1)], mix(P.surface!, P.line!, 0.4))
    } else {
      poly([iso(c, a, 0), iso(c, b, 0), iso(c, b, H1), iso(c, a, H1)], mix(P.surface!, P.ink!, 0.28))
      poly([iso(c, a, H1), iso(c, b, H1), iso(c + 0.12, b, H1), iso(c + 0.12, a, H1)], mix(P.surface!, P.line!, 0.4))
    }
  }
}

/* ---------- Objets ---------- */
type Boite = { x: number; y: number; w: number; d: number; h: number; z?: number }
function shade(e: Boite, col: string) {
  const z = e.z ?? 0
  poly([iso(e.x, e.y + e.d, z), iso(e.x + e.w, e.y + e.d, z), iso(e.x + e.w, e.y + e.d, z + e.h), iso(e.x, e.y + e.d, z + e.h)], mix(col, '#000000', 0.14))
  poly([iso(e.x + e.w, e.y, z), iso(e.x + e.w, e.y + e.d, z), iso(e.x + e.w, e.y + e.d, z + e.h), iso(e.x + e.w, e.y, z + e.h)], mix(col, '#000000', 0.3))
  poly(rect(e.x, e.y, e.w, e.d, z + e.h), mix(col, '#ffffff', 0.1))
}
const face = (e: Boite, x0: number, x1: number, z0: number, z1: number): [number, number][] => [
  iso(e.x + x0, e.y + e.d, z0),
  iso(e.x + x1, e.y + e.d, z0),
  iso(e.x + x1, e.y + e.d, z1),
  iso(e.x + x0, e.y + e.d, z1),
]

function drawObjet(e: Objet, t: number) {
  const z = e.z ?? 0
  if (e.type === 'arbre') {
    const [sx, sy] = iso(e.x + e.w / 2, e.y + e.d / 2)
    ctx!.fillStyle = '#6b5236'
    ctx!.fillRect(sx - 2, sy - 10, 4, 10)
    ctx!.fillStyle = mix(MAT.green, P.bg!, 0.2)
    ctx!.beginPath()
    ctx!.ellipse(sx, sy - 22, 20, 17, 0, 0, 7)
    ctx!.fill()
    return
  }
  shade(e, MAT[e.c])
  if (e.type === 'portail') poly(face(e, 0.4, 2.6, 2.5, 8.5), '#2c6d4b', '#e7ecf0')
  if (e.type === 'ecran-poste') poly(face(e, 0.05, e.w - 0.05, z + 0.8, z + e.h - 0.8), mix(P.info!, P.surface!, 0.3))
  if (e.type === 'plieuse') {
    poly(rect(e.x + 0.1, e.y + 0.1, e.w - 0.2, 0.25, e.h + 3), '#e7ecf0')
    poly(rect(e.x + 0.1, e.y + e.d - 0.45, e.w - 0.2, 0.35, e.h - 2), '#7e8996')
  }
  if (e.type === 'serveur') {
    for (let i = 0; i < 4; i++) {
      const on = reduce || Math.sin(t / 300 + i * 2 + e.x) > -0.2
      const zz = 3 + (i * (e.h - 6)) / 4
      poly(face(e, 0.1, e.w - 0.1, zz, zz + 1.6), on ? P.ok! : mix(P.ok!, '#000000', 0.6))
    }
  }
  if (e.type === 'ecran') {
    // L'écran de l'atelier montre les trois colonnes avec le nombre de commandes de chacune
    const cols = [P.info!, P.accent!, P.ok!]
    const w = e.w / 3
    const counts = [lieuCount('a-lancer'), lieuCount('fabrication'), lieuCount('a-retirer') + lieuCount('a-livrer')]
    for (let i = 0; i < 3; i++) {
      poly(face(e, i * w + 0.08, (i + 1) * w - 0.08, z + 1.5, z + e.h - 1.5), rgba(cols[i]!, 0.35))
      for (let j = 0; j < Math.min(counts[i]!, 3); j++) poly(face(e, i * w + 0.15, (i + 1) * w - 0.15, z + e.h - 4.8 - j * 2.7, z + e.h - 3 - j * 2.7), cols[i]!)
    }
  }
  if (e.type === 'rack') {
    const rack = props.racks.find((r) => r.id === e.id)
    const couches = rack?.couches ?? 0
    for (let i = 0; i < couches; i++) poly(rect(e.x + 0.08, e.y + 0.15, e.w - 0.16, e.d - 0.3, 2.5 + i * 2.2), MAT.sheet, rgba('#000000', 0.25))
    if (rack?.alerte) {
      const [sx, sy] = iso(e.x + e.w / 2, e.y + 0.4, e.h + 6)
      ctx!.fillStyle = P.bad!
      ctx!.beginPath()
      ctx!.arc(sx, sy, 8, 0, 7)
      ctx!.fill()
      ctx!.fillStyle = P.surface!
      ctx!.font = "700 11px 'JetBrains Mono', monospace"
      ctx!.textAlign = 'center'
      ctx!.fillText('!', sx, sy + 4)
    }
  }
  if (e.type === 'bac') for (let i = 0; i < props.couchesChutes; i++) poly(rect(e.x + 0.1 + (i % 2) * 0.1, e.y + 0.1, e.w - 0.25, e.d - 0.25, e.h + 0.8 + i * 1.2), '#aeb7c0', rgba('#000000', 0.25))
}
const lieuCount = (l: string) => props.placed.filter((p) => p.lieu === l).length

function drawCamion() {
  const e = CAMION
  shade(e, MAT.white)
  const cab = { x: e.x + e.w - 1, y: e.y, w: 1, d: e.d, h: e.h - 4 }
  shade(cab, '#f2f5f7')
  poly(
    [iso(cab.x + 0.1, cab.y + cab.d, 7), iso(cab.x + cab.w - 0.1, cab.y + cab.d, 7), iso(cab.x + cab.w - 0.1, cab.y + cab.d, cab.h - 1), iso(cab.x + 0.1, cab.y + cab.d, cab.h - 1)],
    mix(P.info!, P.surface!, 0.35),
  )
  for (const wx of [e.x + 0.5, e.x + e.w - 0.7]) {
    const [sx, sy] = iso(wx, e.y + e.d, 1)
    ctx!.fillStyle = '#1b1f24'
    ctx!.beginPath()
    ctx!.arc(sx, sy, 4, 0, 7)
    ctx!.fill()
  }
}

function drawPerson(x: number, y: number, col: string) {
  const [sx, sy] = iso(x, y)
  ctx!.fillStyle = 'rgba(0,0,0,0.2)'
  ctx!.beginPath()
  ctx!.ellipse(sx, sy, 7, 3, 0, 0, 7)
  ctx!.fill()
  ctx!.fillStyle = col
  ctx!.fillRect(sx - 4.5, sy - 14, 9, 12)
  ctx!.fillStyle = mix(col, '#ffffff', 0.25)
  ctx!.beginPath()
  ctx!.arc(sx, sy - 18, 5, 0, 7)
  ctx!.fill()
}

const TONE: Record<string, string> = { 'a-lancer': 'info', fabrication: 'accent', 'a-retirer': 'ok', 'a-livrer': 'ok' }
function drawColis(p: Placed, t: number) {
  const col = P[TONE[p.lieu]!]!
  const e = { x: p.x - 0.4, y: p.y - 0.3, w: 0.8, d: 0.6, h: 4.5 }
  shade(e, col)
  if (p.order.id === props.selected) {
    poly(sil(e), null, P.ink, 2)
    const [sx, sy] = iso(p.x, p.y)
    ctx!.strokeStyle = rgba(P.accent!, 0.5)
    ctx!.beginPath()
    ctx!.arc(sx, sy - 2, 12 + (reduce ? 0 : Math.sin(t / 220) * 1.5), 0, 7)
    ctx!.stroke()
  }
}

function etiquette(text: string, x: number, y: number, color: string, strong = false) {
  const k = Math.max(1, Math.min(2, 0.95 / cam.s))
  ctx!.save()
  ctx!.translate(x, y)
  ctx!.scale(k, k)
  ctx!.translate(-x, -y)
  ctx!.font = `${strong ? 600 : 400} 11px 'JetBrains Mono', monospace`
  const w = ctx!.measureText(text).width + 12
  ctx!.fillStyle = P.surface!
  ctx!.globalAlpha = 0.94
  ctx!.beginPath()
  ctx!.roundRect(x - w / 2, y - 13, w, 18, 9)
  ctx!.fill()
  ctx!.globalAlpha = 1
  ctx!.strokeStyle = color
  ctx!.lineWidth = 1.2
  ctx!.beginPath()
  ctx!.roundRect(x - w / 2, y - 13, w, 18, 9)
  ctx!.stroke()
  ctx!.fillStyle = P.ink!
  ctx!.textAlign = 'center'
  ctx!.fillText(text, x, y)
  ctx!.restore()
}

function draw(t: number) {
  const c = canvas.value
  if (!c || !ctx || !W) return
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, c.width, c.height)
  ctx.setTransform(dpr * cam.s, 0, 0, dpr * cam.s, dpr * cam.x, dpr * cam.y)
  drawGround()
  type Item = { key: number; run: () => void }
  const items: Item[] = []
  for (const o of OBJETS) items.push({ key: o.x + o.w + o.y + o.d, run: () => drawObjet(o, t) })
  for (const p of props.placed) items.push({ key: p.x + p.y + 0.5, run: () => drawColis(p, t) })
  // Celui qui fabrique se tient devant sa machine
  for (const p of props.placed) if (p.lieu === 'fabrication' && p.order.prisPar) items.push({ key: p.x + p.y + 1.2, run: () => drawPerson(p.x + 0.9, p.y - 0.7, P.ok!) })
  if (props.camion) items.push({ key: CAMION.x + CAMION.w + CAMION.y + CAMION.d, run: drawCamion })
  items.sort((a, b) => a.key - b.key)
  for (const it of items) it.run()
  for (const k of ZONE_ORDER) {
    const z = ZONES[k]
    const [sx, sy] = iso((z.x0 + z.x1) / 2, (z.y0 + z.y1) / 2)
    etiquette(z.short ?? z.name, sx, sy + 14, P.line!, true)
  }
  etiquette('Parking', ...iso(-5.0, 14.2), P.muted!)
  if (props.camion) etiquette(`Réception : ${props.camion.feuilles} feuilles`, ...iso(13.9, 15.9, 18), P.accent!, true)
  if (hover?.type === 'order') {
    const p = props.placed.find((x) => x.order.id === hover!.id)
    if (p) etiquette(`${p.order.numero} · ${p.order.client}`, ...iso(p.x, p.y, 12), P.accent!, true)
  }
  if (hover?.type === 'rack') {
    const o = OBJETS.find((x) => x.id === hover!.id)!
    etiquette(o.nom!, ...iso(o.x + o.w / 2, o.y + o.d / 2, o.h + 4), P.accent!, true)
  }
}

function loop(t: number) {
  draw(t)
  raf = requestAnimationFrame(loop)
}

/* ---------- Souris et doigt : se déplacer, zoomer, cliquer un colis ou un rack ---------- */
const toWorld = (mx: number, my: number): [number, number] => [(mx - cam.x) / cam.s, (my - cam.y) / cam.s]
function inPoly(p: [number, number], pts: [number, number][]) {
  let c = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]!
    const [xj, yj] = pts[j]!
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}
function pick(mx: number, my: number) {
  const p = toWorld(mx, my)
  for (const o of [...props.placed].reverse()) {
    const [sx, sy] = iso(o.x, o.y)
    if (Math.hypot(p[0] - sx, p[1] - (sy - 5)) < 11) return { type: 'order' as const, id: o.order.id }
  }
  for (const o of OBJETS) if (o.type === 'rack' && inPoly(p, sil(o))) return { type: 'rack' as const, id: o.id }
  return null
}
let drag: { x: number; y: number; cx: number; cy: number; moved: boolean } | null = null
function onDown(ev: PointerEvent) {
  drag = { x: ev.clientX, y: ev.clientY, cx: cam.x, cy: cam.y, moved: false }
  canvas.value?.setPointerCapture(ev.pointerId)
}
function onMove(ev: PointerEvent) {
  const c = canvas.value!
  if (drag) {
    const dx = ev.clientX - drag.x
    const dy = ev.clientY - drag.y
    if (Math.hypot(dx, dy) > 4) drag.moved = true
    if (drag.moved) {
      cam.x = drag.cx + dx
      cam.y = drag.cy + dy
    }
    return
  }
  const r = c.getBoundingClientRect()
  hover = pick(ev.clientX - r.left, ev.clientY - r.top)
  c.style.cursor = hover ? 'pointer' : 'grab'
}
function onUp(ev: PointerEvent) {
  const r = canvas.value!.getBoundingClientRect()
  if (drag && !drag.moved) {
    const h = pick(ev.clientX - r.left, ev.clientY - r.top)
    if (h?.type === 'order') emit('select-order', h.id)
    else if (h?.type === 'rack') emit('select-rack', h.id)
  }
  drag = null
}
function zoom(f: number, mx = W / 2, my = H / 2) {
  const ns = Math.max(0.2, Math.min(2.6, cam.s * f))
  cam.x = mx - ((mx - cam.x) * ns) / cam.s
  cam.y = my - ((my - cam.y) * ns) / cam.s
  cam.s = ns
}
function onWheel(ev: WheelEvent) {
  ev.preventDefault()
  const r = canvas.value!.getBoundingClientRect()
  zoom(ev.deltaY < 0 ? 1.12 : 1 / 1.12, ev.clientX - r.left, ev.clientY - r.top)
}

let observer: ResizeObserver | null = null
let themeObserver: MutationObserver | null = null
const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null
onMounted(() => {
  const c = canvas.value
  // Sans canvas (tests, vieux navigateur), la page garde ses listes : le plan est un plus
  ctx = c?.getContext?.('2d') ?? null
  if (!c || !ctx) return
  readPalette()
  resize()
  observer = new ResizeObserver(resize)
  observer.observe(c)
  media?.addEventListener('change', readPalette)
  themeObserver = new MutationObserver(readPalette)
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  if (reduce) draw(0)
  else raf = requestAnimationFrame(loop)
})
// Sans animation, on ne redessine que quand les données changent
watch(
  () => [props.placed, props.racks, props.chutes, props.camion, props.selected],
  () => reduce && draw(0),
  { deep: true },
)
onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  observer?.disconnect()
  themeObserver?.disconnect()
  media?.removeEventListener('change', readPalette)
})
defineExpose({
  fit: () => {
    fit()
    draw(performance.now())
  },
  zoom: (f: number) => zoom(f),
})
</script>

<template>
  <canvas ref="canvas" class="plan-canvas" role="img" :aria-label="label" @pointerdown="onDown" @pointermove="onMove" @pointerup="onUp" @pointerleave="hover = null" @wheel="onWheel"></canvas>
</template>

<style scoped>
.plan-canvas {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
  cursor: grab;
}
</style>
