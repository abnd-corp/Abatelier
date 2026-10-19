<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, ApiError } from '@/api'
import { dateTime } from '@/lib/format'
import { describe, type AuditEntry } from '@/lib/audit-labels'

type Filter = 'all' | 'login' | 'failures' | 'accounts'
const FILTERS: Record<Filter, string> = { all: 'Tout', login: 'Connexions', failures: 'Échecs', accounts: 'Comptes' }

const route = useRoute()
const router = useRouter()

const entries = ref<AuditEntry[]>([])
const nextBefore = ref<number | null>(null)
const people = ref<{ id: string; nom: string }[]>([])
const type = ref<Filter>('all')
const userId = ref(typeof route.query.user === 'string' ? route.query.user : '')
const loading = ref(false)
const error = ref('')

async function load(more = false) {
  loading.value = true
  error.value = ''
  const params = new URLSearchParams({ type: type.value, limit: '50' })
  if (userId.value) params.set('userId', userId.value)
  if (more && nextBefore.value) params.set('before', String(nextBefore.value))
  try {
    const res = await api<{ entries: AuditEntry[]; nextBefore: number | null }>(`/audit?${params}`)
    entries.value = more ? [...entries.value, ...res.entries] : res.entries
    nextBefore.value = res.nextBefore
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Chargement impossible.'
  } finally {
    loading.value = false
  }
}

watch([type, userId], () => {
  router.replace({ query: userId.value ? { user: userId.value } : {} })
  load()
})

onMounted(async () => {
  load()
  people.value = (await api<{ users: { id: string; nom: string }[] }>('/users').catch(() => ({ users: [] }))).users
})
</script>

<template>
  <div class="page-head">
    <div>
      <span class="eyebrow">Qui a fait quoi, conservé 12 mois</span>
      <h1>Journal d’activité</h1>
    </div>
  </div>

  <section class="card">
    <div class="filters">
      <div class="chips" role="group" aria-label="Type d’activité">
        <button v-for="(label, k) in FILTERS" :key="k" type="button" class="chip" :aria-pressed="type === k" @click="type = k">{{ label }}</button>
      </div>
      <select v-model="userId" class="input compact" aria-label="Filtrer par personne">
        <option value="">Toutes les personnes</option>
        <option v-for="p in people" :key="p.id" :value="p.id">{{ p.nom }}</option>
      </select>
    </div>
    <p v-if="error" class="alert bad" role="alert">{{ error }}</p>
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Qui</th>
            <th>Action</th>
            <th>Appareil</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in entries" :key="e.id">
            <td class="mono date">{{ dateTime(e.at) }}</td>
            <td>
              <b v-if="e.nom">{{ e.nom }}</b>
              <span v-else class="muted">Inconnu</span>
              <span v-if="e.identifiant" class="sub mono">{{ e.identifiant }}</span>
            </td>
            <td>
              <span class="tone" :data-tone="describe(e).tone">{{ describe(e).text }}</span>
            </td>
            <td>
              {{ e.device }}<span class="sub mono">{{ e.ip }}</span>
            </td>
          </tr>
          <tr v-if="!entries.length && !loading">
            <td colspan="4" class="muted">Aucune activité pour ce filtre.</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="nextBefore" class="more">
      <button class="btn" type="button" :disabled="loading" @click="load(true)">{{ loading ? 'Chargement…' : 'Afficher plus' }}</button>
    </div>
  </section>
</template>

<style scoped>
.filters {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 14px 16px;
  border-bottom: 1px solid var(--line);
}
.filters .alert {
  margin: 12px 16px 0;
}
.date {
  white-space: nowrap;
  font-size: 0.82rem;
}
.tone[data-tone='bad'] {
  color: var(--bad);
  font-weight: 600;
}
.tone[data-tone='accent'] {
  color: var(--accent);
}
.more {
  padding: 14px 16px;
  border-top: 1px solid var(--line);
  text-align: center;
}
</style>
