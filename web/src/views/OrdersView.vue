<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, ApiError } from '@/api'
import { eur } from '@/lib/catalog'
import { shortDay, statutOf, STATUTS, type OrderStatut, type OrderSummary } from '@/lib/orders'
import { formatDay } from '@/lib/employees'
import AppIcon from '@/components/AppIcon.vue'

type Filtre = 'en_cours' | 'toutes' | OrderStatut
const FILTRES: Filtre[] = ['en_cours', ...STATUTS.map((s) => s.value), 'toutes']

const route = useRoute()
const router = useRouter()
const orders = ref<OrderSummary[]>([])
const totals = ref<Record<OrderStatut, number>>({ recue: 0, validee: 0, fabrication: 0, prete: 0, livree: 0, annulee: 0 })
const filtre = ref<Filtre>(FILTRES.find((f) => f === route.query.filtre) ?? 'en_cours')
const q = ref(typeof route.query.q === 'string' ? route.query.q : '')
const loading = ref(true)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  const params = new URLSearchParams({ filtre: filtre.value })
  if (q.value.trim()) params.set('q', q.value.trim())
  try {
    const res = await api<{ orders: OrderSummary[]; totals: Record<OrderStatut, number> }>(`/orders?${params}`)
    orders.value = res.orders
    totals.value = res.totals
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Chargement impossible.'
  } finally {
    loading.value = false
  }
}

let timer: ReturnType<typeof setTimeout> | undefined
watch(q, () => {
  clearTimeout(timer)
  timer = setTimeout(sync, 250)
})
watch(filtre, sync)
function sync() {
  router.replace({ query: { ...(filtre.value !== 'en_cours' ? { filtre: filtre.value } : {}), ...(q.value.trim() ? { q: q.value.trim() } : {}) } })
  load()
}
onMounted(load)

const label = (f: Filtre) => (f === 'en_cours' ? 'En cours' : f === 'toutes' ? 'Toutes' : statutOf(f).label)
const count = (f: Filtre) => {
  const t = totals.value
  if (f === 'en_cours') return t.recue + t.validee + t.fabrication + t.prete
  if (f === 'toutes') return Object.values(t).reduce((s, n) => s + n, 0)
  return t[f]
}
</script>

<template>
  <div class="page-head">
    <div>
      <span class="eyebrow">Ventes</span>
      <h1>Commandes</h1>
    </div>
    <RouterLink class="btn primary" :to="{ name: 'order-new' }"><AppIcon name="plus" />Nouvelle commande</RouterLink>
  </div>

  <section class="card">
    <div class="toolbar">
      <div class="chips" role="group" aria-label="Étape">
        <button v-for="f in FILTRES" :key="f" type="button" class="chip" :aria-pressed="filtre === f" @click="filtre = f">
          {{ label(f) }} <span class="count">{{ count(f) }}</span>
        </button>
      </div>
      <label class="search">
        <AppIcon name="search" :size="16" />
        <span class="sr-only">Rechercher une commande</span>
        <input id="order-search" v-model="q" type="search" placeholder="Numéro, client…" autocomplete="off" />
      </label>
    </div>

    <p v-if="error" class="alert bad" role="alert">{{ error }}</p>

    <div v-if="!loading && !orders.length && !error" class="empty">
      <p v-if="q.trim()">Aucune commande ne correspond à « {{ q.trim() }} ».</p>
      <template v-else-if="filtre === 'en_cours'">
        <AppIcon name="box" :size="32" class="muted" />
        <p><b>Aucune commande en cours.</b></p>
        <p class="muted">Les commandes du site arriveront ici. En attendant, saisissez celles reçues par téléphone ou à l’atelier.</p>
        <RouterLink class="btn primary" :to="{ name: 'order-new' }"><AppIcon name="plus" />Saisir une commande</RouterLink>
      </template>
      <p v-else>Aucune commande à cette étape.</p>
    </div>

    <div v-else class="table-wrap">
      <table class="table fits-sm" :aria-busy="loading">
        <thead>
          <tr>
            <th>Commande</th>
            <th>Étape</th>
            <th class="hide-sm">Livraison</th>
            <th class="hide-sm">Prévue le</th>
            <th class="n">Total TTC</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="o in orders" :key="o.id" class="click" @click="router.push({ name: 'order', params: { id: o.id } })">
            <td>
              <RouterLink :to="{ name: 'order', params: { id: o.id } }" class="name mono" @click.stop>{{ o.numero }}</RouterLink>
              <span v-if="o.kind === 'boutique'" class="pill accent boutique">Boutique</span>
              <span class="sub">{{ o.client }} · {{ formatDay(o.createdAt.slice(0, 10)) }}</span>
            </td>
            <td>
              <span class="pill" :class="statutOf(o.statut).tone">{{ statutOf(o.statut).label }}</span>
            </td>
            <td class="hide-sm">
              {{ o.livraisonMode === 'retrait' ? 'Retrait' : 'Livraison' }}
              <span v-if="o.livraisonVille" class="sub">{{ o.livraisonVille }}</span>
            </td>
            <td class="nowrap hide-sm">{{ shortDay(o.datePrevue) }}</td>
            <td class="n nowrap">
              {{ eur(o.ttc) }}
              <span class="sub">{{ o.pieces }} pièce{{ o.pieces > 1 ? 's' : '' }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 14px 16px;
  border-bottom: 1px solid var(--line);
}
.count {
  font-family: var(--f-mono);
  font-size: 0.75rem;
  opacity: 0.75;
  margin-left: 2px;
}
.search {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 0 10px;
  background: var(--surface);
  color: var(--muted);
  width: min(300px, 100%);
}
.search:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.search input {
  border: 0;
  outline: none;
  background: none;
  padding: 8px 0;
  width: 100%;
  color: var(--ink);
}
.alert {
  margin: 14px 16px;
}
.name {
  font-weight: 650;
  color: var(--ink);
  text-decoration: none;
}
.name:hover {
  color: var(--accent);
  text-decoration: underline;
}
tr.click {
  cursor: pointer;
}
tr.click:hover td {
  background: var(--surface-2);
}
.nowrap {
  white-space: nowrap;
}
.empty {
  padding: 40px 20px;
  display: grid;
  justify-items: center;
  gap: 8px;
  text-align: center;
}
.empty .btn {
  margin-top: 8px;
}
.boutique {
  margin-left: 8px;
}
</style>
