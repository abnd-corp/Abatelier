<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, ApiError } from '@/api'
import { accountStatus, CONTRAT_LABELS, employmentStatus, formatDay, fullName, type Employee } from '@/lib/employees'
import AppIcon from '@/components/AppIcon.vue'
import UserAvatar from '@/components/UserAvatar.vue'

type Statut = 'actifs' | 'partis' | 'tous'

const route = useRoute()
const router = useRouter()
const employees = ref<Employee[]>([])
const totals = ref({ actifs: 0, partis: 0 })
const statut = ref<Statut>((['actifs', 'partis', 'tous'] as const).find((s) => s === route.query.statut) ?? 'actifs')
const q = ref(typeof route.query.q === 'string' ? route.query.q : '')
const loading = ref(true)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  const params = new URLSearchParams({ statut: statut.value })
  if (q.value.trim()) params.set('q', q.value.trim())
  try {
    const res = await api<{ employees: Employee[]; totals: { actifs: number; partis: number } }>(`/employees?${params}`)
    employees.value = res.employees
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
watch(statut, sync)
function sync() {
  router.replace({ query: { ...(statut.value !== 'actifs' ? { statut: statut.value } : {}), ...(q.value.trim() ? { q: q.value.trim() } : {}) } })
  load()
}

onMounted(load)

const FILTERS: { value: Statut; label: string; count: () => number | null }[] = [
  { value: 'actifs', label: 'En poste', count: () => totals.value.actifs },
  { value: 'partis', label: 'Partis', count: () => totals.value.partis },
  { value: 'tous', label: 'Tous', count: () => totals.value.actifs + totals.value.partis },
]
</script>

<template>
  <div class="page-head">
    <div>
      <span class="eyebrow">Équipe</span>
      <h1>Salariés</h1>
    </div>
    <RouterLink class="btn primary" :to="{ name: 'employee-new' }"><AppIcon name="user-plus" />Ajouter un salarié</RouterLink>
  </div>

  <section class="card">
    <div class="toolbar">
      <div class="chips" role="group" aria-label="Situation">
        <button v-for="f in FILTERS" :key="f.value" type="button" class="chip" :aria-pressed="statut === f.value" @click="statut = f.value">
          {{ f.label }} <span class="count">{{ f.count() }}</span>
        </button>
      </div>
      <label class="search">
        <AppIcon name="search" :size="16" />
        <span class="sr-only">Rechercher un salarié</span>
        <input id="employee-search" v-model="q" type="search" placeholder="Nom, poste, identifiant…" autocomplete="off" />
      </label>
    </div>

    <p v-if="error" class="alert bad" role="alert">{{ error }}</p>

    <div v-if="!loading && !employees.length && !error" class="empty">
      <template v-if="q.trim()">
        <p>Aucun salarié ne correspond à « {{ q.trim() }} ».</p>
      </template>
      <template v-else-if="statut === 'partis'">
        <p>Aucun salarié parti.</p>
      </template>
      <template v-else>
        <AppIcon name="id" :size="32" class="muted" />
        <p><b>Aucun salarié pour l’instant.</b></p>
        <p class="muted">Ajoutez les membres de l’équipe pour suivre leurs contrats et leur donner un accès.</p>
        <RouterLink class="btn primary" :to="{ name: 'employee-new' }"><AppIcon name="user-plus" />Ajouter le premier salarié</RouterLink>
      </template>
    </div>

    <div v-else class="table-wrap">
      <table class="table" :aria-busy="loading">
        <thead>
          <tr>
            <th>Salarié</th>
            <th class="hide-sm">Contrat</th>
            <th class="hide-sm">Entrée</th>
            <th>Compte</th>
            <th class="hide-sm">Téléphone</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in employees" :key="e.id" class="click" @click="router.push({ name: 'employee', params: { id: e.id } })">
            <td>
              <span class="who">
                <UserAvatar :name="fullName(e)" />
                <span>
                  <RouterLink :to="{ name: 'employee', params: { id: e.id } }" class="name" @click.stop>{{ fullName(e) }}</RouterLink>
                  <span class="sub">{{ e.poste || 'Poste non renseigné' }}</span>
                </span>
              </span>
            </td>
            <td class="hide-sm">
              {{ e.contrat ? CONTRAT_LABELS[e.contrat] : '—' }}
              <span v-if="employmentStatus(e).tone !== 'ok'" class="sub" :class="employmentStatus(e).tone">{{ employmentStatus(e).label }}</span>
            </td>
            <td class="nowrap hide-sm">{{ formatDay(e.dateEntree) }}</td>
            <td>
              <span v-if="e.account" class="mono acc">{{ e.account.identifiant }}</span>
              <span class="pill" :class="accountStatus(e.account).tone">{{ accountStatus(e.account).label }}</span>
            </td>
            <td class="nowrap mono hide-sm">{{ e.telephone || '—' }}</td>
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
tr.click {
  cursor: pointer;
}
tr.click:hover td {
  background: var(--surface-2);
}
.acc {
  margin-right: 8px;
  font-size: 0.84rem;
}
.sub.warn {
  color: var(--warn);
}
.nowrap {
  white-space: nowrap;
}
/* Sur téléphone : nom et compte seulement, le reste est sur la fiche */
@media (max-width: 640px) {
  .hide-sm {
    display: none;
  }
  .table {
    min-width: 0;
  }
  .acc {
    display: block;
    margin: 0 0 4px;
  }
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
