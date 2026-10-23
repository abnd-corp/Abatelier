<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, ApiError } from '@/api'
import { eur } from '@/lib/catalog'
import { formatDay } from '@/lib/employees'
import { STATUTS, statutOf, TYPES, type BillingStatut, type BillingSummary, type BillingType } from '@/lib/billing'
import AppIcon from '@/components/AppIcon.vue'
import AccountingExport from '@/components/billing/AccountingExport.vue'

type Totals = Partial<Record<BillingStatut, { n: number; ttc: number }>>

const route = useRoute()
const router = useRouter()
const type = ref<BillingType>(TYPES.find((t) => t.value === route.query.type)?.value ?? 'facture')
const statut = ref<BillingStatut | ''>((STATUTS[type.value].find((s) => s.value === route.query.statut)?.value as BillingStatut) ?? '')
const q = ref(typeof route.query.q === 'string' ? route.query.q : '')
const documents = ref<BillingSummary[]>([])
const totals = ref<Totals>({})
const loading = ref(true)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  const params = new URLSearchParams({ type: type.value })
  if (statut.value) params.set('statut', statut.value)
  if (q.value.trim()) params.set('q', q.value.trim())
  try {
    const res = await api<{ documents: BillingSummary[]; totals: Totals }>(`/billing?${params}`)
    documents.value = res.documents
    totals.value = res.totals
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Chargement impossible.'
  } finally {
    loading.value = false
  }
}

function sync() {
  router.replace({
    query: { ...(type.value !== 'facture' ? { type: type.value } : {}), ...(statut.value ? { statut: statut.value } : {}), ...(q.value.trim() ? { q: q.value.trim() } : {}) },
  })
  load()
}
let timer: ReturnType<typeof setTimeout> | undefined
watch(q, () => {
  clearTimeout(timer)
  timer = setTimeout(sync, 250)
})
watch(statut, sync)
watch(type, () => {
  // Les statuts changent d'un type à l'autre
  if (statut.value === '') sync()
  else statut.value = ''
})
onMounted(load)

function onKey(e: KeyboardEvent) {
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
  const i = TYPES.findIndex((t) => t.value === type.value)
  const next = TYPES[(i + (e.key === 'ArrowRight' ? 1 : TYPES.length - 1)) % TYPES.length]!
  type.value = next.value
  document.getElementById(`tab-${next.value}`)?.focus()
}

const sumOf = (list: BillingStatut[]) => list.reduce((acc, s) => ({ n: acc.n + (totals.value[s]?.n ?? 0), ttc: acc.ttc + (totals.value[s]?.ttc ?? 0) }), { n: 0, ttc: 0 })
const all = computed(() => sumOf(STATUTS[type.value].map((s) => s.value)))
// Chiffres clés du type affiché
const keyFigures = computed(() => {
  if (type.value === 'facture') {
    return [
      { label: 'À encaisser', ...sumOf(['emise', 'envoyee', 'en_retard']), tone: '' },
      { label: 'En retard', ...sumOf(['en_retard']), tone: 'bad' },
      { label: 'Payées', ...sumOf(['payee']), tone: 'ok' },
    ]
  }
  if (type.value === 'devis') {
    return [
      { label: 'En attente de réponse', ...sumOf(['emis', 'envoye']), tone: '' },
      { label: 'Acceptés', ...sumOf(['accepte']), tone: 'ok' },
    ]
  }
  return [{ label: 'Total des avoirs', ...all.value, tone: '' }]
})
const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`
const docWord = computed(() => ({ devis: ['devis', 'devis'], facture: ['facture', 'factures'], avoir: ['avoir', 'avoirs'] })[type.value] as [string, string])
</script>

<template>
  <div class="page-head">
    <div>
      <span class="eyebrow">Ventes</span>
      <h1>Devis et factures</h1>
    </div>
  </div>

  <AccountingExport />

  <div class="tabs" role="tablist" aria-label="Type de document" @keydown="onKey">
    <button
      v-for="t in TYPES"
      :id="`tab-${t.value}`"
      :key="t.value"
      class="tab"
      type="button"
      role="tab"
      :aria-selected="type === t.value"
      aria-controls="billing-panel"
      :tabindex="type === t.value ? 0 : -1"
      @click="type = t.value"
    >
      {{ t.label }}
    </button>
  </div>

  <section id="billing-panel" role="tabpanel" :aria-labelledby="`tab-${type}`" class="panel">
    <dl class="figures">
      <div v-for="f in keyFigures" :key="f.label" class="figure card" :class="f.tone">
        <dt>{{ f.label }}</dt>
        <dd>
          <b>{{ eur(f.ttc) }}</b>
          <span class="muted">{{ plural(f.n, ...docWord) }} · TTC</span>
        </dd>
      </div>
    </dl>

    <div class="card">
      <div class="toolbar">
        <div v-if="STATUTS[type].length > 1" class="chips" role="group" aria-label="Statut">
          <button type="button" class="chip" :aria-pressed="statut === ''" @click="statut = ''">
            Tous <span class="count">{{ all.n }}</span>
          </button>
          <button v-for="s in STATUTS[type]" :key="s.value" type="button" class="chip" :aria-pressed="statut === s.value" @click="statut = s.value">
            {{ s.label }} <span class="count">{{ totals[s.value]?.n ?? 0 }}</span>
          </button>
        </div>
        <label class="search">
          <AppIcon name="search" :size="16" />
          <span class="sr-only">Rechercher un document</span>
          <input id="billing-search" v-model="q" type="search" placeholder="Numéro, client, commande…" autocomplete="off" />
        </label>
      </div>

      <p v-if="error" class="alert bad" role="alert">{{ error }}</p>

      <div v-if="!loading && !documents.length && !error" class="empty">
        <p v-if="q.trim()">Aucun document ne correspond à « {{ q.trim() }} ».</p>
        <template v-else-if="!statut">
          <AppIcon name="receipt" :size="32" class="muted" />
          <p>
            <b>Aucun {{ docWord[0] }} pour l’instant.</b>
          </p>
          <p v-if="type === 'avoir'" class="muted">Un avoir s’établit depuis une facture, pour l’annuler.</p>
          <p v-else class="muted">Les {{ docWord[1] }} se font depuis la fiche d’une commande.</p>
          <RouterLink v-if="type !== 'avoir'" class="btn" :to="{ name: 'orders' }"><AppIcon name="box" />Voir les commandes</RouterLink>
        </template>
        <p v-else>Aucun {{ docWord[0] }} avec ce statut.</p>
      </div>

      <div v-else class="table-wrap">
        <table class="table fits-sm" :aria-busy="loading">
          <thead>
            <tr>
              <th>Numéro</th>
              <th>Statut</th>
              <th class="hide-sm">Commande</th>
              <th class="hide-sm">{{ type === 'devis' ? 'Valable jusqu’au' : type === 'facture' ? 'Échéance' : '' }}</th>
              <th class="n">Total TTC</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in documents" :key="d.id" class="click" @click="router.push({ name: 'billing-doc', params: { id: d.id } })">
              <td>
                <RouterLink :to="{ name: 'billing-doc', params: { id: d.id } }" class="name mono" @click.stop>{{ d.numero }}</RouterLink>
                <span class="sub">{{ d.client }} · {{ formatDay(d.emisLe.slice(0, 10)) }}</span>
              </td>
              <td>
                <span class="pill" :class="statutOf(d.type, d.statut).tone">{{ statutOf(d.type, d.statut).label }}</span>
              </td>
              <td class="hide-sm">
                <RouterLink :to="{ name: 'order', params: { id: d.orderId } }" class="mono" @click.stop>{{ d.orderNumero }}</RouterLink>
              </td>
              <td class="nowrap hide-sm">
                <template v-if="d.statut === 'payee'">Payée le {{ formatDay(d.payeLe) }}</template>
                <template v-else>{{ formatDay(d.echeance) }}</template>
              </td>
              <td class="n nowrap">
                {{ eur(d.ttc) }}
                <span class="sub">{{ eur(d.ht) }} HT</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>

<style scoped>
.tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--line);
  margin-bottom: 16px;
  overflow-x: auto;
}
.tab {
  border: 0;
  background: none;
  padding: 10px 14px;
  font-weight: 600;
  color: var(--muted);
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  cursor: pointer;
  white-space: nowrap;
}
.tab:hover {
  color: var(--ink);
}
.tab[aria-selected='true'] {
  color: var(--ink);
  border-bottom-color: var(--accent);
}
.panel {
  display: grid;
  gap: 16px;
}
.figures {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
  margin: 0;
}
.figure {
  padding: 14px 16px;
  display: grid;
  gap: 4px;
}
.figure dt {
  font-size: 0.8rem;
  color: var(--muted);
  font-weight: 600;
}
.figure dd {
  margin: 0;
  display: grid;
  gap: 2px;
}
.figure b {
  font-size: 1.3rem;
  font-variant-numeric: tabular-nums;
}
.figure .muted {
  font-size: 0.78rem;
}
.figure.bad b {
  color: var(--bad);
}
.figure.ok b {
  color: var(--ok);
}
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
.empty p {
  margin: 0;
}
.empty .btn {
  margin-top: 8px;
}
@media (pointer: coarse) {
  .tab {
    min-height: 44px;
  }
}
</style>
