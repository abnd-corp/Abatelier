<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, ApiError } from '@/api'
import { useAuthStore } from '@/stores/auth'
import AppIcon from '@/components/AppIcon.vue'
import PlanAtelierCanvas from '@/components/PlanAtelierCanvas.vue'
import { shortDay } from '@/lib/orders'
import { LIEUX, placeOrders, resume, stockLayout, type Lieu, type PlanData } from '@/lib/plan-atelier'
import { ETAT_LABELS, type EtatStock } from '@/lib/stock'

// Plan de l'atelier : les commandes et le stock, lus dans les mêmes données que « Fabrication » et « Stock de feuilles », mis en images.
// Lecture seule : un clic sur un colis ou sur un rack ouvre la page correspondante.
const router = useRouter()
const auth = useAuthStore()
// La fiche d'une commande s'ouvre pour qui gère les commandes ; sans ce droit, le plan reste un simple tableau
const canOpen = computed(() => auth.can('orders.manage'))
const data = ref<PlanData>({ orders: [], feuilles: [], reception: null })
const error = ref('')
const loading = ref(true)
const selected = ref<string | null>(null)
// Les listes se rangent pour laisser tout le plan visible ; ouvertes par défaut sur un grand écran
const listes = ref(typeof window === 'undefined' || typeof window.matchMedia !== 'function' ? true : window.matchMedia('(min-width: 1001px)').matches)
const entier = ref(false)
const fullscreenOk = typeof document !== 'undefined' && !!document.documentElement.requestFullscreen
async function basculerEntier() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await document.documentElement.requestFullscreen()
  } catch {
    // refusé par le navigateur : le plan reste simplement sur toute la page
  }
}
function onFullscreen() {
  entier.value = !!document.fullscreenElement
}
const majLe = ref<Date | null>(null)

async function load() {
  try {
    data.value = await api<PlanData>('/plan')
    error.value = ''
    majLe.value = new Date()
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Chargement impossible.'
  } finally {
    loading.value = false
  }
}

// Le plan se met à jour tout seul, tant que la page est visible
let timer: ReturnType<typeof setInterval> | undefined
const REFRESH_MS = 15_000
const visible = () => typeof document === 'undefined' || document.visibilityState === 'visible'
function onVisible() {
  if (visible()) void load()
}
onMounted(() => {
  void load()
  timer = setInterval(() => visible() && void load(), REFRESH_MS)
  document.addEventListener('visibilitychange', onVisible)
  document.addEventListener('fullscreenchange', onFullscreen)
})
onBeforeUnmount(() => {
  clearInterval(timer)
  document.removeEventListener('visibilitychange', onVisible)
  document.removeEventListener('fullscreenchange', onFullscreen)
})

const placed = computed(() => placeOrders(data.value.orders))
const stock = computed(() => stockLayout(data.value.feuilles))
const camion = computed(() => data.value.reception)
const parLieu = (l: Lieu) => placed.value.filter((p) => p.lieu === l)
const entieres = computed(() => data.value.feuilles.filter((f) => !f.chute && !f.archivee))
const totalFeuilles = computed(() => stock.value.racks.reduce((n, r) => n + r.total, 0))
const sousSeuil = computed(() => entieres.value.filter((f) => f.etat !== 'ok'))
const label = computed(() => resume(placed.value, stock.value.racks, stock.value.chutes))
const plan = ref<InstanceType<typeof PlanAtelierCanvas> | null>(null)

function openOrder(id: string) {
  // Un premier clic désigne la commande sur le plan, un second ouvre sa fiche
  if (selected.value === id && canOpen.value) void router.push({ name: 'order', params: { id } })
  else selected.value = id
}
const toneOf = (e: EtatStock) => (e === 'ok' ? 'ok' : e === 'bas' ? 'warn' : 'bad')
const hour = computed(() => majLe.value?.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) ?? '')
</script>

<template>
  <div class="plein">
    <PlanAtelierCanvas
      ref="plan"
      class="fond"
      :placed="placed"
      :racks="stock.racks"
      :chutes="stock.chutes"
      :couches-chutes="stock.couchesChutes"
      :camion="camion"
      :selected="selected"
      :label="label"
      @select-order="openOrder"
      @select-rack="listes = true"
    />

    <header class="barre">
      <RouterLink :to="{ name: 'dashboard' }" class="btn small"><AppIcon name="arrow-left" :size="15" />Fermer</RouterLink>
      <h1>Plan de l’atelier</h1>
      <span v-if="majLe" class="muted maj">Mis à jour à {{ hour }}</span>
      <span class="espace"></span>
      <button class="btn small" type="button" :aria-pressed="listes" aria-controls="listes-plan" @click="listes = !listes"><AppIcon name="list" :size="15" />Listes</button>
      <button v-if="fullscreenOk" class="btn small" type="button" :aria-pressed="entier" @click="basculerEntier">{{ entier ? 'Quitter l’écran entier' : 'Écran entier' }}</button>
    </header>

    <p v-if="error" class="alert bad flottant" role="alert">{{ error }}</p>

    <div class="legende" aria-hidden="true">
      <span v-for="l in LIEUX.filter((x) => x.id !== 'a-livrer')" :key="l.id"><i class="dot" :class="l.tone"></i>{{ l.id === 'a-retirer' ? 'Prête' : l.titre }}</span>
    </div>
    <div class="zoom">
      <button class="btn small" type="button" aria-label="Zoomer" @click="plan?.zoom(1.2)"><AppIcon name="plus" :size="15" /></button>
      <button class="btn small" type="button" aria-label="Dézoomer" @click="plan?.zoom(1 / 1.2)">−</button>
      <button class="btn small" type="button" @click="plan?.fit()">Recentrer</button>
    </div>

    <aside v-show="listes" id="listes-plan" class="listes" aria-label="Commandes et stock">
      <section aria-labelledby="h-commandes">
        <h2 id="h-commandes">Commandes</h2>
        <p v-if="!loading && !placed.length" class="muted">Rien à fabriquer pour l’instant.</p>
        <template v-for="l in LIEUX" :key="l.id">
          <div v-if="parLieu(l.id).length" class="groupe" :data-lieu="l.id">
            <h3>
              <span class="pill" :class="l.tone">{{ l.titre }}</span
              ><span class="count">{{ parLieu(l.id).length }}</span>
            </h3>
            <ul>
              <li v-for="p in parLieu(l.id)" :key="p.order.id" :class="{ choisie: selected === p.order.id }">
                <button type="button" class="ligne" :aria-pressed="selected === p.order.id" @click="selected = selected === p.order.id ? null : p.order.id">
                  <span class="mono">{{ p.order.numero }}</span>
                  <span class="qui">{{ p.order.client }}</span>
                  <span v-if="p.order.modeles" class="muted modeles">{{ p.order.modeles }}</span>
                  <span class="muted"
                    >{{ shortDay(p.order.datePrevue) }} · {{ p.order.pieces }} pièce{{ p.order.pieces > 1 ? 's' : ''
                    }}<template v-if="p.machine"> · {{ p.machine === 'plieuse' ? 'plieuse' : 'cisaille' }}</template></span
                  >
                </button>
                <RouterLink v-if="canOpen" :to="{ name: 'order', params: { id: p.order.id } }" class="ouvrir" :aria-label="`Ouvrir la fiche de ${p.order.numero}`"
                  ><AppIcon name="arrow-left" :size="15" style="transform: scaleX(-1)"
                /></RouterLink>
              </li>
            </ul>
          </div>
        </template>
      </section>

      <section aria-labelledby="h-stock">
        <h2 id="h-stock">Stock de feuilles</h2>
        <template v-if="!loading || data.feuilles.length">
          <p class="muted resumes">
            {{ totalFeuilles }} feuille{{ totalFeuilles > 1 ? 's' : '' }} entière{{ totalFeuilles > 1 ? 's' : '' }} · {{ stock.chutes }} chute{{ stock.chutes > 1 ? 's' : '' }}
          </p>
          <p v-if="camion" class="alert info camion" role="status">
            <AppIcon name="truck" :size="16" />Réception en cours : {{ camion.feuilles }} feuille{{ camion.feuilles > 1 ? 's' : '' }} entrée{{ camion.feuilles > 1 ? 's' : '' }} il y a moins de 20
            minutes.
          </p>
          <p v-if="!sousSeuil.length && entieres.length" class="muted">Aucune référence sous son seuil.</p>
          <ul v-if="sousSeuil.length" class="seuils" aria-label="Références sous leur seuil">
            <li v-for="f in sousSeuil" :key="f.id">
              <span class="pill" :class="toneOf(f.etat)">{{ ETAT_LABELS[f.etat] }}</span>
              <span class="nom">{{ f.libelle }}</span>
              <b>{{ f.quantite }}</b>
            </li>
          </ul>
        </template>
      </section>
    </aside>
  </div>
</template>

<style scoped>
/* Le plan prend toute la page : le dessin au fond, les commandes de la page par-dessus */
.plein {
  position: fixed;
  inset: 0;
  background: var(--bg);
  color: var(--ink);
  overflow: hidden;
}
.fond {
  position: absolute;
  inset: 0;
}
.barre {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px max(14px, env(safe-area-inset-right, 0px)) 10px max(14px, env(safe-area-inset-left, 0px));
  padding-top: max(10px, env(safe-area-inset-top, 0px));
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  border-bottom: 1px solid var(--line);
  z-index: 3;
}
.barre h1 {
  font-size: 1.25rem;
  margin: 0;
}
.maj {
  font-size: 12.5px;
}
.espace {
  flex: 1;
}
.flottant {
  position: absolute;
  top: 64px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 3;
  margin: 0;
}
.legende {
  position: absolute;
  left: max(14px, env(safe-area-inset-left, 0px));
  top: 66px;
  display: grid;
  gap: 4px;
  font-size: 12px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r);
  padding: 8px 10px;
  z-index: 2;
}
.legende span {
  display: flex;
  align-items: center;
  gap: 6px;
}
.dot {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  background: var(--info);
}
.dot.accent {
  background: var(--accent);
}
.dot.ok {
  background: var(--ok);
}
.zoom {
  position: absolute;
  left: max(14px, env(safe-area-inset-left, 0px));
  bottom: max(14px, env(safe-area-inset-bottom, 0px));
  display: flex;
  gap: 6px;
  z-index: 2;
}
.listes {
  position: absolute;
  top: 60px;
  right: 0;
  bottom: 0;
  width: min(360px, 100%);
  overflow: auto;
  display: grid;
  align-content: start;
  gap: 20px;
  padding: 14px max(14px, env(safe-area-inset-right, 0px)) max(14px, env(safe-area-inset-bottom, 0px)) 14px;
  background: color-mix(in srgb, var(--surface) 96%, transparent);
  border-left: 1px solid var(--line);
  z-index: 2;
}
h2 {
  font-size: 1.15rem;
  margin: 0 0 8px;
}
h3 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 0 6px;
  font-size: 1rem;
}
.count {
  font-size: 13px;
  color: var(--muted);
}
ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
}
.groupe li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px;
  align-items: stretch;
}
.ligne {
  display: grid;
  gap: 2px;
  text-align: left;
  font: inherit;
  color: inherit;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r);
  padding: 8px 10px;
  cursor: pointer;
  min-width: 0;
}
.ligne:hover,
.choisie .ligne {
  border-color: var(--accent);
}
.choisie .ligne {
  background: var(--accent-soft);
}
.ligne .qui {
  font-weight: 600;
}
.ligne span {
  overflow-wrap: anywhere;
}
.ouvrir {
  display: grid;
  place-items: center;
  width: 36px;
  border: 1px solid var(--line);
  border-radius: var(--r);
  color: var(--accent);
  background: var(--surface);
}
.resumes {
  margin: 0 0 8px;
}
.camion {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 8px;
}
.seuils li {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r);
  padding: 8px 10px;
}
.seuils .nom {
  font-size: 13.5px;
  overflow-wrap: anywhere;
}
/* Sur téléphone, les listes montent du bas de l'écran et laissent voir la moitié du plan */
@media (max-width: 1000px) {
  .listes {
    top: auto;
    height: 46vh;
    width: 100%;
    border-left: 0;
    border-top: 1px solid var(--line);
  }
  .zoom {
    bottom: calc(46vh + 10px);
  }
  .maj {
    display: none;
  }
}
</style>
