<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, ApiError } from '@/api'
import { retourEspace } from '@/lib/espace'
import { useEspaceStore } from '@/stores/espace'

// Dernière étape de la première connexion avec Google : Google a donné le nom et l'adresse e-mail (vérifiée),
// le client dit s'il est particulier ou professionnel et accepte l'usage de ses données. Rien n'est créé avant.
const route = useRoute()
const router = useRouter()
const espace = useEspaceStore()

const identite = ref<{ email: string; prenom: string | null; nom: string } | null>(null)
const expire = ref(false)
const form = reactive({ type: 'particulier' as 'particulier' | 'professionnel', raisonSociale: '', telephone: '', consentement: false })
const errors = reactive<Record<string, string>>({})
const failure = ref('')
const sending = ref(false)

onMounted(async () => {
  try {
    identite.value = await api('/espace/google/en-attente')
  } catch {
    expire.value = true
  }
})

async function submit() {
  for (const k of Object.keys(errors)) delete errors[k]
  failure.value = ''
  sending.value = true
  try {
    await espace.inscrireGoogle({ ...form })
    await router.replace(retourEspace(route.query.retour))
  } catch (e) {
    if (e instanceof ApiError && e.field) errors[e.field] = e.message
    else failure.value = e instanceof ApiError ? e.message : 'Envoi impossible. Réessayez, ou appelez-nous.'
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <div class="s-wrap page">
    <section class="card box" aria-labelledby="titre-google">
      <span class="eyebrow">Espace client</span>
      <h1 id="titre-google">Presque terminé</h1>
      <template v-if="expire">
        <p class="alert bad" role="alert">Cette inscription a expiré. Recommencez avec Google.</p>
        <RouterLink :to="{ name: 'espace-connexion' }" class="s-btn primary">Retour à la connexion</RouterLink>
      </template>
      <template v-else-if="identite">
        <p class="muted">
          Google nous a confirmé <b>{{ [identite.prenom, identite.nom].filter(Boolean).join(' ') }}</b> et l’adresse <b>{{ identite.email }}</b
          >. Dites-nous seulement qui vous êtes.
        </p>
        <form class="auth" novalidate @submit.prevent="submit">
          <p v-if="failure" class="alert bad" role="alert">{{ failure }}</p>
          <fieldset class="type">
            <legend>Vous êtes</legend>
            <label class="check"><input id="g-type-particulier" v-model="form.type" type="radio" name="type" value="particulier" /><span>Un particulier</span></label>
            <label class="check"><input id="g-type-professionnel" v-model="form.type" type="radio" name="type" value="professionnel" /><span>Un professionnel</span></label>
          </fieldset>
          <div v-if="form.type === 'professionnel'" class="field">
            <label for="g-raisonSociale">Raison sociale *</label>
            <input
              id="g-raisonSociale"
              v-model="form.raisonSociale"
              class="input"
              :class="{ invalid: errors.raisonSociale }"
              autocomplete="organization"
              required
              :aria-invalid="!!errors.raisonSociale"
            />
            <span v-if="errors.raisonSociale" class="field-error">{{ errors.raisonSociale }}</span>
            <span v-else class="muted hint">La remise professionnelle s’applique une fois votre statut validé par l’atelier.</span>
          </div>
          <div class="field">
            <label for="g-telephone">Téléphone</label>
            <input id="g-telephone" v-model="form.telephone" type="tel" class="input" :class="{ invalid: errors.telephone }" autocomplete="tel" :aria-invalid="!!errors.telephone" />
            <span v-if="errors.telephone" class="field-error">{{ errors.telephone }}</span>
          </div>
          <div class="field">
            <label class="check">
              <input id="g-consentement" v-model="form.consentement" type="checkbox" :aria-invalid="!!errors.consentement" />
              <span
                >J’accepte que mes données servent à gérer mon espace client et mes devis (<RouterLink :to="{ name: 'site-confidentialite' }" target="_blank">politique de confidentialité</RouterLink
                >). *</span
              >
            </label>
            <span v-if="errors.consentement" class="field-error">{{ errors.consentement }}</span>
          </div>
          <button class="s-btn primary" type="submit" :disabled="sending">{{ sending ? 'Patientez…' : 'Créer mon espace' }}</button>
        </form>
      </template>
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
.auth {
  display: grid;
  gap: 14px;
}
.type {
  border: 0;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 6px 20px;
}
.type legend {
  font-weight: 600;
  margin-bottom: 6px;
  padding: 0;
}
@media (max-width: 520px) {
  .box {
    padding: 20px;
  }
}
</style>
