<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api, ApiError } from '@/api'
import AppIcon from '@/components/AppIcon.vue'
import MailPreview from '@/components/site-admin/MailPreview.vue'
import { dateTime } from '@/lib/format'
import type { MailStatus } from '@/lib/site-admin'

const status = ref<MailStatus | null>(null)
const loadError = ref('')
const to = ref('')
const busy = ref(false)
const error = ref('')
const ok = ref('')

async function load() {
  try {
    status.value = await api<MailStatus>('/mail/status')
  } catch (e) {
    loadError.value = e instanceof ApiError ? e.message : 'Chargement impossible.'
  }
}
onMounted(load)

async function test() {
  error.value = ''
  ok.value = ''
  busy.value = true
  try {
    await api('/mail/test', { method: 'POST', body: { to: to.value } })
    ok.value = 'Message d’essai envoyé. Vérifiez la boîte de réception (et les courriers indésirables).'
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Envoi impossible.'
  } finally {
    busy.value = false
    await load()
  }
}
const KINDS = { contact: 'Alerte de contact', document: 'Devis ou facture', test: 'Essai', compte: 'Message au client' }
</script>

<template>
  <div class="pane">
    <p v-if="loadError" class="alert bad" role="alert">{{ loadError }}</p>

    <template v-if="status">
      <section class="card box" aria-labelledby="mail-etat">
        <h2 id="mail-etat">Envoi d’e-mails</h2>
        <p v-if="status.configure" class="alert ok" role="status">
          <AppIcon name="check" :size="16" /><span
            >Configuré : les messages partent de <b>{{ status.expediteur }}</b
            >.</span
          >
        </p>
        <p v-else class="alert" role="status">
          Pas encore configuré : l’application fonctionne, mais n’envoie aucun e-mail (pas d’alerte de contact, pas d’envoi de devis ni de facture). Il faut un service d’envoi et une adresse sur le
          nom de domaine de l’entreprise, voir le document des questions.
        </p>
        <dl v-if="status.configure" class="facts">
          <div>
            <dt>Les alertes de contact vont à</dt>
            <dd>{{ status.alertes.length ? status.alertes.join(', ') : 'personne : renseignez l’e-mail de l’entreprise dans « Modèles de documents »' }}</dd>
          </div>
        </dl>
      </section>

      <form v-if="status.configure" class="card box" novalidate @submit.prevent="test">
        <h2>Envoyer un message d’essai</h2>
        <p class="muted">Pour vérifier qu’un nouveau réglage fonctionne avant d’écrire à un client.</p>
        <div class="field">
          <label for="mail-test">Adresse qui reçoit l’essai</label>
          <input id="mail-test" v-model="to" class="input" type="email" autocomplete="email" placeholder="vous@exemple.fr" />
        </div>
        <p v-if="error" class="alert bad" role="alert">{{ error }}</p>
        <p v-if="ok" class="alert ok" role="status">{{ ok }}</p>
        <p>
          <button class="btn primary" type="submit" :disabled="busy || !to.trim()"><AppIcon name="mail" :size="16" />{{ busy ? 'Envoi…' : 'Envoyer l’essai' }}</button>
        </p>
      </form>

      <MailPreview :configure="status.configure" :adresse="status.alertes[0]" />

      <section class="card box" aria-labelledby="mail-journal">
        <h2 id="mail-journal">Derniers envois</h2>
        <p v-if="!status.journal.length" class="muted">Aucun e-mail envoyé pour l’instant.</p>
        <div v-else class="table-wrap">
          <table class="table fits-sm">
            <thead>
              <tr>
                <th>Date</th>
                <th>Message</th>
                <th class="hide-sm">Destinataire</th>
                <th>Résultat</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="m in status.journal" :key="m.id">
                <td class="nowrap">{{ dateTime(m.at) }}</td>
                <td>
                  {{ m.objet }}
                  <span class="sub">{{ KINDS[m.kind] }}</span>
                </td>
                <td class="hide-sm">{{ m.destinataires }}</td>
                <td>
                  <span v-if="m.statut === 'envoye'" class="pill ok">Envoyé</span>
                  <span v-else class="pill bad" :title="m.erreur ?? ''">Échec</span>
                  <span v-if="m.erreur" class="sub">{{ m.erreur }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.pane {
  display: grid;
  gap: 16px;
}
.box {
  padding: 18px;
  display: grid;
  gap: 12px;
}
h2 {
  text-transform: none;
  font-size: 1.1rem;
}
.facts {
  margin: 0;
}
.facts dt {
  font-size: 0.78rem;
  color: var(--muted);
}
.facts dd {
  margin: 2px 0 0;
}
.nowrap {
  white-space: nowrap;
}
</style>
