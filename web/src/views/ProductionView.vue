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
const GROUPS: { statut: OrderStatut; title: string }[] = [
  { statut: 'validee', title: 'À lancer' },
  { statut: 'fabrication', title: 'En fabrication' },
  { statut: 'prete', title: 'Prêtes, à livrer ou à faire retirer' },
]
const groups = computed(() => GROUPS.map((g) => ({ ...g, orders: orders.value.filter((o) => o.statut === g.statut) })))
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

  <div v-else class="groups">
    <section v-for="g in groups" :key="g.statut" class="group" :aria-labelledby="`g-${g.statut}`">
      <h2 :id="`g-${g.statut}`">
        {{ g.title }} <span class="count">{{ g.orders.length }}</span>
      </h2>
      <p v-if="!g.orders.length" class="muted none">Aucune.</p>
      <article v-for="o in g.orders" :key="o.id" class="card order" :class="{ late: late(o) }">
        <RouterLink :to="{ name: 'production-order', params: { id: o.id } }" class="numero mono">{{ o.numero }}</RouterLink>
        <span class="pill" :class="statutOf(o.statut).tone">{{ statutOf(o.statut).label }}</span>
        <span v-if="o.kind === 'boutique'" class="pill accent">Boutique</span>
        <p class="meta">
          <span><AppIcon name="calendar" :size="15" /> {{ shortDay(o.datePrevue) }}<b v-if="late(o)" class="late-label"> en retard</b></span>
          <span><AppIcon name="layers" :size="15" /> {{ o.pieces }} {{ o.kind === 'boutique' ? 'article' : 'pièce' }}{{ o.pieces > 1 ? 's' : '' }} ({{ o.lignes }} réf.)</span>
          <span><AppIcon :name="o.livraisonMode === 'retrait' ? 'home' : 'truck'" :size="15" /> {{ o.livraisonMode === 'retrait' ? 'Retrait' : 'Livraison' }}</span>
        </p>
        <div class="row-actions">
          <button v-if="o.next" class="btn small" :class="{ primary: o.statut !== 'prete' }" type="button" :disabled="busy === o.id" @click="advance(o)">{{ STEP_ACTIONS[o.next] }}</button>
          <a class="btn small" :href="sheetUrl(o.id)" target="_blank" rel="noopener" :aria-label="`Imprimer la fiche ${o.numero}`" title="Imprimer la fiche"
            ><AppIcon name="printer" :size="15" />Fiche</a
          >
        </div>
      </article>
    </section>
  </div>
</template>

<style scoped>
.groups {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  align-items: start;
}
.group {
  display: grid;
  gap: 10px;
  min-width: 0;
}
.group h2 {
  margin: 0;
  font-size: 1rem;
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
@media (max-width: 1100px) {
  .groups {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
