<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { api, ApiError } from '@/api'
import { emptyFields, fullName, suggestIdentifiant } from '@/lib/employees'
import AccessEditor from '@/components/AccessEditor.vue'
import { useAuthStore, type Access } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import EmployeeForm from '@/components/EmployeeForm.vue'

const router = useRouter()
const ui = useUiStore()
const auth = useAuthStore()
// Seule la direction crée des comptes de connexion ; la RH saisit uniquement la fiche
const canAccounts = auth.can('users.manage')

const fields = reactive(emptyFields())
const withAccount = ref(canAccounts)
const account = reactive({ identifiant: '', access: { sections: ['atelier'], admin: false } as Access })
const error = ref<{ field?: string; msg: string } | null>(null)
const saving = ref(false)

// L'identifiant suit le prénom tant que la personne ne l'a pas modifié elle-même
const identifiantTouched = ref(false)
watch(
  () => [fields.prenom, fields.nom],
  () => {
    if (!identifiantTouched.value) account.identifiant = suggestIdentifiant(fields.prenom, fields.nom)
  },
)

async function save() {
  error.value = null
  saving.value = true
  try {
    const body = { ...fields, compte: withAccount.value ? { identifiant: account.identifiant, ...account.access } : null }
    const res = await api<{ id: string; tempPassword: string | null }>('/employees', { method: 'POST', body })
    const to = router.resolve({ name: 'employee', params: { id: res.id } })
    if (res.tempPassword) {
      ui.tempPassword = { for: to.fullPath, nom: fullName(fields), identifiant: account.identifiant.trim().toLowerCase(), password: res.tempPassword }
    }
    await router.push(to)
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
      <span class="eyebrow">Équipe</span>
      <h1>Nouveau salarié</h1>
    </div>
  </div>

  <form class="layout" novalidate @submit.prevent="save">
    <p v-if="error" class="alert bad" role="alert">{{ error.msg }}</p>

    <EmployeeForm v-model="fields" :error="error">
      <fieldset v-if="canAccounts" class="card group">
        <legend>Compte de connexion</legend>
        <label class="check">
          <input id="f-with-account" v-model="withAccount" type="checkbox" />
          <span>
            Créer un compte pour accéder à l’application
            <small class="muted">Un mot de passe temporaire sera affiché après l’enregistrement.</small>
          </span>
        </label>
        <div v-if="withAccount" class="row">
          <div class="field">
            <label for="f-identifiant">Identifiant de connexion</label>
            <input
              id="f-identifiant"
              v-model="account.identifiant"
              class="input mono"
              autocomplete="off"
              autocapitalize="none"
              spellcheck="false"
              :aria-invalid="error?.field === 'identifiant' || undefined"
              @input="identifiantTouched = true"
            />
            <span v-if="error?.field === 'identifiant'" class="field-error">{{ error.msg }}</span>
          </div>
          <AccessEditor v-model="account.access" id-prefix="f" />
        </div>
      </fieldset>
    </EmployeeForm>

    <div class="actions">
      <button class="btn primary" type="submit" :disabled="saving || !fields.prenom || !fields.nom">
        {{ saving ? 'Enregistrement…' : 'Enregistrer le salarié' }}
      </button>
      <RouterLink class="btn" :to="{ name: 'employees' }">Annuler</RouterLink>
    </div>
  </form>
</template>

<style scoped>
.layout {
  display: grid;
  gap: 16px;
  max-width: 860px;
}
.group {
  margin: 0;
  padding: 18px 20px 20px;
  display: grid;
  gap: 14px;
  min-width: 0;
}
.row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px;
  align-items: start;
}
.check {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
.check input {
  margin-top: 4px;
  width: 16px;
  height: 16px;
  accent-color: var(--accent);
}
.check small {
  display: block;
  font-size: 0.8rem;
}
.actions {
  display: flex;
  gap: 8px;
  position: sticky;
  bottom: 0;
  padding: 12px 0 calc(12px + env(safe-area-inset-bottom));
  background: linear-gradient(transparent, var(--bg) 30%);
}
</style>
