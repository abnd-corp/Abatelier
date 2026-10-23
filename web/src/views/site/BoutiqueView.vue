<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ApiError } from '@/api'
import PhotoPlaceholder from '@/components/site/PhotoPlaceholder.vue'
import { eur } from '@/lib/catalog'
import { loadBoutique, prixMin, type BoutiqueData } from '@/lib/boutique'

// Boutique en ligne : les produits actifs, par catégorie
const data = ref<BoutiqueData | null>(null)
const error = ref('')
const categorie = ref('')

onMounted(async () => {
  try {
    data.value = await loadBoutique()
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'La boutique est momentanément indisponible. Réessayez dans quelques instants.'
  }
})

const categories = computed(() => [...new Set((data.value?.produits ?? []).map((p) => p.categorie).filter(Boolean))])
const visibles = computed(() => (data.value?.produits ?? []).filter((p) => !categorie.value || p.categorie === categorie.value))
</script>

<template>
  <div class="s-wrap page">
    <header class="top">
      <span class="eyebrow">Boutique</span>
      <h1>Nos articles en aluminium, prêts à commander</h1>
      <p class="lead">
        Couvertines, bavettes, bandeaux et accessoires aux tailles courantes, avec leur prix. Pour une pièce à vos dimensions,
        <RouterLink :to="{ name: 'site-configurateur' }">utilisez le configurateur</RouterLink>.
      </p>
    </header>

    <p v-if="error" class="alert bad" role="alert">{{ error }}</p>
    <p v-else-if="!data" class="muted" aria-busy="true">Chargement…</p>
    <template v-else>
      <p v-if="!data.paiement" class="alert warn" role="status">
        Le paiement en ligne n’est pas encore ouvert. Vous pouvez préparer votre panier ; pour commander dès maintenant, <RouterLink :to="{ name: 'site-contact' }">contactez-nous</RouterLink>.
      </p>
      <div v-if="categories.length > 1" class="chips" role="group" aria-label="Catégories">
        <button type="button" class="chip" :aria-pressed="!categorie" @click="categorie = ''">Tout</button>
        <button v-for="c in categories" :key="c" type="button" class="chip" :aria-pressed="categorie === c" @click="categorie = c">{{ c }}</button>
      </div>

      <section v-if="!data.produits.length" class="card empty">
        <h2>La boutique ouvre bientôt</h2>
        <p class="muted">Nos articles arrivent. En attendant, vous pouvez composer votre pièce dans le configurateur ou nous écrire.</p>
        <p><RouterLink :to="{ name: 'site-configurateur' }" class="s-btn primary">Ouvrir le configurateur</RouterLink></p>
      </section>
      <ul v-else class="grid" aria-label="Produits">
        <li v-for="p in visibles" :key="p.id">
          <RouterLink :to="{ name: 'site-produit', params: { id: p.id } }" class="card produit">
            <span class="thumb">
              <img v-if="p.image" :src="p.image.url" :alt="p.image.alt || p.nom" loading="lazy" />
              <PhotoPlaceholder v-else :size="48" />
            </span>
            <span class="body">
              <span v-if="p.categorie" class="cat">{{ p.categorie }}</span>
              <b>{{ p.nom }}</b>
              <span class="prix"
                >{{ p.variantes.length > 1 ? 'À partir de ' : '' }}<b>{{ eur(prixMin(p)) }}</b> TTC</span
              >
            </span>
          </RouterLink>
        </li>
      </ul>
    </template>
  </div>
</template>

<style scoped>
.page {
  padding-top: 36px;
  padding-bottom: 48px;
  display: grid;
  gap: 18px;
}
.top h1 {
  font-size: clamp(1.9rem, 4.5vw, 2.8rem);
  margin: 6px 0 12px;
  text-transform: none;
}
.lead {
  color: var(--muted);
  max-width: 48em;
}
.alert.warn {
  background: var(--warn-soft);
  color: var(--warn);
}
.empty {
  padding: 28px;
  display: grid;
  gap: 8px;
  justify-items: start;
}
.empty h2,
.empty p {
  margin: 0;
}
.grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
}
.produit {
  display: grid;
  overflow: hidden;
  text-decoration: none;
  color: var(--ink);
  height: 100%;
}
.produit:hover {
  border-color: var(--accent);
}
.thumb {
  aspect-ratio: 4 / 3;
  background: var(--surface-2);
  display: grid;
  place-items: center;
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.body {
  display: grid;
  gap: 4px;
  padding: 14px 16px 16px;
  align-content: start;
}
.cat {
  font: 600 0.7rem/1 var(--f-mono);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
}
.prix {
  color: var(--muted);
}
.prix b {
  color: var(--ink);
}
</style>
