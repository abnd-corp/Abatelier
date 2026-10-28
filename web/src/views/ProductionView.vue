<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api, ApiError } from '@/api'
import { sheetUrl, shortDay, statutOf, STEP_ACTIONS, type OrderStatut } from '@/lib/orders'
import { todayParis } from '@/lib/employees'
import AppIcon from '@/components/AppIcon.vue'

// Commandes à fabriquer, pour l'atelier : ni client, ni prix
interface Row {
  id: string
  numero: string
  kind: 'sur_mesure' | 'boutique'
  statut: OrderStatut
  livraisonMode: 'retrait' | 'livraison'
  datePrevue: string | null
  pieces: number
  lignes: number
  // De quoi parle la commande (« Couvertine, Bavette »), et les noms de ceux qui l'ont prise puis terminée
  modeles: string
  prisPar: string | null
  pretePar: string | null
  next: OrderStatut | null
}

const orders = ref<Row[]>([])
const loading = ref(true)
const error = ref('')
const busy = ref<string | null>(null)

async function load() {
  try {
    orders.value = (await api<{ orders: Row[] }>('/production')).orders
    error.value = ''
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Chargement impossible.'
  } finally {
    loading.value = false
  }
}
onMounted(load)

async function advance(o: Row) {
  if (!o.next) return
  busy.value = o.id
  try {
    await api(`/production/${o.id}/status`, { method: 'POST', body: { statut: o.next } })
    await load()
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'L’action a échoué.'
  } finally {
    busy.value = null
  }
}

const today = todayParis()
const late = (o: Row) => !!o.datePrevue && o.datePrevue < today && o.statut !== 'prete'
// Quatre colonnes : une commande prête n'attend pas la même chose selon qu'on vient la chercher ou qu'on la livre
type Colonne = 'a-lancer' | 'fabrication' | 'a-retirer' | 'a-livrer'
const colonneOf = (o: Row): Colonne => (o.statut === 'validee' ? 'a-lancer' : o.statut === 'fabrication' ? 'fabrication' : o.livraisonMode === 'retrait' ? 'a-retirer' : 'a-livrer')
// Trois étapes, chacune avec sa couleur (celle de son état partout dans l'application). « Prête » se partage en deux colonnes.
interface Etape {
  id: string
  titre: string
  tone: 'info' | 'accent' | 'ok'
  colonnes: { id: Colonne; titre: string }[]
}
const ETAPES: Etape[] = [
  { id: 'a-lancer', titre: 'À lancer', tone: 'info', colonnes: [{ id: 'a-lancer', titre: 'À lancer' }] },
  { id: 'fabrication', titre: 'En fabrication', tone: 'accent', colonnes: [{ id: 'fabrication', titre: 'En fabrication' }] },
  {
    id: 'prete',
    titre: 'Prête',
    tone: 'ok',
    colonnes: [
      { id: 'a-retirer', titre: 'À faire retirer' },
      { id: 'a-livrer', titre: 'À livrer' },
    ],
  },
]
const etapes = computed(() =>
  ETAPES.map((e) => {
    const colonnes = e.colonnes.map((c) => ({ ...c, orders: orders.value.filter((o) => colonneOf(o) === c.id) }))
    return { ...e, colonnes, total: colonnes.reduce((n, c) => n + c.orders.length, 0) }
  }),
)
</script>

<template>
  <div class="page-head">
    <div>
      <span class="eyebrow">Atelier</span>
      <h1>Fabrication</h1>
    </div>
  </div>

  <p v-if="error" class="alert bad" role="alert">{{ error }}</p>

  <div v-if="!loading && !orders.length && !error" class="card empty">
    <AppIcon name="box" :size="32" class="muted" />
    <p><b>Rien à fabriquer pour l’instant.</b></p>
    <p class="muted">Les commandes apparaissent ici dès qu’elles sont validées.</p>
  </div>

  <div v-else class="board">
    <div v-for="e in etapes" :key="e.id" class="etape" :class="[e.tone, { double: e.colonnes.length > 1 }]">
      <h2 :id="`e-${e.id}`" class="band">
        {{ e.titre }} <span class="count">{{ e.total }}</span>
      </h2>
      <div class="cols">
        <section v-for="c in e.colonnes" :key="c.id" class="group" :data-colonne="c.id" :aria-labelledby="e.colonnes.length > 1 ? `g-${c.id}` : `e-${e.id}`">
          <h3 v-if="e.colonnes.length > 1" :id="`g-${c.id}`" class="sub">
            {{ c.titre }} <span class="count">{{ c.orders.length }}</span>
          </h3>
          <p v-if="!c.orders.length" class="muted none">Aucune.</p>
          <article v-for="o in c.orders" :key="o.id" class="card order" :class="{ late: late(o) }">
            <RouterLink :to="{ name: 'production-order', params: { id: o.id } }" class="numero mono">{{ o.numero }}</RouterLink>
            <span class="pill" :class="statutOf(o.statut).tone">{{ statutOf(o.statut).label }}</span>
            <span v-if="o.kind === 'boutique'" class="pill accent">Boutique</span>
            <p v-if="o.modeles" class="modeles">{{ o.modeles }}</p>
            <p class="meta">
              <span><AppIcon name="calendar" :size="15" /> {{ shortDay(o.datePrevue) }}<b v-if="late(o)" class="late-label"> en retard</b></span>
              <span><AppIcon name="layers" :size="15" /> {{ o.pieces }} {{ o.kind === 'boutique' ? 'article' : 'pièce' }}{{ o.pieces > 1 ? 's' : '' }} ({{ o.lignes }} réf.)</span>
              <span><AppIcon :name="o.livraisonMode === 'retrait' ? 'home' : 'truck'" :size="15" /> {{ o.livraisonMode === 'retrait' ? 'Retrait' : 'Livraison' }}</span>
            </p>
            <p v-if="o.prisPar" class="qui">
              <AppIcon name="user" :size="15" />
              <span
                >Pris en charge par <b>{{ o.prisPar }}</b
                ><template v-if="o.pretePar"
                  >, terminé par <b>{{ o.pretePar }}</b></template
                ></span
              >
            </p>
            <p v-else-if="o.statut === 'validee'" class="qui muted"><AppIcon name="user" :size="15" /><span>Personne ne l’a encore prise</span></p>
            <div class="row-actions">
              <button v-if="o.next" class="btn small" :class="{ primary: o.statut !== 'prete' }" type="button" :disabled="busy === o.id" @click="advance(o)">{{ STEP_ACTIONS[o.next] }}</button>
              <a class="btn small" :href="sheetUrl(o.id)" target="_blank" rel="noopener" :aria-label="`Imprimer la fiche ${o.numero}`" title="Imprimer la fiche"
                ><AppIcon name="printer" :size="15" />Fiche</a
              >
            </div>
          </article>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Une couleur par étape, reprise de la pastille de l'état : bleu (à lancer), violet (en fabrication), vert (prête) */
.board {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  align-items: start;
}
.etape {
  --tone: var(--info);
  --tone-soft: var(--info-soft);
  --sub-h: 38px;
  min-width: 0;
  border: 1px solid color-mix(in srgb, var(--tone) 35%, var(--line));
  border-radius: var(--r);
  background: color-mix(in srgb, var(--tone-soft) 55%, var(--bg));
  overflow: hidden;
}
.etape.accent {
  --tone: var(--accent);
  --tone-soft: var(--accent-soft);
}
.etape.ok {
  --tone: var(--ok);
  --tone-soft: var(--ok-soft);
}
.etape.double {
  grid-column: span 2;
}
.band {
  margin: 0;
  padding: 10px 14px;
  font-size: 1rem;
  background: var(--tone-soft);
  color: var(--tone);
  border-bottom: 3px solid var(--tone);
}
.cols {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0;
}
/* Pour que les cartes des deux premières étapes démarrent à la même hauteur que celles de « Prête », qui a une ligne de plus */
.etape:not(.double) .cols {
  padding-top: var(--sub-h);
}
.etape.double .cols {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.group {
  display: grid;
  gap: 10px;
  min-width: 0;
  padding: 0 12px 12px;
  align-content: start;
}
.etape.double .group + .group {
  border-left: 1px solid color-mix(in srgb, var(--tone) 25%, var(--line));
}
.sub {
  margin: 0 -12px;
  padding: 0 12px;
  height: var(--sub-h);
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--tone);
  background: color-mix(in srgb, var(--tone-soft) 70%, transparent);
}
.count {
  font-family: var(--f-mono);
  font-size: 0.8rem;
  color: var(--muted);
}
.none {
  margin: 0;
  font-size: 0.88rem;
}
.order {
  padding: 14px 16px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
}
.order.late {
  border-color: var(--bad);
}
.numero {
  font-weight: 700;
  color: var(--ink);
  text-decoration: none;
  font-size: 1.05rem;
}
.numero:hover {
  color: var(--accent);
  text-decoration: underline;
}
.modeles {
  grid-column: 1 / -1;
  margin: 0;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.qui {
  grid-column: 1 / -1;
  margin: 0;
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 0.88rem;
}
.meta {
  grid-column: 1 / -1;
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  font-size: 0.86rem;
  color: var(--muted);
}
.meta span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.late-label {
  color: var(--bad);
}
.row-actions {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.empty {
  padding: 40px 20px;
  display: grid;
  justify-items: center;
  gap: 8px;
  text-align: center;
}
@media (max-width: 1400px) {
  .board {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .etape.double {
    grid-column: 1 / -1;
  }
  /* Les étapes ne sont plus côte à côte avec « Prête » : plus besoin d'aligner les cartes sur sa ligne de sous-titre */
  .etape:not(.double) .cols {
    padding-top: 12px;
  }
}
@media (max-width: 800px) {
  .board {
    grid-template-columns: minmax(0, 1fr);
  }
  .etape.double .cols {
    grid-template-columns: minmax(0, 1fr);
  }
  .etape.double .group + .group {
    border-left: 0;
  }
}
</style>
