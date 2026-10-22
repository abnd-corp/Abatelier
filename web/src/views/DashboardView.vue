<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { describe, type AuditEntry } from '@/lib/audit-labels'
import { dateTime, relative } from '@/lib/format'
import { formatDay, fullName, type Employee } from '@/lib/employees'
import AppIcon from '@/components/AppIcon.vue'

const auth = useAuthStore()
const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const firstName = computed(() => auth.user?.nom.split(' ')[0] ?? '')

const team = ref<{ employees: Employee[]; totals: { actifs: number; partis: number } } | null>(null)
const accounts = ref<{ disabledAt: string | null; mustChangePassword: boolean; activeSessions: number }[] | null>(null)
const recent = ref<AuditEntry[]>([])
const failures = ref(0)

onMounted(async () => {
  // Chaque bloc ne se charge que si l'utilisateur y a droit ; une erreur n'empêche pas les autres
  const jobs: Promise<unknown>[] = []
  if (auth.can('employees.manage')) jobs.push(api<typeof team.value>('/employees').then((r) => (team.value = r)))
  if (auth.can('users.manage')) jobs.push(api<{ users: NonNullable<typeof accounts.value> }>('/users').then((r) => (accounts.value = r.users)))
  if (auth.can('audit.read')) {
    jobs.push(api<{ entries: AuditEntry[] }>('/audit?limit=6').then((r) => (recent.value = r.entries)))
    jobs.push(api<{ entries: AuditEntry[] }>('/audit?type=failures&limit=50').then((r) => (failures.value = r.entries.filter((e) => Date.now() - new Date(e.at).getTime() < 86400000).length)))
  }
  await Promise.allSettled(jobs)
})

const activeAccounts = computed(() => accounts.value?.filter((a) => !a.disabledAt).length ?? 0)
const pendingAccounts = computed(() => accounts.value?.filter((a) => !a.disabledAt && a.mustChangePassword).length ?? 0)
const connected = computed(() => accounts.value?.reduce((n, a) => n + (a.activeSessions > 0 ? 1 : 0), 0) ?? 0)
// Départs à venir : salariés en poste avec une date de sortie
const departures = computed(() => team.value?.employees.filter((e) => e.dateSortie).sort((a, b) => a.dateSortie!.localeCompare(b.dateSortie!)) ?? [])
</script>

<template>
  <div class="page-head">
    <div>
      <span class="eyebrow">{{ today }}</span>
      <h1>Bonjour {{ firstName }}</h1>
    </div>
  </div>

  <template v-if="auth.can('employees.manage') || auth.can('users.manage')">
    <div class="tiles">
      <RouterLink v-if="team" :to="{ name: 'employees' }" class="card tile">
        <AppIcon name="id" :size="20" class="tile-icon" />
        <span class="v">{{ team.totals.actifs }}</span>
        <span class="l">Salarié{{ team.totals.actifs > 1 ? 's' : '' }} en poste</span>
        <span class="d">{{ team.totals.partis }} parti{{ team.totals.partis > 1 ? 's' : '' }}</span>
      </RouterLink>
      <RouterLink v-if="accounts" :to="{ name: 'users' }" class="card tile">
        <AppIcon name="key" :size="20" class="tile-icon" />
        <span class="v">{{ activeAccounts }}</span>
        <span class="l">Compte{{ activeAccounts > 1 ? 's' : '' }} actif{{ activeAccounts > 1 ? 's' : '' }}</span>
        <span class="d">{{ connected }} connecté{{ connected > 1 ? 's' : '' }} en ce moment</span>
      </RouterLink>
      <RouterLink v-if="accounts" :to="{ name: 'users' }" class="card tile" :class="{ warn: pendingAccounts }">
        <AppIcon name="shield" :size="20" class="tile-icon" />
        <span class="v">{{ pendingAccounts }}</span>
        <span class="l">Compte{{ pendingAccounts > 1 ? 's' : '' }} à activer</span>
        <span class="d">Mot de passe temporaire pas encore changé</span>
      </RouterLink>
      <RouterLink v-if="auth.can('audit.read')" :to="{ name: 'audit' }" class="card tile" :class="{ bad: failures >= 5 }">
        <AppIcon name="list" :size="20" class="tile-icon" />
        <span class="v">{{ failures }}</span>
        <span class="l">Échec{{ failures > 1 ? 's' : '' }} de connexion</span>
        <span class="d">Sur les dernières 24 heures</span>
      </RouterLink>
    </div>

    <div class="grid">
      <section v-if="auth.can('audit.read')" class="card block">
        <div class="block-head">
          <h2>Dernières activités</h2>
          <RouterLink :to="{ name: 'audit' }" class="more">Journal complet</RouterLink>
        </div>
        <ol v-if="recent.length" class="timeline">
          <li v-for="a in recent" :key="a.id">
            <span class="dot" :data-tone="describe(a).tone" aria-hidden="true" />
            <div>
              <span :class="{ bad: describe(a).tone === 'bad' }"
                ><template v-if="a.nom || !a.identifiant"
                  ><b>{{ a.nom ?? 'Automatique' }}</b> · </template
                >{{ describe(a).text }}</span
              >
              <span class="sub" :title="dateTime(a.at)">{{ relative(a.at) }}</span>
            </div>
          </li>
        </ol>
        <p v-else class="muted">Rien pour l’instant.</p>
      </section>

      <section v-if="team" class="card block">
        <div class="block-head">
          <h2>Départs prévus</h2>
          <RouterLink :to="{ name: 'employees' }" class="more">Salariés</RouterLink>
        </div>
        <ul v-if="departures.length" class="list">
          <li v-for="e in departures" :key="e.id">
            <RouterLink :to="{ name: 'employee', params: { id: e.id } }">{{ fullName(e) }}</RouterLink>
            <span class="pill warn">{{ formatDay(e.dateSortie) }}</span>
          </li>
        </ul>
        <p v-else class="muted">Aucun départ prévu. Les comptes sont désactivés automatiquement le jour de la sortie.</p>
        <p v-if="team.totals.actifs === 0" class="hint"><RouterLink :to="{ name: 'employee-new' }">Ajoutez votre premier salarié</RouterLink> pour commencer.</p>
      </section>
    </div>
  </template>

  <section v-else class="card welcome">
    <h2>Bienvenue sur l’espace atelier</h2>
    <p class="muted">Les commandes, le planning et les devis arriveront ici prochainement.</p>
    <RouterLink :to="{ name: 'account' }" class="btn"><AppIcon name="user" :size="16" />Gérer mon compte</RouterLink>
  </section>
</template>

<style scoped>
.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
}
.tile {
  padding: 16px 18px;
  display: grid;
  gap: 2px;
  color: inherit;
  text-decoration: none;
  position: relative;
}
.tile:hover {
  border-color: var(--accent);
}
.tile-icon {
  position: absolute;
  top: 16px;
  right: 16px;
  color: var(--muted);
}
.v {
  font-family: var(--f-display);
  font-stretch: 80%;
  font-size: 2.2rem;
  font-weight: 750;
  line-height: 1.05;
  font-variant-numeric: tabular-nums;
}
.l {
  font-weight: 650;
  font-size: 0.9rem;
}
.d {
  font-size: 0.78rem;
  color: var(--muted);
}
.tile.warn .v {
  color: var(--warn);
}
.tile.bad .v {
  color: var(--bad);
}
.grid {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}
.block {
  padding: 18px 20px;
  display: grid;
  gap: 12px;
}
.block-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.more {
  font-size: 0.86rem;
  color: var(--accent);
}
.timeline {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 12px;
}
.timeline li {
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr);
  gap: 10px;
  font-size: 0.88rem;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-top: 6px;
  background: var(--line);
}
.dot[data-tone='accent'] {
  background: var(--accent);
}
.dot[data-tone='bad'] {
  background: var(--bad);
}
.bad {
  color: var(--bad);
}
.sub {
  display: block;
  font-size: 0.78rem;
  color: var(--muted);
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}
.list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.hint {
  font-size: 0.86rem;
}
.welcome {
  padding: 28px;
  display: grid;
  gap: 10px;
  justify-items: start;
}
@media (max-width: 960px) {
  .grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
