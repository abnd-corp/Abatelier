<script setup lang="ts">
import { computed } from 'vue'
import type { PlanEtape } from '@/lib/production'

// La pièce après un pli : en trait plein ce qui est plié, en pointillé ce qui reste de la bande à plat.
// Chaque vignette est cadrée sur sa propre forme : lisible même quand la bande à plat est bien plus longue que la pièce pliée.
const props = defineProps<{ etape: PlanEtape }>()

const dessin = computed(() => {
  const xs = props.etape.pts.map((p) => p[0])
  const ys = props.etape.pts.map((p) => p[1])
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2
  const taille = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1) * 1.3
  const pts = props.etape.pts
  const pliee = props.etape.plat ? pts.slice(0, -1) : pts
  const fmt = (p: [number, number]) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`
  return {
    viewBox: [cx - taille / 2, cy - taille / 2, taille, taille].map((v) => v.toFixed(1)).join(' '),
    pliee: pliee.map(fmt).join(' '),
    reste: props.etape.plat ? `${fmt(pts[pts.length - 2]!)} ${fmt(pts[pts.length - 1]!)}` : '',
    pli: pts[pts.length - 2]!,
    // Épaisseur du trait proportionnelle à la taille du dessin
    trait: taille / 45,
  }
})
</script>

<template>
  <svg class="bend" :viewBox="dessin.viewBox" role="img" aria-hidden="true">
    <polyline :points="dessin.pliee" fill="none" stroke="var(--ink)" :stroke-width="dessin.trait" stroke-linejoin="round" stroke-linecap="round" />
    <polyline v-if="dessin.reste" :points="dessin.reste" fill="none" stroke="var(--muted)" :stroke-width="dessin.trait * 0.7" :stroke-dasharray="`${dessin.trait * 2.5} ${dessin.trait * 2}`" />
    <circle :cx="dessin.pli[0]" :cy="dessin.pli[1]" :r="dessin.trait * 1.6" fill="var(--accent)" />
  </svg>
</template>

<style scoped>
.bend {
  width: 100%;
  height: 100%;
  background: var(--surface-2, var(--bg));
  border-radius: 8px;
}
</style>
