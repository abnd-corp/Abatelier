<script setup lang="ts">
import { computed } from 'vue'
import { legalBlocks, site } from '@/lib/site'

// Une seule vue pour les quatre pages légales : la clé du texte vient de la route (props)
const props = defineProps<{ cle: string; titre: string }>()
const blocks = computed(() => legalBlocks(site.value?.contenu[props.cle] ?? ''))
</script>

<template>
  <div class="s-wrap page">
    <h1>{{ titre }}</h1>
    <div v-if="site" class="card doc">
      <section v-for="(b, i) in blocks" :key="i">
        <h2 v-if="b.titre">{{ b.titre }}</h2>
        <p v-for="(l, j) in b.lignes" :key="j" class="para">{{ l }}</p>
      </section>
    </div>
    <p v-else class="muted" aria-busy="true">Chargement…</p>
  </div>
</template>

<style scoped>
.page {
  padding-top: 36px;
}
h1 {
  font-size: clamp(1.8rem, 4vw, 2.5rem);
  text-transform: none;
  margin-bottom: 18px;
}
.doc {
  padding: 28px;
  max-width: 52em;
  display: grid;
  gap: 18px;
}
h2 {
  text-transform: none;
  font-size: 1.15rem;
  margin-bottom: 6px;
}
.para {
  white-space: pre-line;
  margin-bottom: 8px;
}
@media (max-width: 640px) {
  .doc {
    padding: 18px;
  }
}
</style>
