<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, ApiError } from '@/api'
import { clientName, contactName, ORIGINE_LABELS, place, type ClientSummary } from '@/lib/clients'
import { useAuthStore } from '@/stores/auth'
import AppIcon from '@/components/AppIcon.vue'
import UserAvatar from '@/components/UserAvatar.vue'

type Filtre = 'tous' | 'particulier' | 'professionnel' | 'archives'
type Totals = { particulier: number; professionnel: number; archives: number }

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
// La RH consulte les fiches sans les modifier
const canManage = auth.can('clients.manage')

const clients = ref<ClientSummary[]>([])
const totals = ref<Totals>({ particulier: 0, professionnel: 0, archives: 0 })
const filtre = ref<Filtre>((['tous', 'particulier', 'professionnel', 'archives'] as const).find((f) => f === route.query.filtre) ?? 'tous')
const q = ref(typeof route.query.q === 'string' ? route.query.q : '')
const loading = ref(true)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  const params = new URLSearchParams({ filtre: filtre.value })
  if (q.value.trim()) params.set('q', q.value.trim())
  try {
    const res = await api<{ clients: ClientSummary[]; totals: Totals }>(`/clients?${params}`)
    clients.value = res.clients
    totals.value = res.totals
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Chargement impossible.'
  } finally {
    loading.value = false
  }
}

// Recherche : on attend que la saisie se calme avant d'interroger le serveur
let timer: ReturnType<typeof setTimeout> | undefined
watch(q, () => {
  clearTimeout(timer)
  timer = setTimeout(sync, 250)
})
watch(filtre, sync)
function sync() {
  router.replace({ query: { ...(filtre.value !== 'tous' ? { filtre: filtre.value } : {}), ...(q.value.trim() ? { q: q.value.trim() } : {}) } })
  load()
}

onMounted(load)

const FILTERS: { value: Filtre; label: string; count: () => number }[] = [
  { value: 'tous', label: 'Tous', count: () => totals.value.particulier + totals.value.professionnel },
  { value: 'particulier', label: 'Particuliers', count: () => totals.value.particulier },
  { value: 'professionnel', label: 'Professionnels', count: () => totals.value.professionnel },
  { value: 'archives', label: 'Archivés', count: () => totals.value.archives },
]
</script>

<template>
  <div class="page-head">
    <div>
      <span class="eyebrow">Ventes</span>
      <h1>Clients</h1>
    </div>
    <RouterLink v-if="canManage" class="btn primary" :to="{ name: 'client-new' }"><AppIcon name="user-plus" />Ajouter un client</RouterLink>
  </div>

  <section class="card">
    <div class="toolbar">
      <div class="chips" role="group" aria-label="Type de client">
        <button v-for="f in FILTERS" :key="f.value" type="button" class="chip" :aria-pressed="filtre === f.value" @click="filtre = f.value">
          {{ f.label }} <span class="count">{{ f.count() }}</span>
        </button>
      </div>
      <label class="search">
        <AppIcon name="search" :size="16" />
        <span class="sr-only">Rechercher un client</span>
        <input id="client-search" v-model="q" type="search" placeholder="Nom, ville, téléphone…" autocomplete="off" />
      </label>
    </div>

    <p v-if="error" class="alert bad" role="alert">{{ error }}</p>

    <div v-if="!loading && !clients.length && !error" class="empty">
      <p v-if="q.trim()">Aucun client ne correspond à « {{ q.trim() }} ».</p>
      <p v-else-if="filtre === 'archives'">Aucun client archivé.</p>
      <p v-else-if="filtre !== 'tous'">Aucun client de ce type.</p>
      <template v-else>
        <AppIcon name="users" :size="32" class="muted" />
        <p><b>Aucun client pour l’instant.</b></p>
        <p class="muted">Les commandes passées sur le site créeront les fiches. En attendant, ajoutez vos clients à la main.</p>
        <RouterLink v-if="canManage" class="btn primary" :to="{ name: 'client-new' }"><AppIcon name="user-plus" />Ajouter le premier client</RouterLink>
      </template>
    </div>

    <div v-else class="table-wrap">
      <table class="table fits-sm" :aria-busy="loading">
        <thead>
          <tr>
            <th>Client</th>
            <th>Ville</th>
            <th class="hide-sm">Téléphone</th>
            <th class="hide-sm">E-mail</th>
            <th class="hide-sm">Origine</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in clients" :key="c.id" class="click" @click="router.push({ name: 'client', params: { id: c.id } })">
            <td>
              <span class="who">
                <UserAvatar :name="clientName(c)" />
                <span>
                  <RouterLink :to="{ name: 'client', params: { id: c.id } }" class="name" @click.stop>{{ clientName(c) }}</RouterLink>
                  <span class="sub">
                    <span v-if="c.type === 'professionnel'" class="pill accent">Pro</span>
                    {{ contactName(c) }}
                  </span>
                </span>
              </span>
            </td>
            <td>{{ place(c) || '—' }}</td>
            <td class="nowrap mono hide-sm">{{ c.telephone || '—' }}</td>
            <td class="hide-sm">{{ c.email || '—' }}</td>
            <td class="nowrap hide-sm">{{ ORIGINE_LABELS[c.origine] }}</td>
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
.who {
  display: flex;
  align-items: center;
  gap: 10px;
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
.sub .pill {
  font-size: 0.68rem;
  padding: 0 6px;
  margin-right: 4px;
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
</style>
