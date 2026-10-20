<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { ApiError } from '@/api'
import PasswordInput from '@/components/PasswordInput.vue'
import { checkPassword } from '@/lib/password'
import { useEspaceStore } from '@/stores/espace'

// Création du compte ou connexion à l'espace client. Sert aux pages « Connexion » et « Créer mon compte »,
// et au configurateur, qui enchaîne ensuite avec la demande de devis (fonction « after »). Une fonction plutôt qu'un événement :
// dès que le compte est connecté, la page remplace ce formulaire, et un événement émis après coup serait perdu.
const props = defineProps<{ mode: 'inscription' | 'connexion'; submitText: string; after?: () => unknown; busy?: boolean; disabled?: boolean; idPrefix?: string }>()

const espace = useEspaceStore()
const p = computed(() => props.idPrefix ?? 'ea')
const form = reactive({ prenom: '', nom: '', email: '', telephone: '', password: '', remember: false, consentement: false, site: '' })
const errors = reactive<Record<string, string>>({})
const failure = ref('')
const sending = ref(false)

const strength = computed(() => checkPassword(form.password, { identifiant: form.email, nom: form.nom }))

async function submit() {
  for (const k of Object.keys(errors)) delete errors[k]
  failure.value = ''
  sending.value = true
  try {
    if (props.mode === 'inscription') await espace.inscrire({ prenom: form.prenom, nom: form.nom, email: form.email, telephone: form.telephone, password: form.password, consentement: form.consentement, site: form.site })
    else await espace.connecter(form.email, form.password, form.remember)
    form.password = ''
    await props.after?.()
  } catch (e) {
    if (e instanceof ApiError && e.field) errors[e.field] = e.message
    else failure.value = e instanceof ApiError ? e.message : 'Envoi impossible. Réessayez, ou appelez-nous.'
    if (props.mode === 'connexion') form.password = ''
    const first = Object.keys(errors)[0]
    if (first) document.getElementById(`${p.value}-${first}`)?.focus()
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <form class="auth" novalidate @submit.prevent="submit">
    <p v-if="failure" class="alert bad" role="alert">{{ failure }}</p>
    <template v-if="mode === 'inscription'">
      <div class="two">
        <div class="field">
          <label :for="`${p}-prenom`">Prénom</label>
          <input :id="`${p}-prenom`" v-model="form.prenom" class="input" autocomplete="given-name" />
        </div>
        <div class="field">
          <label :for="`${p}-nom`">Nom *</label>
          <input :id="`${p}-nom`" v-model="form.nom" class="input" :class="{ invalid: errors.nom }" autocomplete="family-name" required :aria-invalid="!!errors.nom" :aria-describedby="errors.nom ? `${p}-e-nom` : undefined" />
          <span v-if="errors.nom" :id="`${p}-e-nom`" class="field-error">{{ errors.nom }}</span>
        </div>
      </div>
    </template>
    <div class="field">
      <label :for="`${p}-email`">Adresse e-mail *</label>
      <input :id="`${p}-email`" v-model="form.email" type="email" class="input" :class="{ invalid: errors.email }" autocomplete="email" required :aria-invalid="!!errors.email" :aria-describedby="errors.email ? `${p}-e-email` : undefined" />
      <span v-if="errors.email" :id="`${p}-e-email`" class="field-error">{{ errors.email }}</span>
    </div>
    <div v-if="mode === 'inscription'" class="field">
      <label :for="`${p}-telephone`">Téléphone</label>
      <input :id="`${p}-telephone`" v-model="form.telephone" type="tel" class="input" :class="{ invalid: errors.telephone }" autocomplete="tel" :aria-invalid="!!errors.telephone" :aria-describedby="errors.telephone ? `${p}-e-telephone` : undefined" />
      <span v-if="errors.telephone" :id="`${p}-e-telephone`" class="field-error">{{ errors.telephone }}</span>
    </div>
    <div class="field">
      <label :for="`${p}-password`">Mot de passe *</label>
      <PasswordInput :id="`${p}-password`" v-model="form.password" :autocomplete="mode === 'inscription' ? 'new-password' : 'current-password'" :invalid="!!errors.password" :describedby="errors.password ? `${p}-e-password` : mode === 'inscription' ? `${p}-h-password` : undefined" />
      <span v-if="errors.password" :id="`${p}-e-password`" class="field-error">{{ errors.password }}</span>
      <span v-else-if="mode === 'inscription'" :id="`${p}-h-password`" class="muted hint">12 caractères minimum, pas un mot de passe courant.<template v-if="form.password"> Solidité : {{ strength.label }}.</template></span>
    </div>
    <label v-if="mode === 'connexion'" class="check">
      <input v-model="form.remember" type="checkbox" />
      <span>Rester connecté sur cet appareil</span>
    </label>
    <template v-else>
      <!-- Piège à robots : invisible pour une personne, rempli par les robots -->
      <div class="trap" aria-hidden="true">
        <label :for="`${p}-site`">Ne pas remplir</label>
        <input :id="`${p}-site`" v-model="form.site" tabindex="-1" autocomplete="off" />
      </div>
      <div class="field">
        <label class="check">
          <input :id="`${p}-consentement`" v-model="form.consentement" type="checkbox" :aria-invalid="!!errors.consentement" :aria-describedby="errors.consentement ? `${p}-e-consentement` : undefined" />
          <span>J’accepte que mes données servent à gérer mon espace client et mes devis (<RouterLink :to="{ name: 'site-confidentialite' }" target="_blank">politique de confidentialité</RouterLink>). *</span>
        </label>
        <span v-if="errors.consentement" :id="`${p}-e-consentement`" class="field-error">{{ errors.consentement }}</span>
      </div>
    </template>
    <button class="s-btn primary" type="submit" :disabled="sending || busy || disabled">{{ sending || busy ? 'Patientez…' : submitText }}</button>
  </form>
</template>

<style scoped>
.auth {
  display: grid;
  gap: 14px;
}
.two {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}
.hint {
  font-size: 0.84rem;
}
.check {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  font-weight: 400 !important;
}
.check input {
  margin-top: 4px;
  width: 18px;
  height: 18px;
  flex: none;
}
.trap {
  position: absolute;
  left: -9999px;
  width: 1px;
  height: 1px;
  overflow: hidden;
}
@media (max-width: 520px) {
  .two {
    grid-template-columns: minmax(0, 1fr);
  }
  .auth .s-btn {
    width: 100%;
  }
}
</style>
