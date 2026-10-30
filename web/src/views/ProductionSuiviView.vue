<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { api, ApiError } from '@/api'
import { sheetUrl, statutOf, type OrderStatut } from '@/lib/orders'
import { avancement, dimChute, mm, type PlanGroupe, type PlanPliage, type Suivi } from '@/lib/production'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import AppIcon from '@/components/AppIcon.vue'
import BandSketch from '@/components/orders/BandSketch.vue'
import BendSketch from '@/components/orders/BendSketch.vue'
import CuttingSketch from '@/components/orders/CuttingSketch.vue'
import OrderLineCard from '@/components/orders/OrderLineCard.vue'

// Fiche de fabrication à suivre à l'écran : la même que celle qu'on imprime, mais chaque case se coche ici, pour tous les postes.
// Du client, seulement son nom ; ni coordonnées ni prix.
interface Detail {
  order: { id: string; numero: string; client: string; statut: OrderStatut; statutLabel: string }
  lignes: {
    id: string
    repere: string | null
    modeleLabel: string
    cap: number
    materialLabel: string
    colorLabel: string
    colorHex: string
    cotes: number[]
    angles: number[]
    longueur: number
    quantite: number
    accessoires: { nom: string; unite: 'piece' | 'paire'; quantite: number }[]
  }[]
}

const route = useRoute()
const ui = useUiStore()
const auth = useAuthStore()
const id = computed(() => route.params.id as string)
const detail = ref<Detail | null>(null)
const suivi = ref<Suivi | null>(null)
const error = ref('')
const notice = ref('')
const busy = ref(false)
// Écritures en cours : on ne recharge pas par-dessus
let ecritures = 0

async function load() {
  if (ecritures) return
  try {
    const [d, s] = await Promise.all([api<Detail>(`/production/${id.value}`), api<Suivi>(`/production/${id.value}/suivi`)])
    if (ecritures) return
    detail.value = d
    suivi.value = s
    ui.crumb = { for: route.fullPath, label: d.order.numero }
    document.title = `${d.order.numero} · Suivi de fabrication · Atelier · Alu Pliage Service`
    error.value = ''
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Chargement impossible.'
  }
}
// Un collègue peut cocher de son côté : on se remet à jour de temps en temps
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  void load()
  timer = setInterval(() => void load(), 15_000)
})
onBeforeUnmount(() => clearInterval(timer))

const modifiable = computed(() => suivi.value?.modifiable ?? false)
const compte = (cle: string) => suivi.value?.checks[cle]?.count ?? 0
const par = (cle: string) => {
  const c = suivi.value?.checks[cle]
  return c?.count && c.par ? c.par : ''
}

/** Coche ou décoche tout de suite à l'écran ; si le serveur refuse, on revient en arrière et on le dit. */
async function regler(cle: string, count: number) {
  if (!suivi.value || !modifiable.value) return
  const avant = suivi.value.checks[cle]
  suivi.value.checks[cle] = { count, par: auth.user?.nom ?? null, le: new Date().toISOString() }
  ecritures++
  error.value = ''
  try {
    await api(`/production/${id.value}/suivi`, { method: 'PUT', body: { cle, count } })
  } catch (e) {
    if (avant) suivi.value.checks[cle] = avant
    else delete suivi.value.checks[cle]
    error.value = e instanceof ApiError ? e.message : 'Impossible d’enregistrer cette case.'
  } finally {
    ecritures--
  }
}
const basculer = (cle: string) => regler(cle, compte(cle) ? 0 : 1)

const avance = computed(() => (suivi.value ? avancement(suivi.value.plan, suivi.value.checks) : { fait: 0, total: 0, pourcent: 0 }))
const decoupesFaites = (g: PlanGroupe) => g.decoupes.every((d) => compte(d.cle) >= d.quantite)
const pliagesFaits = (g: PlanGroupe) => g.pliages.every((p) => compte(p.cle) >= p.quantite)
const stockFait = (g: PlanGroupe) => compte(g.stockCle) > 0
const peutStock = computed(() => auth.can('stock.manage'))
const angleTexte = (p: PlanPliage['plis'][number]) => (p.pince ? 'pince' : `${Math.abs(p.angle)}°`)

async function mettreAJourLeStock(g: PlanGroupe) {
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    const r = await api<{ sorties: string[]; chutes: string[] }>(`/production/${id.value}/suivi/stock`, { method: 'POST', body: { groupe: g.id } })
    notice.value = `Stock à jour : sorti ${r.sorties.join(', ')}${r.chutes.length ? ` ; entré ${r.chutes.join(', ')}` : ''}.`
    await load()
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'La mise à jour du stock a échoué.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <RouterLink :to="{ name: 'production-order', params: { id } }" class="back"><AppIcon name="arrow-left" :size="16" />Fiche de la commande</RouterLink>
  <p v-if="notice" class="alert ok" role="status">{{ notice }}</p>
  <p v-if="error" class="alert bad" role="alert">{{ error }}</p>

  <template v-if="detail && suivi">
    <div class="identity">
      <h1>{{ detail.order.client }}</h1>
      <span class="numero mono">{{ detail.order.numero }}</span>
      <span class="pill" :class="statutOf(detail.order.statut).tone">{{ detail.order.statutLabel }}</span>
    </div>
    <div class="progress" role="progressbar" aria-label="Avancement de la fabrication" :aria-valuenow="avance.pourcent" aria-valuemin="0" aria-valuemax="100">
      <div class="bar"><span :style="{ width: `${avance.pourcent}%` }" /></div>
      <span class="muted">{{ avance.pourcent }} % · {{ avance.fait }} / {{ avance.total }} étapes</span>
    </div>
    <p v-if="!modifiable" class="alert warn" role="status">Cette commande est prête : le suivi n’est plus modifiable.</p>
    <div class="actions">
      <a class="btn" :href="sheetUrl(detail.order.id)" target="_blank" rel="noopener"><AppIcon name="printer" :size="16" />Imprimer la fiche</a>
    </div>

    <section class="card block" aria-labelledby="pieces">
      <h2 id="pieces">Les pièces</h2>
      <div class="pieces">
        <OrderLineCard v-for="(l, i) in detail.lignes" :key="l.id" :index="i" :line="l" />
      </div>
    </section>

    <section v-for="g in suivi.plan.groupes" :key="g.id" class="card block feuille" :aria-labelledby="`g-${g.id}`" :data-groupe="g.numero">
      <header>
        <h2 :id="`g-${g.id}`">Feuille {{ g.numero }} sur {{ suivi.plan.groupes.length }}</h2>
        <span class="muted">{{ g.label }}</span>
      </header>

      <h3>1. Récupérer la matière</h3>
      <ul class="cases">
        <li v-for="r in g.recuperer" :key="r.cle">
          <label class="case">
            <input type="checkbox" :checked="compte(r.cle) > 0" :disabled="!modifiable" @change="basculer(r.cle)" />
            <span
              >{{ r.texte }} <span class="muted">· pièce {{ r.piece }}</span></span
            >
          </label>
          <small v-if="par(r.cle)" class="muted par">{{ par(r.cle) }}</small>
        </li>
      </ul>

      <h3>2. Découper <span class="muted">toutes les découpes d’abord</span></h3>
      <div v-for="d in g.decoupes" :key="d.cle" class="travail" :data-decoupe="d.piece">
        <div class="texte">
          <b>{{ d.titre }}</b>
          <span class="consigne">{{ d.consigne }}</span>
          <span v-if="d.pose" class="muted">{{ d.pose }}</span>
          <div class="compteur">
            <button type="button" class="btn" :disabled="!modifiable || compte(d.cle) <= 0" :aria-label="`Une bande de moins, pièce ${d.piece}`" @click="regler(d.cle, compte(d.cle) - 1)">−</button>
            <output :aria-label="`Bandes découpées, pièce ${d.piece}`" :class="{ complet: compte(d.cle) >= d.quantite }">{{ compte(d.cle) }} / {{ d.quantite }}</output>
            <button
              type="button"
              class="btn primary"
              :disabled="!modifiable || compte(d.cle) >= d.quantite"
              :aria-label="`Une bande découpée de plus, pièce ${d.piece}`"
              @click="regler(d.cle, compte(d.cle) + 1)"
            >
              +
            </button>
            <button type="button" class="btn" :disabled="!modifiable || compte(d.cle) >= d.quantite" @click="regler(d.cle, d.quantite)">Tout</button>
            <small v-if="par(d.cle)" class="muted par">{{ par(d.cle) }}</small>
          </div>
        </div>
        <div class="schemas">
          <CuttingSketch v-if="d.plan" :plan="d.plan" />
          <BandSketch :bande="d.bande" />
        </div>
      </div>

      <template v-if="g.pliages.length">
        <h3>3. Plier <span class="muted">puis tous les pliages</span></h3>
        <div v-for="p in g.pliages" :key="p.cle" class="travail pliage" :data-pliage="p.piece">
          <div class="texte">
            <b>{{ p.titre }}</b>
            <span class="consigne">{{ p.consigne }}</span>
            <ol class="plis">
              <li v-for="(pli, k) in p.plis" :key="k">
                {{ angleTexte(pli) }} <span class="muted">{{ pli.angle < 0 ? '▼' : '▲' }}</span>
              </li>
            </ol>
            <span class="muted">Traits de pli à partir du bord (mm) : {{ p.traits.map((t) => t.toLocaleString('fr-FR')).join(' · ') }}</span>
            <div class="compteur">
              <button type="button" class="btn" :disabled="!modifiable || compte(p.cle) <= 0" :aria-label="`Une pièce de moins, pliage pièce ${p.piece}`" @click="regler(p.cle, compte(p.cle) - 1)">
                −
              </button>
              <output :aria-label="`Pièces pliées, pièce ${p.piece}`" :class="{ complet: compte(p.cle) >= p.quantite }">{{ compte(p.cle) }} / {{ p.quantite }}</output>
              <button
                type="button"
                class="btn primary"
                :disabled="!modifiable || compte(p.cle) >= p.quantite"
                :aria-label="`Une pièce pliée de plus, pièce ${p.piece}`"
                @click="regler(p.cle, compte(p.cle) + 1)"
              >
                +
              </button>
              <button type="button" class="btn" :disabled="!modifiable || compte(p.cle) >= p.quantite" @click="regler(p.cle, p.quantite)">Tout</button>
              <small v-if="par(p.cle)" class="muted par">{{ par(p.cle) }}</small>
            </div>
          </div>
          <ol class="vignettes" aria-label="La pièce après chaque pli">
            <li v-for="(e, k) in p.etapes" :key="k">
              <BendSketch :etape="e" />
              <span>Pli {{ k + 1 }} · {{ angleTexte(p.plis[k]!) }}</span>
            </li>
          </ol>
        </div>
      </template>

      <h3>{{ g.pliages.length ? 4 : 3 }}. Mettre de côté</h3>
      <label class="case">
        <input type="checkbox" :checked="compte(g.coteCle) > 0" :disabled="!modifiable" @change="basculer(g.coteCle)" />
        <span>Mettre les pièces pliées de côté (repère de la commande dessus){{ suivi.plan.groupes.length > g.numero ? ', puis passer à la feuille suivante' : '' }}.</span>
      </label>

      <div v-if="g.chutes" class="chute" :data-chute="g.numero">
        <h3>Chute de cette feuille</h3>
        <dl>
          <dt>À garder</dt>
          <dd>{{ g.chutes.garder.length ? g.chutes.garder.map(dimChute).join(' · ') : 'Rien : pas de morceau assez grand pour servir' }}</dd>
          <dt>À jeter</dt>
          <dd>{{ g.chutes.jeter.length ? g.chutes.jeter.map(dimChute).join(' · ') : 'Rien' }}</dd>
          <dt>Total</dt>
          <dd class="muted">
            {{ g.chutes.pourcent.toLocaleString('fr-FR') }} % de la matière, soit {{ g.chutes.m2.toLocaleString('fr-FR') }} m² (on garde un morceau dont tous les côtés font au moins
            {{ mm(g.chutes.minimum) }})
          </dd>
        </dl>
        <p v-if="stockFait(g)" class="alert ok" role="status">Stock à jour pour cette feuille{{ par(g.stockCle) ? ` (${par(g.stockCle)})` : '' }}.</p>
        <template v-else-if="peutStock && modifiable && g.feuilles.length">
          <button type="button" class="btn primary" :disabled="busy || !decoupesFaites(g)" @click="mettreAJourLeStock(g)">
            Mettre à jour le stock : sortir les feuilles, entrer les chutes gardées
          </button>
          <small v-if="!decoupesFaites(g)" class="muted">Disponible quand toutes les découpes de cette feuille sont faites.</small>
          <small v-if="decoupesFaites(g) && !pliagesFaits(g)" class="muted">Les pliages ne sont pas finis, mais le stock peut déjà être mis à jour.</small>
        </template>
      </div>
      <p v-else class="muted">Chute : à noter après la découpe (aucune feuille conseillée en stock), dans « Stock de feuilles ».</p>
    </section>

    <section v-if="suivi.plan.apreparer.length" class="card block" aria-labelledby="prep">
      <h2 id="prep">À préparer à part</h2>
      <ul class="cases">
        <li v-for="a in suivi.plan.apreparer" :key="a.cle">
          <label class="case">
            <input type="checkbox" :checked="compte(a.cle) > 0" :disabled="!modifiable" @change="basculer(a.cle)" />
            <span>{{ a.texte }}</span>
          </label>
          <small v-if="par(a.cle)" class="muted par">{{ par(a.cle) }}</small>
        </li>
      </ul>
    </section>
  </template>
</template>

<style scoped>
.back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--muted);
  text-decoration: none;
  font-size: 0.88rem;
  width: fit-content;
  margin-bottom: 12px;
}
.back:hover {
  color: var(--accent);
}
.identity {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}
.identity h1 {
  font-size: clamp(1.5rem, 3vw, 2rem);
}
.identity .numero {
  color: var(--muted);
  font-size: 1rem;
}
.progress {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 10px 0;
}
.bar {
  flex: 1;
  height: 10px;
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: 99px;
  overflow: hidden;
}
.bar span {
  display: block;
  height: 100%;
  background: var(--ok);
  transition: width 0.2s;
}
.actions {
  margin: 4px 0 16px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.block {
  padding: 18px 20px;
  display: grid;
  gap: 12px;
  margin-bottom: 16px;
}
.pieces {
  display: grid;
  gap: 12px;
}
.feuille header {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 6px 14px;
  border-bottom: 2px solid var(--accent);
  padding-bottom: 8px;
}
h3 {
  margin: 8px 0 0;
  font-size: 1rem;
  text-transform: none;
}
h3 .muted {
  font-weight: 400;
  font-size: 0.85rem;
  margin-left: 8px;
}
.cases {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 4px;
}
.case {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-height: 44px;
  padding: 8px 4px;
  cursor: pointer;
}
.case input {
  width: 24px;
  height: 24px;
  margin: 0;
  flex: none;
  accent-color: var(--accent);
}
.par {
  margin-left: 40px;
}
.travail {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 260px);
  gap: 14px;
  align-items: start;
  padding: 10px 0;
  border-top: 1px dashed var(--line);
}
.travail.pliage {
  grid-template-columns: minmax(0, 1fr);
}
.schemas {
  display: grid;
  gap: 8px;
}
.texte {
  display: grid;
  gap: 4px;
  min-width: 0;
}
.consigne {
  color: var(--accent);
  font-weight: 600;
}
.compteur {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 6px;
}
.compteur .btn {
  min-width: 48px;
  min-height: 48px;
  font-size: 1.2rem;
}
.compteur output {
  min-width: 70px;
  text-align: center;
  font-weight: 700;
  font-size: 1.2rem;
  font-variant-numeric: tabular-nums;
}
.compteur output.complet {
  color: var(--ok);
}
.plis {
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  margin: 0;
  padding: 0;
  counter-reset: pli;
}
.plis li::before {
  counter-increment: pli;
  content: counter(pli) '. ';
  color: var(--accent);
  font-weight: 700;
}
.vignettes {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 8px;
}
.vignettes li {
  display: grid;
  gap: 4px;
  text-align: center;
  font-size: 0.78rem;
  font-weight: 600;
}
.vignettes li :deep(svg) {
  aspect-ratio: 4 / 3;
}
.chute {
  background: var(--surface-2);
  border-radius: var(--r);
  padding: 12px 14px;
  display: grid;
  gap: 8px;
}
.chute h3 {
  margin: 0;
  color: var(--accent);
}
.chute dl {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 4px 14px;
  margin: 0;
}
.chute dt {
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--muted);
  padding-top: 2px;
}
.chute dd {
  margin: 0;
}
.alert.warn {
  background: var(--warn-soft);
  color: var(--warn);
}
@media (max-width: 640px) {
  .travail {
    grid-template-columns: minmax(0, 1fr);
  }
  .block {
    padding: 14px;
  }
}
</style>
