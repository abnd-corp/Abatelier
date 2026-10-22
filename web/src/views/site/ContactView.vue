<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { api, ApiError } from '@/api'
import AppIcon from '@/components/AppIcon.vue'
import { fileToBase64, lines, PLAN_MAX, PLAN_TYPES, site, telHref } from '@/lib/site'

const e = computed(() => site.value?.entreprise)
const horaires = computed(() => lines(site.value?.contenu['site.horaires']))

const form = reactive({ nom: '', email: '', telephone: '', adresse: '', codePostal: '', ville: '', objet: '', message: '', consentement: false, site: '' })
const file = ref<File | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const errors = reactive<Record<string, string>>({})
const sending = ref(false)
const sent = ref(false)
const failure = ref('')

function pick(ev: Event) {
  delete errors.fichier
  const f = (ev.target as HTMLInputElement).files?.[0] ?? null
  file.value = null
  if (!f) return
  if (!PLAN_TYPES.includes(f.type)) errors.fichier = 'Format non accepté : joignez un PDF, une photo JPEG ou une image PNG.'
  else if (f.size > PLAN_MAX) errors.fichier = 'Fichier trop lourd : 5 Mo maximum.'
  else file.value = f
  if (errors.fichier && fileInput.value) fileInput.value.value = ''
}
function removeFile() {
  file.value = null
  if (fileInput.value) fileInput.value.value = ''
}

async function submit() {
  for (const k of Object.keys(errors)) delete errors[k]
  failure.value = ''
  sending.value = true
  try {
    await api('/public/contact', {
      method: 'POST',
      body: {
        ...form,
        fichier: file.value ? { nom: file.value.name, contenu: await fileToBase64(file.value) } : null,
      },
    })
    sent.value = true
    window.scrollTo({ top: 0 })
  } catch (err) {
    if (err instanceof ApiError && err.field) errors[err.field] = err.message
    else failure.value = err instanceof ApiError ? err.message : 'Envoi impossible. Réessayez, ou appelez-nous.'
    // Amène le curseur sur la première erreur
    const first = Object.keys(errors)[0]
    if (first) document.getElementById(`c-${first}`)?.focus()
  } finally {
    sending.value = false
  }
}
const size = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} Mo` : `${Math.max(1, Math.round(n / 1024))} Ko`)
</script>

<template>
  <div class="s-wrap page">
    <header class="top">
      <span class="eyebrow">Devis gratuit</span>
      <h1>Contactez-nous</h1>
      <p v-if="site" class="lead">{{ site.contenu['contact.intro'] }}</p>
    </header>

    <div class="cols">
      <section v-if="sent" class="card done" role="status">
        <AppIcon name="check" :size="32" />
        <h2>Message envoyé</h2>
        <p>Merci ! Nous avons bien reçu votre demande et nous vous répondons dès que possible, pendant nos horaires d’ouverture.</p>
        <p v-if="e?.telephone" class="muted">
          Pour une urgence, appelez-nous au <a :href="`tel:${telHref(e.telephone)}`">{{ e.telephone }}</a
          >.
        </p>
        <p><RouterLink :to="{ name: 'site-home' }" class="s-btn">Retour à l’accueil</RouterLink></p>
      </section>

      <form v-else class="card form" novalidate @submit.prevent="submit">
        <p v-if="failure" class="alert bad" role="alert">{{ failure }}</p>

        <div class="field">
          <label for="c-nom">Votre nom *</label>
          <input
            id="c-nom"
            v-model="form.nom"
            class="input"
            :class="{ invalid: errors.nom }"
            autocomplete="name"
            required
            :aria-invalid="!!errors.nom"
            :aria-describedby="errors.nom ? 'e-nom' : undefined"
          />
          <span v-if="errors.nom" id="e-nom" class="field-error">{{ errors.nom }}</span>
        </div>
        <div class="two">
          <div class="field">
            <label for="c-email">Votre e-mail *</label>
            <input
              id="c-email"
              v-model="form.email"
              type="email"
              class="input"
              :class="{ invalid: errors.email }"
              autocomplete="email"
              required
              :aria-invalid="!!errors.email"
              :aria-describedby="errors.email ? 'e-email' : undefined"
            />
            <span v-if="errors.email" id="e-email" class="field-error">{{ errors.email }}</span>
          </div>
          <div class="field">
            <label for="c-telephone">Votre téléphone</label>
            <input
              id="c-telephone"
              v-model="form.telephone"
              type="tel"
              class="input"
              :class="{ invalid: errors.telephone }"
              autocomplete="tel"
              :aria-invalid="!!errors.telephone"
              :aria-describedby="errors.telephone ? 'e-telephone' : undefined"
            />
            <span v-if="errors.telephone" id="e-telephone" class="field-error">{{ errors.telephone }}</span>
          </div>
        </div>
        <div class="field">
          <label for="c-adresse">Adresse du chantier ou de livraison</label>
          <input id="c-adresse" v-model="form.adresse" class="input" autocomplete="street-address" />
        </div>
        <div class="two">
          <div class="field">
            <label for="c-codePostal">Code postal</label>
            <input
              id="c-codePostal"
              v-model="form.codePostal"
              class="input"
              :class="{ invalid: errors.codePostal }"
              inputmode="numeric"
              autocomplete="postal-code"
              :aria-invalid="!!errors.codePostal"
              :aria-describedby="errors.codePostal ? 'e-codePostal' : undefined"
            />
            <span v-if="errors.codePostal" id="e-codePostal" class="field-error">{{ errors.codePostal }}</span>
          </div>
          <div class="field">
            <label for="c-ville">Ville</label>
            <input id="c-ville" v-model="form.ville" class="input" autocomplete="address-level2" />
          </div>
        </div>
        <div class="field">
          <label for="c-objet">Objet *</label>
          <input
            id="c-objet"
            v-model="form.objet"
            class="input"
            :class="{ invalid: errors.objet }"
            placeholder="Ex. : 12 couvertines blanches de 3 m"
            required
            :aria-invalid="!!errors.objet"
            :aria-describedby="errors.objet ? 'e-objet' : undefined"
          />
          <span v-if="errors.objet" id="e-objet" class="field-error">{{ errors.objet }}</span>
        </div>
        <div class="field">
          <label for="c-message">Votre message *</label>
          <textarea
            id="c-message"
            v-model="form.message"
            class="input"
            :class="{ invalid: errors.message }"
            rows="6"
            required
            :aria-invalid="!!errors.message"
            :aria-describedby="errors.message ? 'e-message' : undefined"
          />
          <span v-if="errors.message" id="e-message" class="field-error">{{ errors.message }}</span>
        </div>

        <div class="field">
          <label for="c-fichier">Votre plan (facultatif)</label>
          <input id="c-fichier" ref="fileInput" type="file" class="input" accept="application/pdf,image/jpeg,image/png" :aria-describedby="errors.fichier ? 'e-fichier' : 'h-fichier'" @change="pick" />
          <span id="h-fichier" class="muted hint">PDF, photo ou croquis (JPEG, PNG), 5 Mo maximum.</span>
          <span v-if="errors.fichier" id="e-fichier" class="field-error">{{ errors.fichier }}</span>
          <span v-if="file" class="picked">{{ file.name }} · {{ size(file.size) }} <button type="button" class="link" @click="removeFile">Retirer</button></span>
        </div>

        <!-- Piège à robots : invisible pour une personne, rempli par les robots -->
        <div class="trap" aria-hidden="true">
          <label for="c-site">Ne pas remplir</label>
          <input id="c-site" v-model="form.site" tabindex="-1" autocomplete="off" />
        </div>

        <div class="field consent">
          <label class="check">
            <input id="c-consentement" v-model="form.consentement" type="checkbox" :aria-invalid="!!errors.consentement" :aria-describedby="errors.consentement ? 'e-consentement' : undefined" />
            <span>J’accepte que mes données servent à traiter ma demande (<RouterLink :to="{ name: 'site-confidentialite' }" target="_blank">politique de confidentialité</RouterLink>). *</span>
          </label>
          <span v-if="errors.consentement" id="e-consentement" class="field-error">{{ errors.consentement }}</span>
        </div>

        <button class="s-btn primary" type="submit" :disabled="sending">{{ sending ? 'Envoi…' : 'Envoyer' }}</button>
        <p class="muted hint">* champs obligatoires</p>
      </form>

      <aside class="card side" aria-label="Coordonnées">
        <h2>Nos coordonnées</h2>
        <template v-if="e">
          <p>
            <b>{{ e.nom }}</b
            ><br /><template v-for="l in e.adresse.split('\n')" :key="l">{{ l }}<br /></template>
          </p>
          <p v-if="e.telephone">
            <AppIcon name="phone" :size="16" /> <a :href="`tel:${telHref(e.telephone)}`">{{ e.telephone }}</a>
          </p>
          <p v-if="e.email">
            <AppIcon name="mail" :size="16" /> <a :href="`mailto:${e.email}`">{{ e.email }}</a>
          </p>
          <p>
            <a class="s-btn" :href="e.itineraire" target="_blank" rel="noopener noreferrer"><AppIcon name="map-pin" :size="16" />Itinéraire</a>
          </p>
        </template>
        <h2>Horaires</h2>
        <p v-for="l in horaires" :key="l">{{ l }}</p>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.page {
  padding-top: 36px;
}
.top h1 {
  font-size: clamp(1.9rem, 4.5vw, 2.8rem);
  margin: 6px 0 12px;
  text-transform: none;
}
.lead {
  color: var(--muted);
  max-width: 44em;
}
.cols {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
  gap: 20px;
  margin-top: 24px;
  align-items: start;
}
.form,
.side,
.done {
  padding: 24px;
  display: grid;
  gap: 16px;
}
.two {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
textarea.input {
  resize: vertical;
  min-height: 120px;
}
.hint {
  font-size: 0.82rem;
}
.picked {
  font-size: 0.86rem;
  display: flex;
  gap: 10px;
  align-items: center;
}
.link {
  border: 0;
  background: none;
  color: var(--accent);
  text-decoration: underline;
  padding: 0;
}
.trap {
  position: absolute;
  left: -9999px;
  width: 1px;
  height: 1px;
  overflow: hidden;
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
.side h2,
.done h2 {
  text-transform: none;
  font-size: 1.2rem;
}
.side p {
  display: block;
}
.done {
  justify-items: start;
  grid-column: 1;
}
.done svg {
  color: var(--ok);
}
@media (max-width: 860px) {
  .cols {
    grid-template-columns: minmax(0, 1fr);
  }
  .two {
    grid-template-columns: minmax(0, 1fr);
  }
  .form,
  .side,
  .done {
    padding: 18px;
  }
  .form .s-btn {
    width: 100%;
  }
}
</style>
