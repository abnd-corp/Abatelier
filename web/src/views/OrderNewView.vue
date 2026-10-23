<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, ApiError } from '@/api'
import { clientName, place, type Client, type ClientSite, type ClientSummary } from '@/lib/clients'
import { newLine, type OrderCatalog, type OrderForm } from '@/lib/orders'
import AppIcon from '@/components/AppIcon.vue'
import OrderEditor from '@/components/orders/OrderEditor.vue'

const route = useRoute()
const router = useRouter()

const catalog = ref<OrderCatalog | null>(null)
const client = ref<Client | null>(null)
const sites = ref<ClientSite[]>([])
const form = ref<OrderForm | null>(null)
const loadError = ref('')
const error = ref<{ field?: string; msg: string } | null>(null)
const saving = ref(false)
const priced = ref(false)

// --- Choix du client ---
const q = ref('')
const results = ref<ClientSummary[]>([])
let timer: ReturnType<typeof setTimeout> | undefined
watch(q, (v) => {
  clearTimeout(timer)
  if (!v.trim()) return void (results.value = [])
  timer = setTimeout(async () => {
    try {
      results.value = (await api<{ clients: ClientSummary[] }>(`/clients?q=${encodeURIComponent(v.trim())}`)).clients.slice(0, 8)
    } catch {
      results.value = []
    }
  }, 250)
})

async function pick(id: string) {
  loadError.value = ''
  try {
    const res = await api<{ client: Client; sites: ClientSite[] }>(`/clients/${id}`)
    client.value = res.client
    sites.value = res.sites
    form.value = { clientId: id, lignes: [newLine(catalog.value!)], livraison: { mode: 'retrait' }, notes: '' }
    if (route.query.client !== id) router.replace({ query: { client: id } })
  } catch (e) {
    loadError.value = e instanceof ApiError ? e.message : 'Client introuvable.'
  }
}
function changeClient() {
  client.value = null
  form.value = null
  q.value = ''
  router.replace({ query: {} })
}

onMounted(async () => {
  try {
    catalog.value = await api<OrderCatalog>('/orders/catalog')
  } catch (e) {
    return void (loadError.value = e instanceof ApiError ? e.message : 'Chargement impossible.')
  }
  if (typeof route.query.client === 'string') await pick(route.query.client)
})

// Adresses proposées pour la livraison
const addresses = computed(() => {
  const c = client.value
  if (!c) return []
  const list = sites.value.map((s) => ({ label: s.libelle, adresse: s.adresse, codePostal: s.codePostal, ville: s.ville }))
  if (c.adresse && c.codePostal && c.ville) list.unshift({ label: 'Facturation', adresse: c.adresse, codePostal: c.codePostal, ville: c.ville })
  return list
})

const emptyCatalog = computed(() => !!catalog.value && (!catalog.value.models.length || !catalog.value.materials.length || !catalog.value.colors.length))

async function save() {
  if (!form.value) return
  error.value = null
  saving.value = true
  try {
    const res = await api<{ id: string }>('/orders', { method: 'POST', body: form.value })
    await router.push({ name: 'order', params: { id: res.id } })
  } catch (e) {
    error.value = e instanceof ApiError ? { msg: e.message, field: e.field } : { msg: 'L’enregistrement a échoué. Réessayez.' }
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="page-head">
    <div>
      <span class="eyebrow">Ventes</span>
      <h1>Nouvelle commande</h1>
    </div>
  </div>

  <p v-if="loadError" class="alert bad" role="alert">{{ loadError }}</p>
  <p v-if="emptyCatalog" class="alert bad" role="alert">Ajoutez d’abord au moins un modèle de pièce, une matière et un coloris actifs dans « Tarifs et catalogue ».</p>

  <template v-else-if="catalog">
    <section v-if="!client" class="card pick" aria-labelledby="pick-title">
      <h2 id="pick-title">Pour quel client ?</h2>
      <label class="search">
        <AppIcon name="search" :size="16" />
        <span class="sr-only">Rechercher un client</span>
        <input id="order-client-search" v-model="q" type="search" placeholder="Nom, ville, téléphone…" autocomplete="off" />
      </label>
      <ul v-if="results.length" class="results">
        <li v-for="c in results" :key="c.id">
          <button type="button" class="result" @click="pick(c.id)">
            <b>{{ clientName(c) }}</b>
            <span class="muted">{{ [c.type === 'professionnel' ? 'Pro' : 'Particulier', place(c)].filter(Boolean).join(' · ') }}</span>
          </button>
        </li>
      </ul>
      <p v-else-if="q.trim()" class="muted">Aucun client ne correspond.</p>
      <p class="muted hint">Client absent ? <RouterLink :to="{ name: 'client-new' }">Créez sa fiche</RouterLink>, puis revenez ici depuis sa fiche.</p>
    </section>

    <template v-else-if="form">
      <div class="client-bar card">
        <span>
          Client : <b>{{ clientName(client) }}</b>
          <span v-if="client.type === 'professionnel'" class="pill accent">Pro</span>
        </span>
        <button class="btn small" type="button" @click="changeClient">Changer de client</button>
      </div>
      <form novalidate @submit.prevent="save">
        <OrderEditor v-model="form" :catalog="catalog" :addresses="addresses" :error="error" @priced="priced = $event">
          <button class="btn primary" type="submit" :disabled="saving || !priced">{{ saving ? 'Enregistrement…' : 'Enregistrer la commande' }}</button>
          <RouterLink class="btn" :to="{ name: 'orders' }">Annuler</RouterLink>
        </OrderEditor>
      </form>
    </template>
  </template>
</template>

<style scoped>
.pick {
  padding: 18px 20px;
  display: grid;
  gap: 12px;
  max-width: 640px;
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
}
.search:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.search input {
  border: 0;
  outline: none;
  background: none;
  padding: 10px 0;
  width: 100%;
  color: var(--ink);
}
.results {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
}
.result {
  width: 100%;
  text-align: left;
  display: grid;
  gap: 2px;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 10px 12px;
  background: var(--surface);
  color: var(--ink);
  cursor: pointer;
}
.result:hover,
.result:focus-visible {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.result span {
  font-size: 0.82rem;
}
.hint {
  font-size: 0.84rem;
  margin: 0;
}
.client-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 12px 16px;
  margin-bottom: 16px;
}
.client-bar .pill {
  margin-left: 6px;
}
</style>
