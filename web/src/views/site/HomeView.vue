<script setup lang="ts">
import { computed, watch } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import SiteReviews from '@/components/site/SiteReviews.vue'
import PhotoPlaceholder from '@/components/site/PhotoPlaceholder.vue'
import ProfileSketch from '@/components/orders/ProfileSketch.vue'
import { statutOf, type OrderStatut } from '@/lib/orders'
import { setDescription } from '@/lib/seo'
import { lines, photosOf, photoUrl, site, telHref, type Emplacement } from '@/lib/site'

const c = computed(() => site.value?.contenu ?? {})
const e = computed(() => site.value?.entreprise)
const hero = computed(() => photosOf(site.value, 'accueil')[0])
const gallery = computed(() => photosOf(site.value, 'realisation'))
const pourquoi = computed(() => lines(c.value['accueil.pourquoi']))

const PRODUITS: { id: Emplacement; nom: string; accroche: string }[] = [
  { id: 'couvertine', nom: 'Couvertines', accroche: 'Protègent le dessus des murs et des acrotères' },
  { id: 'bavette', nom: 'Bavettes d’appui', accroche: 'Évacuent l’eau sous vos fenêtres' },
  { id: 'bandeau', nom: 'Bandeaux', accroche: 'Habillent les rives et les débords de toiture' },
]
// Les trois façons de commander. Texte fixe : il décrit le fonctionnement de l'application, pas un contenu éditorial.
const PARCOURS: {
  id: string
  icon: InstanceType<typeof AppIcon>['$props']['name']
  pour: string
  titre: string
  route: string
  cta: string
  principal?: boolean
  etapes: { titre: string; texte: string }[]
}[] = [
  {
    id: 'mesure',
    icon: 'sliders',
    pour: 'Pièce à vos cotes',
    titre: 'Sur mesure',
    route: 'site-configurateur',
    cta: 'Ouvrir le configurateur',
    principal: true,
    etapes: [
      { titre: 'Dessinez', texte: 'Partez d’une taille standard ou réglez vos cotes. Le profil et la 3D se mettent à jour en direct.' },
      { titre: 'Voyez le prix', texte: 'Il s’affiche tout de suite, sans compte et sans engagement.' },
      { titre: 'Recevez le devis', texte: 'Créez votre espace client : le devis numéroté vous attend en PDF.' },
      { titre: 'Acceptez en ligne', texte: 'D’un clic depuis votre espace : la commande arrive à l’atelier et part en fabrication.' },
    ],
  },
  {
    id: 'standard',
    icon: 'box',
    pour: 'Tailles courantes',
    titre: 'Boutique',
    route: 'site-boutique',
    cta: 'Voir la boutique',
    etapes: [
      { titre: 'Choisissez', texte: 'Couvertine, bavette, bandeau ou accessoire, dans la taille et le coloris voulus.' },
      { titre: 'Remplissez le panier', texte: 'Le prix TTC est affiché. Retrait à l’atelier ou livraison à votre adresse.' },
      { titre: 'Payez par carte', texte: 'Sur la page sécurisée de notre prestataire de paiement, sans saisir votre carte chez nous.' },
      { titre: 'On fabrique', texte: 'La commande arrive directement à l’atelier. La facture, déjà réglée, reste dans votre espace client.' },
    ],
  },
]

// Ce qui se passe ensuite, quel que soit le parcours : les étapes visibles dans l'espace client
const SUIVI: { statut: OrderStatut; texte: string }[] = [
  { statut: 'recue', texte: 'Votre commande est enregistrée' },
  { statut: 'validee', texte: 'L’atelier la confirme' },
  { statut: 'fabrication', texte: 'Vos pièces sont pliées' },
  { statut: 'prete', texte: 'À retirer ou à livrer' },
  { statut: 'livree', texte: 'C’est dans vos mains' },
]
watch(
  () => c.value['site.description'],
  (d) => d && setDescription(d),
  { immediate: true },
)
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
            <RouterLink :to="{ name: 'site-configurateur' }" class="s-btn primary">Configurer ma pièce</RouterLink>
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
          <div v-else class="placeholder"><PhotoPlaceholder :size="96" /></div>
        </figure>
      </div>
    </section>

    <!-- Le chemin principal : le configurateur -->
    <section class="s-wrap block" aria-labelledby="configurateur">
      <div class="card cfg">
        <div class="cfg-text">
          <span class="eyebrow">Le plus simple</span>
          <h2 id="configurateur">Configurez votre pièce en ligne</h2>
          <p class="cfg-lead">Plus besoin d’attendre un devis pour savoir combien ça coûte : dessinez votre pièce et voyez le prix tout de suite.</p>
          <ol class="cfg-steps">
            <li><b>Choisissez le modèle</b> : couvertine, bavette d’appui ou bandeau, ou partez d’un profil libre.</li>
            <li><b>Réglez les cotes</b> : le profil et la 3D se mettent à jour, et les limites de nos machines sont vérifiées pour vous.</li>
            <li><b>Voyez le prix, demandez le devis</b> : gratuit, sans compte, et nous vous répondons avec votre devis.</li>
          </ol>
          <p class="cfg-cta">
            <RouterLink :to="{ name: 'site-configurateur' }" class="s-btn primary big">Ouvrir le configurateur</RouterLink>
          </p>
        </div>
        <!-- Doublon décoratif du bouton : masqué aux lecteurs d'écran et au clavier -->
        <RouterLink :to="{ name: 'site-configurateur' }" class="cfg-visual" aria-hidden="true" tabindex="-1">
          <ProfileSketch :cotes="[20, 70, 300, 70, 20]" :angles="[-135, 90, 90, -135]" :cap="-45" color="#5b34c4" label="Exemple de profil : couvertine, dessus de 300 mm" />
          <span class="muted">Exemple : une couvertine, dessus de 300 mm</span>
        </RouterLink>
      </div>
    </section>

    <section class="s-wrap block" aria-labelledby="produits">
      <h2 id="produits">Nos pièces les plus demandées</h2>
      <ul class="products">
        <li v-for="p in PRODUITS" :key="p.id">
          <RouterLink :to="{ name: 'site-pliage', hash: `#${p.id}` }" class="card product">
            <span class="thumb">
              <img v-if="cover(p.id)" :src="photoUrl(cover(p.id)!.id)" :alt="cover(p.id)!.alt" loading="lazy" :width="cover(p.id)!.largeur" :height="cover(p.id)!.hauteur" />
              <PhotoPlaceholder v-else :size="48" />
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
        <div class="sec-head">
          <h2 id="etapes">Comment ça marche ?</h2>
          <p class="muted">Deux façons de commander, un même suivi jusqu’à la livraison.</p>
        </div>
        <ul class="parcours">
          <li v-for="p in PARCOURS" :key="p.id" class="card parcours-card">
            <div class="p-head">
              <span class="p-icon" aria-hidden="true"><AppIcon :name="p.icon" :size="22" /></span>
              <div>
                <span class="p-pour">{{ p.pour }}</span>
                <h3>{{ p.titre }}</h3>
              </div>
            </div>
            <ol class="p-steps">
              <li v-for="etape in p.etapes" :key="etape.titre">
                <b>{{ etape.titre }}</b>
                <span>{{ etape.texte }}</span>
              </li>
            </ol>
            <RouterLink :to="{ name: p.route }" class="s-btn" :class="{ primary: p.principal }">{{ p.cta }}</RouterLink>
          </li>
        </ul>
        <div class="card suivi">
          <div class="suivi-text">
            <h3>Ensuite, tout se suit en ligne</h3>
            <p class="muted">Dans votre espace client : l’étape de chaque commande, sa date estimée, vos devis et vos factures en PDF.</p>
          </div>
          <ol class="suivi-steps" aria-label="Étapes d’une commande">
            <li v-for="etape in SUIVI" :key="etape.statut" :class="statutOf(etape.statut).tone">
              <b>{{ statutOf(etape.statut).label }}</b>
              <span>{{ etape.texte }}</span>
            </li>
          </ol>
        </div>
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
      <p><RouterLink :to="{ name: 'site-configurateur' }" class="s-btn primary">Configurer ma pièce</RouterLink></p>
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
.cfg {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
  gap: 28px;
  align-items: center;
  padding: 28px;
  border-color: var(--accent);
  background: linear-gradient(135deg, var(--accent-soft), var(--surface) 70%);
}
.cfg-text {
  display: grid;
  gap: 12px;
}
.cfg h2 {
  margin: 0;
}
.cfg-lead {
  color: var(--muted);
  max-width: 34em;
}
.cfg-steps {
  margin: 0;
  padding-left: 1.2em;
  display: grid;
  gap: 8px;
}
.cfg-steps li::marker {
  color: var(--accent);
  font-weight: 700;
}
.cfg-cta {
  display: flex;
  gap: 12px 18px;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 6px;
}
.s-btn.big {
  padding: 14px 26px;
  font-size: 1.05rem;
}
.cfg-visual {
  display: grid;
  gap: 8px;
  justify-items: center;
  text-decoration: none;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 16px;
  font-size: 0.86rem;
}
.cfg-visual:hover {
  border-color: var(--accent);
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
.sec-head {
  margin-bottom: 22px;
}
.sec-head h2 {
  margin-bottom: 4px;
}
.parcours {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.parcours-card {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 22px;
  background: var(--bg);
}
.p-head {
  display: flex;
  gap: 14px;
  align-items: center;
}
.p-icon {
  flex: none;
  width: 46px;
  height: 46px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: var(--accent-soft);
  color: var(--accent);
}
.p-pour {
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
}
.parcours-card h3 {
  margin: 0;
  font-size: 1.3rem;
  text-transform: none;
}
.p-steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 16px;
  flex: 1;
  counter-reset: etape;
}
.p-steps li {
  position: relative;
  display: grid;
  gap: 2px;
  padding-left: 44px;
  counter-increment: etape;
}
.p-steps li::before {
  content: counter(etape);
  position: absolute;
  left: 0;
  top: 0;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--accent);
  color: var(--on-accent);
  font-family: var(--f-display);
  font-weight: 800;
  font-size: 0.9rem;
}
/* Trait qui relie les pastilles d'une étape à la suivante */
.p-steps li:not(:last-child)::after {
  content: '';
  position: absolute;
  left: 14px;
  top: 34px;
  bottom: -14px;
  width: 2px;
  background: var(--line);
}
.p-steps b {
  line-height: 30px;
}
.p-steps span {
  color: var(--muted);
  font-size: 0.93rem;
}
.parcours-card .s-btn {
  justify-content: center;
}
.suivi {
  margin-top: 16px;
  padding: 22px;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
  background: var(--bg);
}
.suivi h3 {
  margin: 0 0 6px;
  font-size: 1.15rem;
  text-transform: none;
}
.suivi-steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
}
.suivi-steps li {
  display: grid;
  gap: 2px;
  align-content: start;
  padding: 12px;
  border-radius: 10px;
  background: var(--surface-2);
  font-size: 0.86rem;
}
.suivi-steps b {
  color: var(--ink);
}
/* Chaque étape garde la couleur de sa pastille dans l'espace client et l'atelier */
.suivi-steps li.warn {
  background: var(--warn-soft);
}
.suivi-steps li.warn b {
  color: var(--warn);
}
.suivi-steps li.info {
  background: var(--info-soft);
}
.suivi-steps li.info b {
  color: var(--info);
}
.suivi-steps li.accent {
  background: var(--accent-soft);
}
.suivi-steps li.accent b {
  color: var(--accent);
}
.suivi-steps li.ok {
  background: var(--ok-soft);
}
.suivi-steps li.ok b {
  color: var(--ok);
}
.suivi-steps li.done {
  background: var(--done-soft);
}
.suivi-steps li.done b {
  color: var(--done);
}
.suivi-steps span {
  color: var(--muted);
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
  .cfg {
    grid-template-columns: minmax(0, 1fr);
    padding: 20px;
  }
  .cfg-cta .s-btn {
    flex: 1 1 100%;
  }
  .hero-in {
    grid-template-columns: minmax(0, 1fr);
  }
  .products,
  .parcours,
  .suivi-steps {
    grid-template-columns: minmax(0, 1fr);
  }
  .cta .s-btn {
    flex: 1 1 100%;
  }
}
</style>
