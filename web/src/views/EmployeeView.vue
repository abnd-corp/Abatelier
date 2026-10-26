<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { api, ApiError } from '@/api'
import { accountStatus, CONTRAT_LABELS, employmentStatus, formatDay, fullName, suggestIdentifiant, type Employee, type EmployeeFields } from '@/lib/employees'
import { describe, type AuditEntry } from '@/lib/audit-labels'
import { dateTime, relative } from '@/lib/format'
import { accessLabels, useAuthStore, type Access } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import AccessEditor from '@/components/AccessEditor.vue'
import AppIcon from '@/components/AppIcon.vue'
import UserAvatar from '@/components/UserAvatar.vue'
import EmployeeForm from '@/components/EmployeeForm.vue'
import TempPasswordPanel from '@/components/TempPasswordPanel.vue'

const route = useRoute()
const auth = useAuthStore()
const ui = useUiStore()

const employee = ref<Employee | null>(null)
const activity = ref<AuditEntry[]>([])
const loadError = ref('')
const notice = ref('')
const actionError = ref('')

const id = computed(() => route.params.id as string)
const name = computed(() => (employee.value ? fullName(employee.value) : ''))
const isMe = computed(() => !!employee.value?.account && employee.value.account.id === auth.user?.id)
// La RH voit le compte lié mais ne le gère pas : c'est réservé à la direction
const canAccounts = computed(() => auth.can('users.manage'))

async function load() {
  try {
    const res = await api<{ employee: Employee; activity: AuditEntry[] }>(`/employees/${id.value}`)
    employee.value = res.employee
    activity.value = res.activity
    ui.crumb = { for: route.fullPath, label: fullName(res.employee) }
    document.title = `${fullName(res.employee)} · Salariés · Atelier · Alu Pliage Service`
  } catch (e) {
    loadError.value = e instanceof ApiError ? e.message : 'Chargement impossible.'
  }
}
onMounted(load)
watch(id, () => {
  editing.value = false
  load()
})

// Mot de passe temporaire tout juste créé (après l'ajout du salarié) : affiché une seule fois
const temp = computed(() => (ui.tempPassword?.for === route.fullPath ? ui.tempPassword : null))

// --- Modification de la fiche ---
const editing = ref(false)
const form = reactive<EmployeeFields>({
  prenom: '',
  nom: '',
  poste: '',
  contrat: null,
  dateEntree: '',
  dateSortie: '',
  telephone: '',
  email: '',
  notes: '',
})
const formError = ref<{ field?: string; msg: string } | null>(null)
const saving = ref(false)

function startEdit() {
  const e = employee.value!
  Object.assign(form, {
    prenom: e.prenom,
    nom: e.nom,
    poste: e.poste ?? '',
    contrat: e.contrat,
    dateEntree: e.dateEntree ?? '',
    dateSortie: e.dateSortie ?? '',
    telephone: e.telephone ?? '',
    email: e.email ?? '',
    notes: e.notes ?? '',
  })
  formError.value = null
  notice.value = ''
  editing.value = true
}

async function saveEdit() {
  formError.value = null
  saving.value = true
  try {
    const res = await api<{ ok: boolean; accountDisabled?: boolean }>(`/employees/${id.value}`, { method: 'PATCH', body: { ...form } })
    editing.value = false
    notice.value = res.accountDisabled ? 'Fiche enregistrée. La date de sortie est atteinte : son compte a été désactivé.' : 'Fiche enregistrée.'
    await load()
  } catch (e) {
    formError.value = e instanceof ApiError ? { msg: e.message, field: e.field } : { msg: 'L’enregistrement a échoué.' }
  } finally {
    saving.value = false
  }
}

// --- Compte de connexion ---
const newAccount = reactive({ identifiant: '', access: { sections: ['atelier'], admin: false } as Access })
const accountError = ref<{ field?: string; msg: string } | null>(null)
const showAccountForm = ref(false)

function openAccountForm() {
  newAccount.identifiant = suggestIdentifiant(employee.value!.prenom, employee.value!.nom)
  newAccount.access = { sections: ['atelier'], admin: false }
  accountError.value = null
  showAccountForm.value = true
}

async function createAccount() {
  accountError.value = null
  try {
    const res = await api<{ tempPassword: string }>(`/employees/${id.value}/account`, { method: 'POST', body: { identifiant: newAccount.identifiant, ...newAccount.access } })
    ui.tempPassword = { for: route.fullPath, nom: name.value, identifiant: newAccount.identifiant.trim().toLowerCase(), password: res.tempPassword }
    showAccountForm.value = false
    await load()
  } catch (e) {
    accountError.value = e instanceof ApiError ? { msg: e.message, field: e.field } : { msg: 'Création impossible.' }
  }
}

type Kind = 'disable' | 'enable' | 'reset'
const pending = ref<Kind | null>(null)
const busy = ref(false)
const CONFIRM: Record<Kind, string> = {
  disable: 'Désactiver ce compte ? La personne sera déconnectée partout.',
  enable: 'Activer ce compte ?',
  reset: 'Générer un nouveau mot de passe temporaire ? La personne sera déconnectée partout.',
}

async function run(kind: Kind) {
  const acc = employee.value!.account!
  actionError.value = notice.value = ''
  busy.value = true
  try {
    if (kind === 'reset') {
      const res = await api<{ tempPassword: string }>(`/users/${acc.id}/reset-password`, { method: 'POST' })
      ui.tempPassword = { for: route.fullPath, nom: name.value, identifiant: acc.identifiant, password: res.tempPassword }
    } else {
      await api(`/users/${acc.id}/${kind}`, { method: 'POST' })
      notice.value = kind === 'disable' ? 'Compte désactivé : la personne a été déconnectée partout.' : 'Compte réactivé.'
    }
    await load()
  } catch (e) {
    actionError.value = e instanceof ApiError ? e.message : 'L’action a échoué.'
  } finally {
    busy.value = false
    pending.value = null
  }
}

// Droits du compte : sections à cocher, enregistrées d'un coup
const editingAccess = ref<Access | null>(null)
function editAccess() {
  actionError.value = notice.value = ''
  editingAccess.value = { sections: [...employee.value!.account!.sections], admin: employee.value!.account!.admin }
}
async function saveAccess() {
  actionError.value = notice.value = ''
  try {
    await api(`/users/${employee.value!.account!.id}`, { method: 'PATCH', body: { ...editingAccess.value } })
    notice.value = `Les droits de ${name.value} sont enregistrés.`
    editingAccess.value = null
  } catch (e) {
    actionError.value = e instanceof ApiError ? e.message : 'Modification impossible.'
  }
  await load()
}
</script>

<template>
  <p v-if="loadError" class="alert bad" role="alert">{{ loadError }}</p>

  <template v-if="employee">
    <div class="head">
      <RouterLink :to="{ name: 'employees' }" class="back"><AppIcon name="arrow-left" :size="16" />Salariés</RouterLink>
      <div class="identity">
        <UserAvatar :name="name" :size="56" />
        <div>
          <h1>{{ name }}</h1>
          <p class="muted">
            {{ employee.poste || 'Poste non renseigné' }}<template v-if="employee.contrat"> · {{ CONTRAT_LABELS[employee.contrat] }}</template>
          </p>
        </div>
        <span class="pill" :class="employmentStatus(employee).tone">{{ employmentStatus(employee).label }}</span>
        <button v-if="!editing" class="btn edit" type="button" @click="startEdit"><AppIcon name="pencil" :size="16" />Modifier la fiche</button>
      </div>
    </div>

    <TempPasswordPanel v-if="temp" :nom="temp.nom" :identifiant="temp.identifiant" :password="temp.password" @done="ui.tempPassword = null" />
    <p v-if="notice" class="alert ok" role="status">{{ notice }}</p>
    <p v-if="actionError" class="alert bad" role="alert">{{ actionError }}</p>

    <form v-if="editing" class="edit-form" novalidate @submit.prevent="saveEdit">
      <p v-if="formError" class="alert bad" role="alert">{{ formError.msg }}</p>
      <EmployeeForm v-model="form" :error="formError" />
      <div class="actions">
        <button class="btn primary" type="submit" :disabled="saving || !form.prenom || !form.nom">{{ saving ? 'Enregistrement…' : 'Enregistrer' }}</button>
        <button class="btn" type="button" @click="editing = false">Annuler</button>
      </div>
    </form>

    <div v-else class="grid">
      <div class="col">
        <section class="card block">
          <h2>Poste et contrat</h2>
          <dl class="facts">
            <dt>Poste</dt>
            <dd>{{ employee.poste || '—' }}</dd>
            <dt>Contrat</dt>
            <dd>{{ employee.contrat ? CONTRAT_LABELS[employee.contrat] : '—' }}</dd>
            <dt>Entrée</dt>
            <dd>{{ formatDay(employee.dateEntree) }}</dd>
            <dt>Sortie</dt>
            <dd>{{ formatDay(employee.dateSortie) }}</dd>
          </dl>
        </section>

        <section class="card block">
          <h2>Coordonnées</h2>
          <ul class="contacts">
            <li>
              <AppIcon name="phone" :size="17" class="muted" />
              <a v-if="employee.telephone" :href="`tel:${employee.telephone.replace(/[^+\d]/g, '')}`" class="mono">{{ employee.telephone }}</a>
              <span v-else class="muted">Pas de téléphone</span>
            </li>
            <li>
              <AppIcon name="mail" :size="17" class="muted" />
              <a v-if="employee.email" :href="`mailto:${employee.email}`">{{ employee.email }}</a>
              <span v-else class="muted">Pas d’e-mail</span>
            </li>
          </ul>
        </section>

        <section class="card block">
          <h2>Notes internes</h2>
          <p v-if="employee.notes" class="notes">{{ employee.notes }}</p>
          <p v-else class="muted">Aucune note.</p>
          <p class="hint muted">Visibles uniquement par la direction et la RH.</p>
        </section>
      </div>

      <div class="col">
        <section class="card block" aria-labelledby="account-title">
          <h2 id="account-title">Compte de connexion</h2>

          <template v-if="employee.account">
            <dl class="facts">
              <dt>Identifiant</dt>
              <dd class="mono">{{ employee.account.identifiant }}</dd>
              <dt>Statut</dt>
              <dd>
                <span class="pill" :class="accountStatus(employee.account).tone">{{ accountStatus(employee.account).label }}</span>
              </dd>
              <dt>Droits</dt>
              <dd v-if="editingAccess">
                <AccessEditor v-model="editingAccess" id-prefix="account" />
                <span class="account-actions">
                  <button class="btn small primary" type="button" @click="saveAccess">Enregistrer les droits</button>
                  <button class="btn small" type="button" @click="editingAccess = null">Annuler</button>
                </span>
              </dd>
              <dd v-else>
                <span v-for="l in accessLabels(employee.account)" :key="l" class="pill neutral rights">{{ l }}</span>
                <span v-if="!accessLabels(employee.account).length" class="muted">Aucun accès</span>
                <button v-if="canAccounts && !isMe && !employee.account.disabledAt" class="btn small" type="button" @click="editAccess">Modifier les droits</button>
              </dd>
              <dt>Dernière connexion</dt>
              <dd :title="employee.account.lastLoginAt ? dateTime(employee.account.lastLoginAt) : ''">{{ relative(employee.account.lastLoginAt) }}</dd>
              <dt>Appareils connectés</dt>
              <dd class="mono">{{ employee.account.activeSessions ?? 0 }}</dd>
            </dl>

            <p v-if="!canAccounts" class="muted hint">La gestion des comptes est réservée à la direction.</p>
            <p v-else-if="isMe" class="muted hint">C’est votre compte : gérez-le depuis « Mon compte ».</p>
            <div v-else-if="pending" class="confirm">
              <span>{{ CONFIRM[pending] }}</span>
              <button class="btn small" :class="pending === 'disable' ? 'danger' : 'primary'" type="button" :disabled="busy" @click="run(pending)">Confirmer</button>
              <button class="btn small" type="button" @click="pending = null">Annuler</button>
            </div>
            <div v-else class="account-actions">
              <template v-if="!employee.account.disabledAt">
                <button class="btn small" type="button" @click="pending = 'reset'">Nouveau mot de passe</button>
                <button class="btn small danger" type="button" @click="pending = 'disable'">Désactiver le compte</button>
              </template>
              <button v-else class="btn small" type="button" @click="pending = 'enable'">Activer le compte</button>
            </div>
          </template>

          <template v-else>
            <p class="muted">Cette personne n’a pas de compte : elle ne peut pas se connecter.</p>
            <p v-if="!canAccounts" class="muted hint">Seule la direction peut lui créer un compte.</p>
            <form v-else-if="showAccountForm" class="account-form" novalidate @submit.prevent="createAccount">
              <p v-if="accountError && accountError.field !== 'identifiant'" class="alert bad" role="alert">{{ accountError.msg }}</p>
              <div class="field">
                <label for="new-identifiant">Identifiant de connexion</label>
                <input
                  id="new-identifiant"
                  v-model="newAccount.identifiant"
                  class="input mono"
                  autocomplete="off"
                  autocapitalize="none"
                  spellcheck="false"
                  :aria-invalid="accountError?.field === 'identifiant' || undefined"
                />
                <span v-if="accountError?.field === 'identifiant'" class="field-error" role="alert">{{ accountError.msg }}</span>
              </div>
              <AccessEditor v-model="newAccount.access" id-prefix="new" />
              <div class="account-actions">
                <button class="btn primary small" type="submit" :disabled="!newAccount.identifiant">Créer le compte</button>
                <button class="btn small" type="button" @click="showAccountForm = false">Annuler</button>
              </div>
            </form>
            <button v-else class="btn" type="button" @click="openAccountForm"><AppIcon name="key" :size="16" />Créer un compte de connexion</button>
          </template>
        </section>

        <section class="card block">
          <div class="block-head">
            <h2>Activité récente</h2>
            <RouterLink v-if="employee.account && auth.can('audit.read')" :to="{ name: 'audit', query: { user: employee.account.id } }" class="more">Tout voir</RouterLink>
          </div>
          <ol v-if="activity.length" class="timeline">
            <li v-for="a in activity" :key="a.id">
              <span class="dot" :data-tone="describe(a).tone" aria-hidden="true" />
              <div>
                <span :class="{ bad: describe(a).tone === 'bad' }">{{ describe(a).text }}</span>
                <span class="sub" :title="dateTime(a.at)"
                  >{{ relative(a.at) }}<template v-if="a.userId && a.userId !== employee.account?.id"> · par {{ a.nom }}</template></span
                >
              </div>
            </li>
          </ol>
          <p v-else class="muted">Aucune activité pour l’instant.</p>
        </section>
      </div>
    </div>
  </template>
</template>

<style scoped>
.head {
  display: grid;
  gap: 12px;
}
.back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--muted);
  text-decoration: none;
  font-size: 0.88rem;
  width: fit-content;
}
.back:hover {
  color: var(--accent);
}
.identity {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}
.identity h1 {
  font-size: clamp(1.6rem, 3vw, 2.1rem);
}
.edit {
  margin-left: auto;
}
.grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}
.col {
  display: grid;
  gap: 16px;
  min-width: 0;
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
.facts {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 8px 18px;
  margin: 0;
  align-items: center;
}
.facts dt {
  color: var(--muted);
  font-size: 0.86rem;
}
.facts dd {
  margin: 0;
}
.contacts {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
}
.contacts li {
  display: flex;
  align-items: center;
  gap: 10px;
}
.contacts a {
  color: var(--ink);
}
.notes {
  white-space: pre-wrap;
}
.hint {
  font-size: 0.8rem;
}
.account-actions,
.confirm {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}
.confirm span {
  font-size: 0.86rem;
  width: 100%;
}
.account-form {
  display: grid;
  gap: 12px;
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
.edit-form {
  display: grid;
  gap: 16px;
  max-width: 860px;
}
.actions {
  display: flex;
  gap: 8px;
}
@media (max-width: 960px) {
  .grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .edit {
    margin-left: 0;
  }
}
.rights {
  margin: 0 4px 4px 0;
}
</style>
