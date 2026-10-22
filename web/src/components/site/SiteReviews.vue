<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from '@/api'
import AppIcon from '@/components/AppIcon.vue'
import type { AvisGoogle } from '@/lib/site'

// Avis Google lus par notre serveur : le visiteur ne contacte jamais Google avant de cliquer sur un lien.
const data = ref<AvisGoogle | null>(null)
onMounted(async () => {
  try {
    data.value = await api<AvisGoogle>('/public/avis')
  } catch {
    data.value = null
  }
})
const hasReviews = computed(() => !!data.value?.avis.length)
const note = computed(() => (data.value?.note ?? 0).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }))
const stars = (n: number) => Array.from({ length: 5 }, (_, i) => i < n)
</script>

<template>
  <section v-if="data && (hasReviews || data.lien)" class="reviews" aria-labelledby="avis-titre">
    <div class="s-wrap">
      <div class="head">
        <div>
          <span class="eyebrow">Avis Google</span>
          <h2 id="avis-titre">Vos avis comptent pour nous</h2>
        </div>
        <p v-if="hasReviews && data.note" class="summary" aria-label="Note moyenne">
          <b class="score">{{ note }}</b>
          <span class="stars" aria-hidden="true"><AppIcon v-for="(on, i) in stars(Math.round(data.note))" :key="i" name="star" :size="18" :class="{ on }" /></span>
          <span class="muted">{{ data.total }} avis sur Google</span>
        </p>
      </div>

      <ul v-if="hasReviews" class="list">
        <li v-for="(a, i) in data.avis" :key="i" class="card review">
          <p class="stars" :aria-label="`${a.note} étoiles sur 5`"><AppIcon v-for="(on, j) in stars(a.note)" :key="j" name="star" :size="16" :class="{ on }" aria-hidden="true" /></p>
          <blockquote>{{ a.texte }}</blockquote>
          <p class="who">
            <b>{{ a.auteur }}</b
            ><span v-if="a.quand" class="muted"> · {{ a.quand }}</span>
          </p>
        </li>
      </ul>
      <p v-else class="muted">Retrouvez les avis de nos clients sur notre fiche Google.</p>

      <p class="links">
        <a v-if="data.lien" class="s-btn" :href="data.lien" target="_blank" rel="noopener noreferrer">Voir tous les avis sur Google</a>
        <a v-if="data.lienAvis" class="s-btn" :href="data.lienAvis" target="_blank" rel="noopener noreferrer">Laisser un avis</a>
      </p>
    </div>
  </section>
</template>

<style scoped>
.reviews {
  padding: 48px 0;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 22px;
}
h2 {
  margin-top: 4px;
  font-size: clamp(1.4rem, 3vw, 1.9rem);
  text-transform: none;
}
.summary {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.score {
  font-family: var(--f-display);
  font-size: 2rem;
  line-height: 1;
}
.stars {
  display: inline-flex;
  gap: 2px;
  color: var(--line);
}
.stars .on {
  color: #e8a317;
  fill: currentColor;
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 14px;
}
.review {
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
blockquote {
  margin: 0;
  flex: 1;
  line-height: 1.5;
}
.who {
  font-size: 0.88rem;
}
.links {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 22px;
}
</style>
