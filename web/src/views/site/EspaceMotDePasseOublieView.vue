<script setup lang="ts">
import { ref } from 'vue'
import { api, ApiError } from '@/api'
import AppIcon from '@/components/AppIcon.vue'

// Mot de passe oublié, ou espace à activer sur une fiche créée par l'atelier : un lien part à l'adresse e-mail saisie.
// La réponse est la même que l'adresse existe ou non : on ne révèle jamais qui a un espace.
const email = ref('')
const sending = ref(false)
const sent = ref(false)
const error = ref('')

async function submit() {
  error.value = ''
  sending.value = true
  try {
    await api('/espace/mot-de-passe-oublie', { method: 'POST', body: { email: email.value } })
    sent.value = true
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Envoi impossible. Réessayez, ou appelez-nous.'
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <div class="s-wrap page">
    <section class="card box" aria-labelledby="titre-oubli">
      <span class="eyebrow">Espace client</span>
      <h1 id="titre-oubli">Mot de passe oublié ?</h1>

      <template v-if="!sent">
        <p class="muted">
          Saisissez l’adresse e-mail de votre espace client, ou celle de votre devis ou de votre facture si vous n’avez pas encore d’espace : nous vous envoyons un lien pour choisir votre mot de
          passe.
        </p>
        <form novalidate @submit.prevent="submit">
          <p v-if="error" class="alert bad" role="alert">{{ error }}</p>
          <div class="field">
            <label for="oubli-email">Adresse e-mail</label>
            <input id="oubli-email" v-model="email" class="input" type="email" autocomplete="email" inputmode="email" autocapitalize="none" spellcheck="false" />
          </div>
          <button class="s-btn primary" type="submit" :disabled="sending || !email.trim()"><AppIcon name="mail" :size="16" />{{ sending ? 'Envoi…' : 'Recevoir le lien' }}</button>
        </form>
      </template>
      <div v-else role="status" class="done">
        <p class="alert ok">
          <AppIcon name="check" :size="16" />
          <span>Si cette adresse correspond à un espace client ou à une fiche, un message vient de vous être envoyé.</span>
        </p>
        <p class="muted">Le lien est à usage unique et valable peu de temps : 1 heure pour un mot de passe oublié, 7 jours pour activer un espace. Pensez à regarder vos courriers indésirables.</p>
      </div>

      <p class="switch"><RouterLink :to="{ name: 'espace-connexion' }">Retour à la connexion</RouterLink></p>
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
form {
  display: grid;
  gap: 14px;
}
.field {
  display: grid;
  gap: 6px;
}
.done {
  display: grid;
  gap: 10px;
}
.done .alert {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  margin: 0;
}
.switch {
  margin: 0;
  text-align: center;
}
@media (max-width: 520px) {
  .box {
    padding: 20px;
  }
}
</style>
