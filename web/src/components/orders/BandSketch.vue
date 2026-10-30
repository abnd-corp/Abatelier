<script setup lang="ts">
import { computed } from 'vue'
import type { PlanDecoupe } from '@/lib/production'

// La bande à découper, à plat (longueur à l'horizontale), avec les traits de pli en pointillés.
// Trop mince pour l'échelle, elle est épaissie pour rester lisible.
const props = defineProps<{ bande: PlanDecoupe['bande'] }>()

const dessin = computed(() => {
  const { developpe, longueur, traits } = props.bande
  const W = 300
  const H = Math.min(Math.max((developpe / longueur) * W, 22), 140)
  return { W, H, lignes: traits.map((t) => (t / developpe) * H) }
})
const n = (v: number) => v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })
</script>

<template>
  <figure class="band">
    <svg :viewBox="`-2 -2 ${dessin.W + 4} ${dessin.H + 4}`" role="img" :aria-label="`Bande à plat ${n(bande.developpe)} par ${n(bande.longueur)} mm`">
      <rect x="0" y="0" :width="dessin.W" :height="dessin.H" fill="var(--surface)" stroke="var(--ink)" stroke-width="1.5" />
      <line v-for="(y, k) in dessin.lignes" :key="k" x1="0" :x2="dessin.W" :y1="y" :y2="y" stroke="var(--muted)" stroke-width="1" stroke-dasharray="5 4" />
    </svg>
    <figcaption>Bande à plat {{ n(bande.developpe) }} × {{ n(bande.longueur) }} mm · plis en pointillés</figcaption>
  </figure>
</template>

<style scoped>
.band {
  margin: 0;
  display: grid;
  gap: 4px;
}
svg {
  width: 100%;
  height: auto;
  background: var(--bg);
  border-radius: 8px;
  padding: 6px;
}
figcaption {
  font-size: 0.8rem;
  color: var(--muted);
  text-align: center;
}
</style>
