<script setup lang="ts">
import { computed, watch } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import SiteReviews from '@/components/site/SiteReviews.vue'
import { setDescription } from '@/lib/seo'
import { lines, photosOf, photoUrl, site, telHref, type Emplacement } from '@/lib/site'

const c = computed(() => site.value?.contenu ?? {})
const e = computed(() => site.value?.entreprise)
const hero = computed(() => photosOf(site.value, 'accueil')[0])
const gallery = computed(() => photosOf(site.value, 'realisation'))
const etapes = computed(() => [1, 2, 3, 4].map((n) => c.value[`accueil.etape${n}`]).filter(Boolean))
const pourquoi = computed(() => lines(c.value['accueil.pourquoi']))

const PRODUITS: { id: Emplacement; nom: string; accroche: string }[] = [
  { id: 'couvertine', nom: 'Couvertines', accroche: 'Protègent le dessus des murs et des acrotères' },
  { id: 'bavette', nom: 'Bavettes d’appui', accroche: 'Évacuent l’eau sous vos fenêtres' },
  { id: 'bandeau', nom: 'Bandeaux', accroche: 'Habillent les rives et les débords de toiture' },
]
watch(() => c.value['site.description'], (d) => d && setDescription(d), { immediate: true })
const cover = (id: Emplacement) => photosOf(site.value, id)[0]
</script>

<template>
  <div v-if="site">
    <section class="hero">
      <div class="s-wrap hero-in">
        <div class="hero-text">
          <span class="eyebrow">Fraisses · près de Saint-Étienne</span>
          <h1>{{ c['accueil.titre'] }}</h1>
          <p class="lead">{{ c['accueil.accroche'] }}</p>
          <p class="cta">
            <RouterLink :to="{ name: 'site-contact' }" class="s-btn primary">Demander un devis</RouterLink>
            <a v-if="e?.telephone" class="s-btn" :href="`tel:${telHref(e.telephone)}`"><AppIcon name="phone" :size="17" />{{ e.telephone }}</a>
          </p>
          <ul class="facts" aria-label="En bref">
            <li>Sur mesure jusqu’à 3 m</li>
            <li>Aluminium et acier</li>
            <li>Pros et particuliers</li>
          </ul>
        </div>
        <figure class="hero-photo">
          <img v-if="hero" :src="photoUrl(hero.id)" :alt="hero.alt" :width="hero.largeur" :height="hero.hauteur" fetchpriority="high" />
          <div v-else class="placeholder" aria-hidden="true"><AppIcon name="profile" :size="96" /></div>
        </figure>
      </div>
    </section>

    <section class="s-wrap block" aria-labelledby="produits">
      <h2 id="produits">Nos pièces les plus demandées</h2>
      <ul class="products">
        <li v-for="p in PRODUITS" :key="p.id">
          <RouterLink :to="{ name: 'site-pliage', hash: `#${p.id}` }" class="card product">
            <span class="thumb">
              <img v-if="cover(p.id)" :src="photoUrl(cover(p.id)!.id)" :alt="cover(p.id)!.alt" loading="lazy" :width="cover(p.id)!.largeur" :height="cover(p.id)!.hauteur" />
              <AppIcon v-else name="profile" :size="48" aria-hidden="true" />
            </span>
            <span class="body">
              <b>{{ p.nom }}</b>
              <span class="muted">{{ p.accroche }}</span>
              <span class="more">En savoir plus →</span>
            </span>
          </RouterLink>
        </li>
      </ul>
    </section>

    <section class="s-wrap block intro">
      <p>{{ c['accueil.presentation'] }}</p>
    </section>

    <section class="steps-band">
      <div class="s-wrap">
        <h2 id="etapes">Comment ça marche ?</h2>
        <ol class="steps" aria-labelledby="etapes">
          <li v-for="(t, i) in etapes" :key="i" class="card step">
            <span class="num" aria-hidden="true">{{ i + 1 }}</span>
            <p>{{ t }}</p>
          </li>
        </ol>
        <p class="after"><RouterLink :to="{ name: 'site-contact' }" class="s-btn primary">Envoyer mon plan</RouterLink></p>
      </div>
    </section>

    <section v-if="gallery.length" class="s-wrap block" aria-labelledby="realisations">
      <h2 id="realisations">Quelques réalisations</h2>
      <ul class="gallery">
        <li v-for="p in gallery" :key="p.id"><img :src="photoUrl(p.id)" :alt="p.alt" loading="lazy" :width="p.largeur" :height="p.hauteur" /></li>
      </ul>
    </section>

    <SiteReviews />

    <section class="s-wrap block why" aria-labelledby="pourquoi">
      <h2 id="pourquoi">Pourquoi choisir {{ e?.nom ?? 'Alu Pliage Service' }} ?</h2>
      <ul>
        <li v-for="l in pourquoi" :key="l"><AppIcon name="check" :size="18" />{{ l }}</li>
      </ul>
      <p><RouterLink :to="{ name: 'site-contact' }" class="s-btn primary">Demandez votre devis</RouterLink></p>
    </section>
  </div>
  <div v-else class="s-wrap loading" aria-busy="true">Chargement…</div>
</template>

<style scoped>
.loading {
  padding: 80px 0;
  color: var(--muted);
}
.hero {
  background: linear-gradient(180deg, var(--accent-soft), transparent 85%);
  padding: 40px 0 28px;
}
.hero-in {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
  gap: 36px;
  align-items: center;
}
.hero h1 {
  font-size: clamp(2.1rem, 5vw, 3.4rem);
  margin: 8px 0 14px;
  text-transform: none;
}
.lead {
  font-size: 1.15rem;
  color: var(--muted);
  max-width: 34em;
}
.cta {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 22px;
}
.facts {
  list-style: none;
  padding: 0;
  margin: 22px 0 0;
  display: flex;
  gap: 8px 18px;
  flex-wrap: wrap;
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--muted);
}
.facts li::before {
  content: '';
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent);
  margin-right: 8px;
}
.hero-photo {
  margin: 0;
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid var(--line);
  background: var(--surface);
  aspect-ratio: 4 / 3;
}
.hero-photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.placeholder {
  height: 100%;
  display: grid;
  place-items: center;
  color: var(--accent);
  background: var(--surface);
}
.block {
  padding-top: 44px;
}
.block h2,
.steps-band h2 {
  font-size: clamp(1.3rem, 3vw, 1.8rem);
  text-transform: none;
  margin-bottom: 18px;
}
.products {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}
.product {
  display: flex;
  flex-direction: column;
  height: 100%;
  text-decoration: none;
  color: var(--ink);
  overflow: hidden;
}
.product:hover {
  border-color: var(--accent);
}
.thumb {
  aspect-ratio: 16 / 10;
  background: var(--surface-2);
  display: grid;
  place-items: center;
  color: var(--accent);
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.body {
  display: grid;
  gap: 4px;
  padding: 16px;
}
.body b {
  font-size: 1.1rem;
}
.more {
  color: var(--accent);
  font-weight: 600;
  margin-top: 6px;
}
.intro p {
  max-width: 52em;
  font-size: 1.08rem;
}
.steps-band {
  margin-top: 48px;
  padding: 44px 0;
  background: var(--surface);
  border-block: 1px solid var(--line);
}
.steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}
.step {
  padding: 18px;
  display: grid;
  gap: 10px;
  align-content: start;
  background: var(--bg);
}
.num {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--accent);
  color: var(--on-accent);
  font-family: var(--f-display);
  font-weight: 800;
}
.after {
  margin-top: 22px;
}
.gallery {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
}
/* « height: auto » : sans lui, l'attribut height de la photo l'emporte sur le rapport 4/3 */
.gallery img {
  width: 100%;
  height: auto;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  border-radius: 12px;
  border: 1px solid var(--line);
  display: block;
}
.why ul {
  list-style: none;
  padding: 0;
  margin: 0 0 22px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 10px 20px;
}
.why li {
  display: flex;
  gap: 10px;
  align-items: center;
  font-weight: 600;
}
.why li svg {
  color: var(--ok);
  flex: none;
}
@media (max-width: 860px) {
  .hero-in {
    grid-template-columns: minmax(0, 1fr);
  }
  .products,
  .steps {
    grid-template-columns: minmax(0, 1fr);
  }
  .cta .s-btn {
    flex: 1 1 100%;
  }
}
@media (min-width: 861px) and (max-width: 1100px) {
  .steps {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
