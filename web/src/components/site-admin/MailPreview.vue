<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { api, ApiError } from '@/api'
import AppIcon from '@/components/AppIcon.vue'
import type { MailApercu, MailModele } from '@/lib/site-admin'

// Aperçu des messages que l'application envoie, avec des données fictives : on voit le rendu sur ordinateur et sur téléphone,
// et on peut se l'envoyer pour le voir dans sa vraie messagerie.
const props = defineProps<{ configure: boolean; adresse?: string }>()

const modeles = ref<MailModele[]>([])
const choisi = ref('')
const apercu = ref<MailApercu | null>(null)
const largeur = ref<'ordinateur' | 'telephone'>('ordinateur')
const brut = ref(false)
const loadError = ref('')
const to = ref(props.adresse ?? '')
const busy = ref(false)
const error = ref('')
const ok = ref('')

onMounted(async () => {
  try {
    modeles.value = (await api<{ modeles: MailModele[] }>('/mail/apercu')).modeles
    if (modeles.value[0]) choisi.value = modeles.value[0].id
  } catch (e) {
    loadError.value = e instanceof ApiError ? e.message : 'Chargement impossible.'
  }
})

watch(choisi, async (id) => {
  if (!id) return
  error.value = ok.value = ''
  try {
    apercu.value = await api<MailApercu>(`/mail/apercu/${id}`)
  } catch (e) {
    loadError.value = e instanceof ApiError ? e.message : 'Chargement impossible.'
  }
})

async function envoyer() {
  error.value = ok.value = ''
  busy.value = true
  try {
    await api(`/mail/apercu/${choisi.value}/envoyer`, { method: 'POST', body: { to: to.value } })
    ok.value = 'Exemple envoyé. Vérifiez la boîte de réception (et les courriers indésirables).'
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Envoi impossible.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="card box" aria-labelledby="mail-apercu">
    <h2 id="mail-apercu">Aperçu des messages</h2>
    <p class="muted">Ce que reçoivent vos clients et votre équipe, avec des données fictives. Les couleurs et le logo viennent de « Modèles de documents ».</p>
    <p v-if="loadError" class="alert bad" role="alert">{{ loadError }}</p>

    <div class="chips" role="group" aria-label="Message à afficher">
      <button v-for="m in modeles" :key="m.id" type="button" class="chip" :aria-pressed="choisi === m.id" @click="choisi = m.id">{{ m.titre }}</button>
    </div>

    <template v-if="apercu">
      <p class="objet">
        <span class="muted">Objet :</span> <b>{{ apercu.sujet }}</b>
      </p>
      <div class="chips" role="group" aria-label="Affichage">
        <button type="button" class="chip" :aria-pressed="!brut && largeur === 'ordinateur'" @click="((brut = false), (largeur = 'ordinateur'))">Ordinateur</button>
        <button type="button" class="chip" :aria-pressed="!brut && largeur === 'telephone'" @click="((brut = false), (largeur = 'telephone'))">Téléphone</button>
        <button type="button" class="chip" :aria-pressed="brut" @click="brut = true">Texte brut</button>
      </div>
      <pre v-if="brut" class="brut">{{ apercu.texte }}</pre>
      <div v-else class="cadre" :class="largeur">
        <iframe :title="`Aperçu : ${apercu.titre}`" :srcdoc="apercu.html" sandbox="" />
      </div>

      <form v-if="configure" class="envoi" novalidate @submit.prevent="envoyer">
        <div class="field">
          <label for="apercu-to">M’envoyer cet exemple</label>
          <input id="apercu-to" v-model="to" class="input" type="email" autocomplete="email" placeholder="vous@exemple.fr" />
        </div>
        <button class="btn primary" type="submit" :disabled="busy || !to.trim()"><AppIcon name="mail" :size="16" />{{ busy ? 'Envoi…' : 'Envoyer l’exemple' }}</button>
      </form>
      <p v-else class="muted">Pour recevoir un exemple dans votre messagerie, l’envoi d’e-mails doit d’abord être configuré sur ce serveur.</p>
      <p v-if="error" class="alert bad" role="alert">{{ error }}</p>
      <p v-if="ok" class="alert ok" role="status">{{ ok }}</p>
    </template>
  </section>
</template>

<style scoped>
.box {
  padding: 18px;
  display: grid;
  gap: 12px;
}
h2 {
  margin: 0;
  font-size: 1.15rem;
  text-transform: none;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.objet {
  margin: 0;
  overflow-wrap: anywhere;
}
.cadre {
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 12px;
  display: grid;
  justify-items: center;
}
.cadre iframe {
  width: 100%;
  height: 1060px;
  border: 0;
  background: #f1f3f5;
  border-radius: 6px;
}
.cadre.telephone iframe {
  max-width: 375px;
}
.cadre.ordinateur iframe {
  max-width: 680px;
}
.brut {
  margin: 0;
  padding: 14px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: 10px;
  font-family: var(--f-mono);
  font-size: 0.85rem;
}
.envoi {
  display: grid;
  gap: 10px;
  max-width: 460px;
}
</style>
