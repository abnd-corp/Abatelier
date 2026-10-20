<script setup lang="ts">
import { computed, nextTick, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import { lines, photosOf, photoUrl, site, type Emplacement } from '@/lib/site'

const route = useRoute()
const c = computed(() => site.value?.contenu ?? {})
const formes = computed(() => lines(c.value['pliage.formes']))
const PRODUITS: { id: Emplacement; nom: string; cle: string }[] = [
  { id: 'couvertine', nom: 'Couvertine', cle: 'produit.couvertine' },
  { id: 'bavette', nom: 'Bavette d’appui de fenêtre', cle: 'produit.bavette' },
  { id: 'bandeau', nom: 'Bandeau et planche de rive', cle: 'produit.bandeau' },
]

// Lien depuis l'accueil (#couvertine) : on attend que la page soit affichée, puis on y descend
watch(
  () => [site.value, route.hash] as const,
  async ([s, hash]) => {
    if (!s || !hash) return
    await nextTick()
    document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' })
  },
  { immediate: true },
)
</script>

<template>
  <div v-if="site" class="s-wrap page">
    <header class="top">
      <span class="eyebrow">Notre savoir-faire</span>
      <h1>Pliage aluminium sur mesure</h1>
      <p class="lead">{{ c['pliage.intro'] }}</p>
    </header>

    <article v-for="p in PRODUITS" :id="p.id" :key="p.id" class="card produit">
      <div class="photos" :class="{ vide: !photosOf(site, p.id).length }">
        <img v-for="ph in photosOf(site, p.id).slice(0, 2)" :key="ph.id" :src="photoUrl(ph.id)" :alt="ph.alt" loading="lazy" :width="ph.largeur" :height="ph.hauteur" />
        <AppIcon v-if="!photosOf(site, p.id).length" name="profile" :size="56" aria-hidden="true" />
      </div>
      <div class="texte">
        <h2>{{ p.nom }}</h2>
        <p>{{ c[p.cle] }}</p>
        <p><RouterLink :to="{ name: 'site-contact' }" class="s-btn primary">Demander un devis</RouterLink></p>
      </div>
    </article>

    <section class="card autres" aria-labelledby="formes">
      <h2 id="formes">Et aussi, sur plan</h2>
      <ul>
        <li v-for="l in formes" :key="l"><AppIcon name="check" :size="18" />{{ l }}</li>
      </ul>
      <p class="muted">Une couleur, une dimension ou un pliage particulier ? Envoyez-nous votre plan, même un croquis à la main : nous vérifions la faisabilité et vous rappelons.</p>
      <p><RouterLink :to="{ name: 'site-contact' }" class="s-btn primary">Envoyer mon plan</RouterLink></p>
    </section>
  </div>
  <div v-else class="s-wrap" aria-busy="true" style="padding: 80px 0">Chargement…</div>
</template>

<style scoped>
.page {
  padding-top: 36px;
  display: grid;
  gap: 18px;
}
.top h1 {
  font-size: clamp(1.9rem, 4.5vw, 2.8rem);
  margin: 6px 0 12px;
  text-transform: none;
}
.lead {
  font-size: 1.1rem;
  color: var(--muted);
  max-width: 46em;
}
.produit {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
  overflow: hidden;
  scroll-margin-top: 84px;
}
.photos {
  display: grid;
  grid-auto-flow: column;
  gap: 2px;
  background: var(--surface-2);
  min-height: 220px;
}
.photos.vide {
  place-items: center;
  color: var(--accent);
}
.photos img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.texte {
  padding: 24px;
  display: grid;
  gap: 12px;
  align-content: center;
}
.texte h2 {
  text-transform: none;
  font-size: 1.5rem;
}
.autres {
  padding: 24px;
  display: grid;
  gap: 14px;
}
.autres h2 {
  text-transform: none;
  font-size: 1.4rem;
}
.autres ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 8px 20px;
}
.autres li {
  display: flex;
  gap: 10px;
  align-items: center;
  font-weight: 600;
}
.autres li svg {
  color: var(--ok);
  flex: none;
}
@media (max-width: 760px) {
  .produit {
    grid-template-columns: minmax(0, 1fr);
  }
  .photos {
    aspect-ratio: 16 / 10;
    min-height: 0;
  }
}
</style>
