<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, ApiError } from '@/api'
import AppIcon from '@/components/AppIcon.vue'
import PasswordInput from '@/components/PasswordInput.vue'
import { checkPassword } from '@/lib/password'
import { useEspaceStore } from '@/stores/espace'

// Page ouverte depuis le lien reçu par e-mail : choisir un nouveau mot de passe, ou activer son espace sur une fiche existante.
// Le lien est vérifié par le serveur (à usage unique, valable peu de temps).
const route = useRoute()
const router = useRouter()
const espace = useEspaceStore()
const jeton = computed(() => (typeof route.query.jeton === 'string' ? route.query.jeton : ''))

const etat = ref<'verification' | 'invalide' | 'saisie' | 'fait'>('verification')
const objet = ref<'activation' | 'reinitialisation'>('reinitialisation')
const password = ref('')
const sending = ref(false)
const error = ref('')
const strength = computed(() => checkPassword(password.value, { identifiant: '', nom: '' }))
const activation = computed(() => objet.value === 'activation')

onMounted(async () => {
  if (!jeton.value) return void (etat.value = 'invalide')
  try {
    const r = await api<{ valide: boolean; objet?: 'activation' | 'reinitialisation' }>('/espace/jeton/verification', { method: 'POST', body: { jeton: jeton.value } })
    if (r.valide && r.objet) {
      objet.value = r.objet
      etat.value = 'saisie'
    } else etat.value = 'invalide'
  } catch {
    etat.value = 'invalide'
  }
})

async function submit() {
  error.value = ''
  sending.value = true
  try {
    if (activation.value) {
      await espace.activer(jeton.value, password.value)
      await router.replace({ name: 'espace' })
    } else {
      await api('/espace/nouveau-mot-de-passe', { method: 'POST', body: { jeton: jeton.value, password: password.value } })
      etat.value = 'fait'
    }
    password.value = ''
  } catch (e) {
    if (e instanceof ApiError && e.field === 'jeton') etat.value = 'invalide'
    else error.value = e instanceof ApiError ? e.message : 'Enregistrement impossible. Réessayez, ou appelez-nous.'
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <div class="s-wrap page">
    <section class="card box" aria-labelledby="titre-mdp">
      <span class="eyebrow">Espace client</span>
      <h1 id="titre-mdp">
        {{ etat === 'fait' ? 'Mot de passe modifié' : etat === 'invalide' ? 'Ce lien n’est plus valable' : activation ? 'Activez votre espace client' : 'Choisissez un nouveau mot de passe' }}
      </h1>

      <p v-if="etat === 'verification'" class="muted" aria-busy="true">Vérification du lien…</p>

      <template v-else-if="etat === 'invalide'">
        <p class="muted">Ce lien a expiré ou a déjà servi. Chaque lien ne s’utilise qu’une fois, pour votre sécurité.</p>
        <p><RouterLink :to="{ name: 'espace-mot-de-passe-oublie' }" class="s-btn primary">Demander un nouveau lien</RouterLink></p>
      </template>

      <form v-else-if="etat === 'saisie'" novalidate @submit.prevent="submit">
        <p class="muted">
          {{ activation ? 'Une fiche existe déjà à votre nom : choisissez un mot de passe pour y accéder en ligne.' : 'Choisissez un mot de passe que vous n’utilisez nulle part ailleurs.' }}
        </p>
        <p v-if="error" class="alert bad" role="alert">{{ error }}</p>
        <div class="field">
          <label for="mdp-password">{{ activation ? 'Mot de passe *' : 'Nouveau mot de passe *' }}</label>
          <PasswordInput id="mdp-password" v-model="password" autocomplete="new-password" :invalid="!!error" describedby="mdp-aide" />
          <span id="mdp-aide" class="muted hint"
            >12 caractères minimum, pas un mot de passe courant.<template v-if="password"> Solidité : {{ strength.label }}.</template></span
          >
        </div>
        <button class="s-btn primary" type="submit" :disabled="sending || !password">
          <AppIcon name="key" :size="16" />{{ sending ? 'Enregistrement…' : activation ? 'Activer mon espace' : 'Enregistrer le mot de passe' }}
        </button>
      </form>

      <div v-else role="status" class="done">
        <p class="alert ok"><AppIcon name="check" :size="16" /><span>Votre mot de passe est modifié. Vous avez été déconnecté de vos autres appareils.</span></p>
        <p><RouterLink :to="{ name: 'espace-connexion' }" class="s-btn primary">Me connecter</RouterLink></p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.page {
  padding-top: 40px;
  padding-bottom: 40px;
}
.box {
  max-width: 520px;
  margin: 0 auto;
  width: 100%;
  padding: 28px;
  display: grid;
  gap: 14px;
}
h1 {
  margin: 0;
  text-transform: none;
  font-size: clamp(1.6rem, 4vw, 2.1rem);
}
form,
.done {
  display: grid;
  gap: 14px;
}
.field {
  display: grid;
  gap: 6px;
}
.done .alert {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  margin: 0;
}
p {
  margin: 0;
}
@media (max-width: 520px) {
  .box {
    padding: 20px;
  }
}
</style>
