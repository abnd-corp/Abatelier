<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ApiError } from '@/api'
import PhotoPlaceholder from '@/components/site/PhotoPlaceholder.vue'
import { eur } from '@/lib/catalog'
import { loadBoutique, QUANTITE_MAX, type BoutiqueData } from '@/lib/boutique'
import { paragraphs } from '@/lib/site'
import { usePanierStore } from '@/stores/panier'

// Fiche d'un produit : photo, description, choix de la déclinaison et ajout au panier
const props = defineProps<{ id: string }>()
const panier = usePanierStore()
const data = ref<BoutiqueData | null>(null)
const error = ref('')
const variantId = ref('')
const quantite = ref(1)
const ajoute = ref(false)

onMounted(async () => {
  try {
    data.value = await loadBoutique()
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'La boutique est momentanément indisponible. Réessayez dans quelques instants.'
  }
})
const produit = computed(() => data.value?.produits.find((p) => p.id === props.id) ?? null)
watch(produit, (p) => (variantId.value = p?.variantes[0]?.id ?? ''), { immediate: true })
const variante = computed(() => produit.value?.variantes.find((v) => v.id === variantId.value) ?? null)
const total = computed(() => (variante.value ? Math.round(variante.value.prixTtc * Math.max(1, quantite.value) * 100) / 100 : 0))

function add() {
  if (!variante.value) return
  const q = Math.min(QUANTITE_MAX, Math.max(1, Math.floor(Number(quantite.value) || 1)))
  quantite.value = q
  panier.add(variante.value.id, q)
  ajoute.value = true
}
watch([variantId, quantite], () => (ajoute.value = false))
</script>

<template>
  <div class="s-wrap page">
    <p><RouterLink :to="{ name: 'site-boutique' }" class="back">← Toute la boutique</RouterLink></p>
    <p v-if="error" class="alert bad" role="alert">{{ error }}</p>
    <p v-else-if="!data" class="muted" aria-busy="true">Chargement…</p>
    <section v-else-if="!produit" class="card gone">
      <h1>Ce produit n’est plus en vente</h1>
      <p class="muted">Il a peut-être été retiré, ou son adresse a changé.</p>
      <p><RouterLink :to="{ name: 'site-boutique' }" class="s-btn primary">Voir la boutique</RouterLink></p>
    </section>

    <article v-else class="produit">
      <div class="photo">
        <img v-if="produit.image" :src="produit.image.url" :alt="produit.image.alt || produit.nom" />
        <PhotoPlaceholder v-else :size="72" />
      </div>
      <div class="infos">
        <span v-if="produit.categorie" class="eyebrow">{{ produit.categorie }}</span>
        <h1>{{ produit.nom }}</h1>
        <p v-for="(t, i) in paragraphs(produit.description)" :key="i" class="desc">{{ t }}</p>

        <form class="achat card" novalidate @submit.prevent="add">
          <div class="field">
            <label for="b-variante">{{ produit.variantes.length > 1 ? 'Choisissez votre version' : 'Version' }}</label>
            <select id="b-variante" v-model="variantId" class="input">
              <option v-for="v in produit.variantes" :key="v.id" :value="v.id">{{ v.libelle }} · {{ eur(v.prixTtc) }} TTC</option>
            </select>
          </div>
          <div class="field qte">
            <label for="b-quantite">Quantité</label>
            <input id="b-quantite" v-model.number="quantite" class="input" type="number" inputmode="numeric" min="1" :max="QUANTITE_MAX" />
          </div>
          <p v-if="variante" class="total"><span class="muted">Total</span> <b>{{ eur(total) }}</b> <span class="muted">TTC</span></p>
          <p><button class="s-btn primary big" type="submit" :disabled="!variante">Ajouter au panier</button></p>
          <p v-if="ajoute" class="alert ok" role="status">Ajouté au panier. <RouterLink :to="{ name: 'site-panier' }">Voir mon panier</RouterLink> · <RouterLink :to="{ name: 'site-boutique' }">Continuer mes achats</RouterLink></p>
        </form>
        <p class="muted small">Livraison ou retrait à l’atelier au moment de la commande. Une dimension particulière ? <RouterLink :to="{ name: 'site-configurateur' }">Composez votre pièce</RouterLink>.</p>
      </div>
    </article>
  </div>
</template>

<style scoped>
.page {
  padding-top: 28px;
  padding-bottom: 48px;
  display: grid;
  gap: 16px;
}
.page > p {
  margin: 0;
}
.back {
  text-decoration: none;
}
.gone {
  padding: 28px;
  display: grid;
  gap: 8px;
  justify-items: start;
}
.gone h1,
.gone p {
  margin: 0;
}
.produit {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 32px;
  align-items: start;
}
.photo {
  aspect-ratio: 4 / 3;
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: 12px;
  overflow: hidden;
  display: grid;
  place-items: center;
}
.photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.infos {
  display: grid;
  gap: 14px;
}
.infos h1 {
  margin: 0;
  text-transform: none;
  font-size: clamp(1.7rem, 4vw, 2.4rem);
}
.desc {
  margin: 0;
  color: var(--muted);
  max-width: 40em;
}
.achat {
  padding: 18px 20px;
  display: grid;
  gap: 14px;
}
.achat p {
  margin: 0;
}
.qte {
  max-width: 9em;
}
.total {
  font-size: 1.1rem;
}
.total b {
  font-size: 1.4rem;
}
.s-btn.big {
  padding: 14px 26px;
  font-size: 1.05rem;
}
.small {
  font-size: 0.88rem;
  margin: 0;
}
@media (max-width: 800px) {
  .produit {
    grid-template-columns: minmax(0, 1fr);
    gap: 20px;
  }
  .achat .s-btn {
    width: 100%;
  }
}
</style>
