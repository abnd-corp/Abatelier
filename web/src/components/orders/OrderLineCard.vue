<script setup lang="ts">
import { eur } from '@/lib/catalog'
import { developpe, letter, MODELES, type LineModele } from '@/lib/orders'
import ProfileSketch from './ProfileSketch.vue'

// Une pièce de la commande : profil coté, matière, quantité ; les prix seulement si on les passe
defineProps<{
  index: number
  line: {
    repere: string | null
    modele: LineModele
    materialLabel: string
    colorLabel: string
    colorHex: string
    cotes: number[]
    angles: number[]
    longueur: number
    quantite: number
    accessoires: { nom: string; unite: 'piece' | 'paire'; quantite: number; prix?: number }[]
    prixUnitaire?: number
    remiseQuantite?: number
    miseEnRoute?: number
    total?: number
  }
  prices?: boolean
}>()
const n = (v: number) => v.toLocaleString('fr-FR')
</script>

<template>
  <article class="card piece" :aria-label="`Pièce ${index + 1}`">
    <div class="sketch">
      <ProfileSketch :cotes="line.cotes" :angles="line.angles" :cap="MODELES[line.modele].cap" :color="line.colorHex" :label="`Profil de la pièce ${index + 1}`" />
    </div>
    <div class="info">
      <h3>
        <span class="muted">{{ index + 1 }}.</span> {{ MODELES[line.modele].label }}<template v-if="line.repere"> · {{ line.repere }}</template>
      </h3>
      <p class="mat"><span class="swatch" :style="{ background: line.colorHex }" aria-hidden="true" />{{ line.materialLabel }} · {{ line.colorLabel }}</p>
      <dl class="facts">
        <dt>Quantité</dt>
        <dd class="strong">{{ n(line.quantite) }} × {{ n(line.longueur) }} mm</dd>
        <dt>Cotes</dt>
        <dd class="mono">
          <span v-for="(c, j) in line.cotes" :key="j" class="c"><b>{{ letter(j) }}</b> {{ n(c) }}</span>
        </dd>
        <template v-if="line.angles.length">
          <dt>Plis</dt>
          <dd class="mono">
            <span v-for="(a, j) in line.angles" :key="j" class="c">{{ Math.abs(a) }}° {{ a < 0 ? '↓' : '↑' }}</span>
          </dd>
        </template>
        <dt>Développé</dt>
        <dd class="mono">{{ n(developpe(line.cotes)) }} mm</dd>
        <template v-if="line.accessoires.length">
          <dt>Accessoires</dt>
          <dd>
            <span v-for="a in line.accessoires" :key="a.nom" class="acc">{{ a.quantite }} × {{ a.nom }}{{ a.unite === 'paire' ? ' (paire)' : '' }}</span>
          </dd>
        </template>
      </dl>
      <p v-if="prices && line.total !== undefined" class="price">
        <span class="muted">{{ eur(line.prixUnitaire!) }} la pièce<template v-if="line.remiseQuantite"> · −{{ n(line.remiseQuantite) }} %</template> · mise en route {{ eur(line.miseEnRoute!) }}</span>
        <b>{{ eur(line.total) }} HT</b>
      </p>
    </div>
  </article>
</template>

<style scoped>
.piece {
  display: grid;
  grid-template-columns: minmax(140px, 220px) minmax(0, 1fr);
  gap: 16px;
  padding: 16px;
}
.sketch {
  aspect-ratio: 4 / 3;
  background: var(--surface-2);
  border-radius: 8px;
  padding: 6px;
}
.info {
  display: grid;
  gap: 8px;
  align-content: start;
  min-width: 0;
}
h3 {
  margin: 0;
  font-size: 1rem;
}
.mat {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9rem;
}
.swatch {
  width: 14px;
  height: 14px;
  border-radius: 4px;
  border: 1px solid var(--line);
  flex: none;
}
.facts {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 4px 14px;
  margin: 0;
  font-size: 0.88rem;
}
.facts dt {
  color: var(--muted);
}
.facts dd {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
}
.facts .strong {
  font-weight: 650;
}
.c b {
  color: var(--accent);
}
.price {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  margin: 0;
  padding-top: 8px;
  border-top: 1px solid var(--line);
  font-size: 0.88rem;
}
@media (max-width: 560px) {
  .piece {
    grid-template-columns: minmax(0, 1fr);
  }
  .sketch {
    max-height: 200px;
  }
}
</style>
