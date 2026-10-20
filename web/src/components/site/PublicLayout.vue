<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import BrandMark from '@/components/BrandMark.vue'
import AppIcon from '@/components/AppIcon.vue'
import { lines, loadSite, site, siteError, splitAddress, telHref } from '@/lib/site'
import { applyJsonLd } from '@/lib/seo'

// Enveloppe de toutes les pages publiques : en-tête, menu, pied de page. Aucun cookie, aucun script tiers.
const route = useRoute()
const open = ref(false)
const e = computed(() => site.value?.entreprise)
const horaires = computed(() => lines(site.value?.contenu['site.horaires']))
const address = computed(() => (e.value ? e.value.adresse.split('\n').filter(Boolean) : []))

const NAV = [
  { name: 'site-home', label: 'Accueil' },
  { name: 'site-pliage', label: 'Pliage aluminium' },
  { name: 'site-contact', label: 'Contact' },
] as const
const LEGAL = [
  { name: 'site-mentions', label: 'Mentions légales' },
  { name: 'site-confidentialite', label: 'Confidentialité' },
  { name: 'site-cookies', label: 'Cookies' },
  { name: 'site-cgv', label: 'Conditions générales de vente' },
] as const

onMounted(() => loadSite())
watch(() => route.fullPath, () => (open.value = false))
watch(site, (d) => d && applyJsonLd(d.entreprise, splitAddress(d.entreprise.adresse)), { immediate: true })
const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && (open.value = false)
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="site">
    <a class="skip" href="#contenu">Aller au contenu</a>
    <header class="s-head">
      <div class="s-wrap s-head-in">
        <RouterLink :to="{ name: 'site-home' }" class="s-brand" aria-label="Alu Pliage Service, accueil">
          <BrandMark class="s-mark" />
          <span class="s-brand-name">Alu Pliage <b>Service</b></span>
        </RouterLink>
        <nav id="s-menu" class="s-nav" :class="{ open }" aria-label="Navigation principale">
          <RouterLink v-for="n in NAV" :key="n.name" :to="{ name: n.name }" class="s-link" exact-active-class="active">{{ n.label }}</RouterLink>
          <a v-if="e?.telephone" class="s-link s-tel-m" :href="`tel:${telHref(e.telephone)}`"><AppIcon name="phone" :size="16" />{{ e.telephone }}</a>
        </nav>
        <a v-if="e?.telephone" class="s-tel" :href="`tel:${telHref(e.telephone)}`"><AppIcon name="phone" :size="16" />{{ e.telephone }}</a>
        <RouterLink :to="{ name: 'site-contact' }" class="s-btn primary s-quote">Demander un devis</RouterLink>
        <button class="s-burger" type="button" :aria-expanded="open" aria-controls="s-menu" :aria-label="open ? 'Fermer le menu' : 'Ouvrir le menu'" @click="open = !open">
          <AppIcon :name="open ? 'x' : 'menu'" :size="22" />
        </button>
      </div>
    </header>

    <main id="contenu" tabindex="-1">
      <p v-if="siteError" class="s-wrap s-error" role="alert">{{ siteError }}</p>
      <RouterView />
    </main>

    <footer class="s-foot">
      <div class="s-wrap s-foot-in">
        <section aria-labelledby="f-adr">
          <h2 id="f-adr">Nous trouver</h2>
          <p v-if="e">
            <b>{{ e.nom }}</b><br />
            <template v-for="l in address" :key="l">{{ l }}<br /></template>
          </p>
          <p v-if="e?.telephone"><AppIcon name="phone" :size="15" /> <a :href="`tel:${telHref(e.telephone)}`">{{ e.telephone }}</a></p>
          <p v-if="e?.email"><AppIcon name="mail" :size="15" /> <a :href="`mailto:${e.email}`">{{ e.email }}</a></p>
          <p v-if="e"><a :href="e.itineraire" target="_blank" rel="noopener noreferrer"><AppIcon name="map-pin" :size="15" /> Itinéraire</a></p>
        </section>
        <section aria-labelledby="f-h">
          <h2 id="f-h">Horaires</h2>
          <p v-for="l in horaires" :key="l">{{ l }}</p>
        </section>
        <section aria-labelledby="f-l">
          <h2 id="f-l">Informations</h2>
          <ul>
            <li v-for="l in LEGAL" :key="l.name"><RouterLink :to="{ name: l.name }">{{ l.label }}</RouterLink></li>
            <li><RouterLink :to="{ name: 'login' }">Espace atelier</RouterLink></li>
          </ul>
        </section>
      </div>
      <p class="s-wrap s-copy">© {{ new Date().getFullYear() }} {{ e?.nom ?? 'Alu Pliage Service' }}<span v-if="e?.siret"> · SIRET {{ e.siret }}</span></p>
    </footer>
  </div>
</template>

<style>
/* Pages publiques : mêmes couleurs que l'atelier (thème clair et sombre), mise en page plus aérée */
.site {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  --s-max: 1120px;
}
.site main {
  flex: 1;
  outline: none;
}
.site .skip {
  position: absolute;
  left: 8px;
  top: -60px;
  z-index: 50;
  background: var(--accent);
  color: var(--on-accent);
  padding: 8px 14px;
  border-radius: 8px;
}
.site .skip:focus {
  top: 8px;
}
.site .s-wrap {
  max-width: var(--s-max);
  margin: 0 auto;
  padding-left: max(18px, env(safe-area-inset-left));
  padding-right: max(18px, env(safe-area-inset-right));
}
.site a {
  color: var(--accent);
}

/* En-tête */
.site .s-head {
  position: sticky;
  top: 0;
  z-index: 20;
  background: color-mix(in srgb, var(--surface) 94%, transparent);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--line);
  padding-top: env(safe-area-inset-top);
}
.site .s-head-in {
  display: flex;
  align-items: center;
  gap: 18px;
  min-height: 64px;
}
.site .s-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  color: var(--ink);
  margin-right: auto;
}
.site .s-mark {
  width: 34px;
  height: 32px;
}
.site .s-brand-name {
  font-family: var(--f-display);
  font-stretch: 78%;
  font-size: 1.15rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  text-transform: uppercase;
}
.site .s-brand-name b {
  color: var(--accent);
  font-weight: 800;
}
.site .s-nav {
  display: flex;
  gap: 4px;
}
.site .s-link {
  color: var(--ink);
  text-decoration: none;
  font-weight: 600;
  font-size: 0.92rem;
  padding: 8px 12px;
  border-radius: 8px;
  display: inline-flex;
  gap: 6px;
  align-items: center;
}
.site .s-link:hover {
  background: var(--surface-2);
}
.site .s-link.active {
  color: var(--accent);
  background: var(--accent-soft);
}
.site .s-tel {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 700;
  font-size: 0.92rem;
  text-decoration: none;
  white-space: nowrap;
}
.site .s-tel-m,
.site .s-burger {
  display: none;
}
.site .s-burger {
  border: 0;
  background: none;
  width: 44px;
  height: 44px;
  border-radius: 8px;
  place-items: center;
}

/* Boutons des pages publiques */
.site .s-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--ink);
  border-radius: 10px;
  padding: 11px 20px;
  font-weight: 700;
  font-size: 0.96rem;
  text-decoration: none;
  min-height: 44px;
  cursor: pointer;
}
.site .s-btn:hover {
  border-color: var(--muted);
}
.site .s-btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent);
}
.site .s-btn.primary:hover {
  filter: brightness(1.08);
}
.site .s-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.site .s-error {
  margin-top: 16px;
  padding: 10px 14px;
  border-radius: 8px;
  background: var(--bad-soft);
  color: var(--bad);
}

/* Pied de page */
.site .s-foot {
  background: var(--surface);
  border-top: 1px solid var(--line);
  margin-top: 56px;
  padding: 36px 0 calc(24px + env(safe-area-inset-bottom));
  font-size: 0.92rem;
}
.site .s-foot-in {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 28px;
}
.site .s-foot h2 {
  font-size: 0.8rem;
  margin-bottom: 10px;
  color: var(--muted);
}
.site .s-foot p + p {
  margin-top: 6px;
}
.site .s-foot ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
}
.site .s-foot a {
  color: var(--ink);
}
.site .s-foot p a {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.site .s-foot a:hover {
  color: var(--accent);
}
.site .s-copy {
  margin-top: 28px;
  color: var(--muted);
  font-size: 0.82rem;
}

@media (max-width: 860px) {
  .site .s-tel,
  .site .s-quote {
    display: none;
  }
  .site .s-burger {
    display: grid;
  }
  .site .s-nav {
    display: none;
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    flex-direction: column;
    background: var(--surface);
    border-bottom: 1px solid var(--line);
    padding: 8px max(18px, env(safe-area-inset-left)) 14px;
  }
  .site .s-nav.open {
    display: flex;
  }
  .site .s-link {
    padding: 12px;
    font-size: 1rem;
  }
  .site .s-tel-m {
    display: inline-flex;
  }
  .site .s-foot-in {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
