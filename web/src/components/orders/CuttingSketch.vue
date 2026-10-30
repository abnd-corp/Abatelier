<script setup lang="ts">
import { computed } from 'vue'
import type { PlanDecoupe } from '@/lib/production'

// Plan de découpe vu de dessus : la feuille (longueur à l'horizontale) avec les bandes de la pièce posées dedans, à l'échelle.
// Le blanc qui reste, c'est la chute.
const props = defineProps<{ plan: NonNullable<PlanDecoupe['plan']> }>()

const dessin = computed(() => {
  const p = props.plan
  const celluleL = p.sensLongueur ? p.longueur : p.developpe
  const celluleW = p.sensLongueur ? p.developpe : p.longueur
  const nx = p.sensLongueur ? p.rangees : p.colonnes
  const ny = p.sensLongueur ? p.colonnes : p.rangees
  const bandes: { x: number; y: number }[] = []
  let reste = p.parFeuille
  for (let j = 0; j < ny && reste > 0; j++) for (let i = 0; i < nx && reste > 0; i++, reste--) bandes.push({ x: i * celluleL, y: j * celluleW })
  return { L: p.feuilleLongueur, W: p.feuilleLargeur, celluleL, celluleW, bandes, trait: p.feuilleLongueur / 400 }
})
</script>

<template>
  <figure class="cut">
    <svg
      :viewBox="`${-dessin.trait} ${-dessin.trait} ${dessin.L + 2 * dessin.trait} ${dessin.W + 2 * dessin.trait}`"
      role="img"
      :aria-label="`Feuille ${plan.feuilleLargeur} par ${plan.feuilleLongueur} mm, ${plan.parFeuille} bandes`"
    >
      <rect x="0" y="0" :width="dessin.L" :height="dessin.W" fill="var(--surface)" stroke="var(--ink)" :stroke-width="dessin.trait * 1.5" />
      <rect
        v-for="(b, k) in dessin.bandes"
        :key="k"
        :x="b.x"
        :y="b.y"
        :width="dessin.celluleL"
        :height="dessin.celluleW"
        fill="var(--accent)"
        fill-opacity="0.3"
        stroke="var(--ink)"
        :stroke-width="dessin.trait"
      />
    </svg>
    <figcaption>
      Feuille {{ plan.feuilleLargeur.toLocaleString('fr-FR') }} × {{ plan.feuilleLongueur.toLocaleString('fr-FR') }} mm · {{ plan.parFeuille }} bande{{ plan.parFeuille > 1 ? 's' : '' }}
    </figcaption>
  </figure>
</template>

<style scoped>
.cut {
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
