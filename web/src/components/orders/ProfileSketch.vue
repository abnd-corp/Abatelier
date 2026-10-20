<script setup lang="ts">
import { computed } from 'vue'
import { angleText, developpe, letter, profilePoints } from '@/lib/orders'

// Profil de la pièce vu en coupe, avec ses cotes (A, B, C…) et ses angles
const props = withDefaults(defineProps<{ cotes: number[]; angles: number[]; cap?: number; color?: string; labels?: boolean; label?: string }>(), {
  cap: 0,
  color: 'var(--accent)',
  labels: true,
  label: '',
})

const fmt = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })

/** Écarte les textes qui se chevauchent (cotes courtes, plis proches), en les repoussant vers l'extérieur du dessin. */
function spread(items: { x: number; y: number; v: string }[], fs: number, cx: number, cy: number) {
  const box = (t: { v: string }) => ({ w: (t.v.length + 2) * fs * 0.62, h: fs * 1.15 })
  for (let pass = 0; pass < 40; pass++) {
    let moved = false
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i]!
        const b = items[j]!
        const ba = box(a)
        const bb = box(b)
        const dx = b.x - a.x
        const dy = b.y - a.y
        const ox = (ba.w + bb.w) / 2 - Math.abs(dx)
        const oy = (ba.h + bb.h) / 2 - Math.abs(dy)
        if (ox <= 0 || oy <= 0) continue
        moved = true
        // Séparation selon l'axe où le recouvrement est le plus faible ; à égalité parfaite, vers l'extérieur
        if (oy <= ox) {
          const s = dy === 0 ? (b.y >= cy ? 1 : -1) : Math.sign(dy)
          a.y -= (s * (oy + 0.5)) / 2
          b.y += (s * (oy + 0.5)) / 2
        } else {
          const s = dx === 0 ? (b.x >= cx ? 1 : -1) : Math.sign(dx)
          a.x -= (s * (ox + 0.5)) / 2
          b.x += (s * (ox + 0.5)) / 2
        }
      }
    }
    if (!moved) break
  }
}

const drawing = computed(() => {
  const { pts, heads } = profilePoints(props.cotes, props.angles, props.cap)
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const span = Math.max(maxX - minX, maxY - minY, 40)
  // k : taille d'un « pixel » du dessin, pour garder des textes lisibles quelle que soit la pièce
  const k = span / (props.labels ? 300 : 110)
  const pad = (props.labels ? 46 : 12) * k
  const viewBox = [minX - pad, minY - pad, maxX - minX + 2 * pad, maxY - minY + 2 * pad].map((v) => v.toFixed(1)).join(' ')
  const d = 'M' + pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L')
  const cx = xs.reduce((s, v) => s + v, 0) / xs.length
  const cy = ys.reduce((s, v) => s + v, 0) / ys.length
  const fs = 15 * k

  const cotes = props.cotes.map((len, i) => {
    const a = pts[i]!
    const b = pts[i + 1]!
    const h = heads[i]!
    const mx = (a[0] + b[0]) / 2
    const my = (a[1] + b[1]) / 2
    let nx = -Math.sin(h)
    let ny = Math.cos(h)
    // Texte à l'extérieur de la pièce
    if (nx * (mx - cx) + ny * (my - cy) < 0) {
      nx = -nx
      ny = -ny
    }
    return { x: mx + nx * 17 * k, y: my + ny * 17 * k, l: letter(i), v: fmt(Number(len) || 0) }
  })

  const angles = props.angles.flatMap((angle, i) => {
    const v = pts[i + 1]!
    const a = pts[i]!
    const b = pts[i + 2]
    if (!b) return []
    let u1 = [a[0] - v[0], a[1] - v[1]]
    let u2 = [b[0] - v[0], b[1] - v[1]]
    const n1 = Math.hypot(u1[0]!, u1[1]!)
    const n2 = Math.hypot(u2[0]!, u2[1]!)
    if (!n1 || !n2) return []
    u1 = [u1[0]! / n1, u1[1]! / n1]
    u2 = [u2[0]! / n2, u2[1]! / n2]
    const bis = [u1[0]! + u2[0]!, u1[1]! + u2[1]!]
    const bn = Math.hypot(bis[0]!, bis[1]!)
    if (bn < 1e-3) return []
    const r = 11 * k
    const cross = u1[0]! * u2[1]! - u1[1]! * u2[0]!
    return [
      {
        arc: `M${v[0] + u1[0]! * r} ${v[1] + u1[1]! * r} A${r} ${r} 0 0 ${cross > 0 ? 1 : 0} ${v[0] + u2[0]! * r} ${v[1] + u2[1]! * r}`,
        x: v[0] + (bis[0]! / bn) * 27 * k,
        y: v[1] + (bis[1]! / bn) * 27 * k,
        v: angleText(angle),
      },
    ]
  })
  spread([...cotes, ...angles], fs, cx, cy)
  return { viewBox, d, cotes, angles, fs, sw: 4 * k, start: pts[0]!, r: 3.2 * k }
})

const aria = computed(() => props.label || `Profil, développé ${fmt(developpe(props.cotes))} mm`)
</script>

<template>
  <svg class="sketch" :viewBox="drawing.viewBox" preserveAspectRatio="xMidYMid meet" role="img" :aria-label="aria">
    <path :d="drawing.d" class="under" vector-effect="non-scaling-stroke" />
    <path :d="drawing.d" class="top" :style="{ stroke: color }" vector-effect="non-scaling-stroke" />
    <template v-if="labels">
      <template v-for="(a, i) in drawing.angles" :key="`a${i}`">
        <path :d="a.arc" class="arc" vector-effect="non-scaling-stroke" />
        <text :x="a.x" :y="a.y" class="angle" :font-size="drawing.fs * 0.9" :stroke-width="drawing.sw">{{ a.v }}</text>
      </template>
      <text v-for="c in drawing.cotes" :key="c.l" :x="c.x" :y="c.y" class="cote" :font-size="drawing.fs" :stroke-width="drawing.sw">
        <tspan class="l">{{ c.l }}</tspan> {{ c.v }}
      </text>
      <circle :cx="drawing.start[0]" :cy="drawing.start[1]" :r="drawing.r" class="end" />
    </template>
  </svg>
</template>

<style scoped>
.sketch {
  width: 100%;
  height: 100%;
  display: block;
  overflow: visible;
}
.under {
  fill: none;
  stroke: var(--line);
  stroke-width: 7;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.top {
  fill: none;
  stroke-width: 4;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.arc {
  fill: none;
  stroke: var(--muted);
  stroke-width: 1;
}
.cote,
.angle {
  font-family: var(--f-mono);
  text-anchor: middle;
  dominant-baseline: middle;
  fill: var(--ink);
  stroke: var(--surface);
  paint-order: stroke;
  stroke-linejoin: round;
}
.angle {
  fill: var(--muted);
}
.cote .l {
  fill: var(--accent);
  font-weight: 700;
}
.end {
  fill: var(--accent);
}
</style>
