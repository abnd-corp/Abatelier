<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { api, ApiError } from '@/api'
import { accessLabels, useAuthStore, type Access } from '@/stores/auth'
import { relative, dateTime } from '@/lib/format'
import AccessEditor from '@/components/AccessEditor.vue'
import AppIcon from '@/components/AppIcon.vue'
import TempPasswordPanel from '@/components/TempPasswordPanel.vue'

interface UserRow {
  id: string
  identifiant: string
  nom: string
  sections: Access['sections']
  admin: boolean
  mustChangePassword: boolean
  disabledAt: string | null
  createdAt: string
  lastLoginAt: string | null
  activeSessions: number
  employeeId: string | null
}

const auth = useAuthStore()
const users = ref<UserRow[]>([])
const error = ref('')
const notice = ref('')

async function load() {
  try {
    users.value = (await api<{ users: UserRow[] }>('/users')).users
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Chargement impossible.'
  }
}
onMounted(load)

// Création d'un compte
const showForm = ref(false)
const form = reactive({ identifiant: '', nom: '', access: { sections: ['atelier'], admin: false } as Access })
const formError = ref('')
const creating = ref(false)
// Mot de passe temporaire affiché une seule fois
const temp = ref<{ nom: string; identifiant: string; password: string } | null>(null)

async function create() {
  formError.value = ''
  creating.value = true
  try {
    const res = await api<{ tempPassword: string }>('/users', { method: 'POST', body: { identifiant: form.identifiant, nom: form.nom, ...form.access } })
    temp.value = { nom: form.nom, identifiant: form.identifiant.trim().toLowerCase(), password: res.tempPassword }
    Object.assign(form, { identifiant: '', nom: '', access: { sections: ['atelier'], admin: false } })
    showForm.value = false
    await load()
  } catch (e) {
    formError.value = e instanceof ApiError ? e.message : 'Création impossible.'
  } finally {
    creating.value = false
  }
}

// Actions sur une ligne, avec confirmation sur place
type Kind = 'disable' | 'enable' | 'reset'
const pending = ref<{ id: string; kind: Kind } | null>(null)
const busy = ref(false)

async function run(u: UserRow, kind: Kind) {
  error.value = notice.value = ''
  busy.value = true
  try {
    if (kind === 'reset') {
      const res = await api<{ tempPassword: string }>(`/users/${u.id}/reset-password`, { method: 'POST' })
      temp.value = { nom: u.nom, identifiant: u.identifiant, password: res.tempPassword }
    } else {
      await api(`/users/${u.id}/${kind}`, { method: 'POST' })
      notice.value = kind === 'disable' ? `Le compte de ${u.nom} est désactivé et ses appareils ont été déconnectés.` : `Le compte de ${u.nom} est réactivé.`
    }
    await load()
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'L’action a échoué.'
  } finally {
    busy.value = false
    pending.value = null
  }
}

// Droits : on coche les sections, puis on enregistre
const editing = ref<{ id: string; access: Access } | null>(null)
const savingAccess = ref(false)
function editAccess(u: UserRow) {
  error.value = notice.value = ''
  editing.value = { id: u.id, access: { sections: [...u.sections], admin: u.admin } }
}
async function saveAccess(u: UserRow) {
  if (!editing.value) return
  error.value = notice.value = ''
  savingAccess.value = true
  try {
    await api(`/users/${u.id}`, { method: 'PATCH', body: { ...editing.value.access } })
    notice.value = `Les droits de ${u.nom} sont enregistrés.`
    editing.value = null
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Modification impossible.'
  } finally {
    savingAccess.value = false
  }
  await load()
}

const CONFIRM: Record<Kind, string> = {
  disable: 'Désactiver ce compte ? La personne sera déconnectée partout.',
  enable: 'Activer ce compte ?',
  reset: 'Générer un nouveau mot de passe temporaire ? La personne sera déconnectée partout.',
}
</script>

<template>
  <div class="page-head">
    <div>
      <span class="eyebrow">Équipe</span>
      <h1>Comptes</h1>
    </div>
    <button class="btn primary with-icon" type="button" @click="showForm = !showForm"><AppIcon name="plus" />Ajouter un compte</button>
  </div>

  <p class="muted intro">
    Les comptes servent à se connecter. Pour un membre de l’équipe, passez plutôt par
    <RouterLink :to="{ name: 'employees' }">Salariés</RouterLink> : la fiche et le compte sont créés ensemble. Ici, on gère aussi les comptes techniques (administration, poste partagé de l’atelier).
  </p>

  <TempPasswordPanel v-if="temp" :nom="temp.nom" :identifiant="temp.identifiant" :password="temp.password" @done="temp = null" />

  <form v-if="showForm" class="card new" novalidate @submit.prevent="create">
    <h2>Nouveau compte technique</h2>
    <p v-if="formError" class="alert bad" role="alert">{{ formError }}</p>
    <div class="new-grid">
      <div class="field">
        <label for="new-nom">Nom affiché</label>
        <input id="new-nom" v-model="form.nom" class="input" placeholder="Paul Martin" autocomplete="off" />
      </div>
      <div class="field">
        <label for="new-identifiant">Identifiant de connexion</label>
        <input id="new-identifiant" v-model="form.identifiant" class="input mono" placeholder="paul" autocomplete="off" autocapitalize="none" spellcheck="false" />
      </div>
    </div>
    <AccessEditor v-model="form.access" id-prefix="new" />
    <div class="row">
      <button class="btn primary" type="submit" :disabled="creating || !form.nom || !form.identifiant">{{ creating ? 'Création…' : 'Créer le compte' }}</button>
      <button class="btn" type="button" @click="showForm = false">Annuler</button>
    </div>
  </form>

  <p v-if="notice" class="alert ok" role="status">{{ notice }}</p>
  <p v-if="error" class="alert bad" role="alert">{{ error }}</p>

  <section class="card">
    <div class="table-wrap">
      <table class="table fits-sm">
        <thead>
          <tr>
            <th>Compte</th>
            <th class="hide-sm">Salarié</th>
            <th class="hide-sm">Droits</th>
            <th>Statut</th>
            <th class="hide-sm">Dernière connexion</th>
            <th class="n hide-sm">Appareils</th>
            <th class="n">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in users" :key="u.id" :class="{ off: u.disabledAt }">
            <td>
              <b>{{ u.nom }}</b
              ><span v-if="u.id === auth.user?.id" class="muted"> (vous)</span>
              <span class="sub mono">{{ u.identifiant }}</span>
            </td>
            <td class="hide-sm">
              <RouterLink v-if="u.employeeId" :to="{ name: 'employee', params: { id: u.employeeId } }">Voir la fiche</RouterLink>
              <span v-else class="muted">Compte technique</span>
            </td>
            <td class="hide-sm">
              <template v-if="editing?.id === u.id">
                <AccessEditor v-model="editing.access" :id-prefix="`droits-${u.id}`" />
                <div class="row">
                  <button class="btn small primary" type="button" :disabled="savingAccess" :aria-label="`Enregistrer les droits de ${u.nom}`" @click="saveAccess(u)">Enregistrer</button>
                  <button class="btn small" type="button" @click="editing = null">Annuler</button>
                </div>
              </template>
              <template v-else>
                <span v-for="l in accessLabels(u)" :key="l" class="pill neutral rights">{{ l }}</span>
                <span v-if="!accessLabels(u).length" class="muted">Aucun accès</span>
                <button v-if="u.id !== auth.user?.id && !u.disabledAt" class="btn small" type="button" :aria-label="`Modifier les droits de ${u.nom}`" @click="editAccess(u)">Modifier</button>
              </template>
            </td>
            <td>
              <span v-if="u.disabledAt" class="pill" :title="dateTime(u.disabledAt)">Désactivé</span>
              <span v-else-if="u.mustChangePassword" class="pill warn">Mot de passe à changer</span>
              <span v-else class="pill ok">Actif</span>
            </td>
            <td class="hide-sm" :title="u.lastLoginAt ? dateTime(u.lastLoginAt) : ''">{{ relative(u.lastLoginAt) }}</td>
            <td class="n mono hide-sm">{{ u.activeSessions }}</td>
            <td class="n actions">
              <template v-if="pending?.id === u.id">
                <span class="confirm">{{ CONFIRM[pending.kind] }}</span>
                <button class="btn small" :class="pending.kind === 'disable' ? 'danger' : 'primary'" type="button" :disabled="busy" @click="run(u, pending.kind)">Confirmer</button>
                <button class="btn small" type="button" @click="pending = null">Annuler</button>
              </template>
              <template v-else>
                <RouterLink class="btn small" :to="{ name: 'audit', query: { user: u.id } }">Activité</RouterLink>
                <template v-if="u.id !== auth.user?.id">
                  <button v-if="!u.disabledAt" class="btn small" type="button" @click="pending = { id: u.id, kind: 'reset' }">Nouveau mot de passe</button>
                  <button v-if="!u.disabledAt" class="btn small danger" type="button" @click="pending = { id: u.id, kind: 'disable' }">Désactiver</button>
                  <button v-else class="btn small" type="button" @click="pending = { id: u.id, kind: 'enable' }">Activer</button>
                </template>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
  <p class="muted foot">Quand quelqu’un quitte l’entreprise, désactivez son compte plutôt que de le supprimer : il ne peut plus se connecter, et son historique reste dans le journal.</p>
</template>

<style scoped>
.new {
  padding: 20px;
  display: grid;
  gap: 14px;
}
.new-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px;
}
.row {
  display: flex;
  gap: 8px;
}
tr.off td {
  color: var(--muted);
}
.actions {
  white-space: nowrap;
}
@media (max-width: 640px) {
  .actions {
    white-space: normal;
  }
  .actions .btn {
    margin: 2px 0 2px 4px;
  }
}
.actions .btn {
  margin-left: 4px;
}
.confirm {
  font-size: 0.82rem;
  white-space: normal;
  display: inline-block;
  max-width: 240px;
  text-align: right;
  vertical-align: middle;
  margin-right: 4px;
}
.intro {
  font-size: 0.88rem;
  max-width: 75ch;
}
.foot {
  font-size: 0.84rem;
  max-width: 70ch;
}
.rights {
  margin: 0 4px 4px 0;
}
</style>
