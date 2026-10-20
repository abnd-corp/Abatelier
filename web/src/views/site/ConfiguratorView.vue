<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { api, ApiError } from '@/api'
import OrderEditor from '@/components/orders/OrderEditor.vue'
import AppIcon from '@/components/AppIcon.vue'
import { newLine, type OrderCatalog, type OrderForm } from '@/lib/orders'

// Configurateur de pliage : le visiteur dessine ses pièces, voit le prix en direct (calculé par le serveur, avec les tarifs et
// les limites de la plieuse), puis demande un devis. Aucun compte, aucun cookie.
const catalog = ref<OrderCatalog | null>(null)
const loadError = ref('')
const form = ref<OrderForm | null>(null)
const priced = ref(false)

onMounted(async () => {
  try {
    catalog.value = await api<OrderCatalog>('/public/configurateur')
    form.value = { clientId: '', lignes: [newLine(catalog.value)], livraison: { mode: 'retrait' }, notes: '' }
  } catch (e) {
    loadError.value = e instanceof ApiError ? e.message : 'Le configurateur est momentanément indisponible. Réessayez dans quelques instants.'
  }
})
const emptyCatalog = computed(() => !!catalog.value && (!catalog.value.models.length || !catalog.value.materials.length || !catalog.value.colors.length))

// --- Demande de devis ---
const contact = reactive({ nom: '', email: '', telephone: '', codePostal: '', ville: '', message: '', consentement: false, site: '' })
const errors = reactive<Record<string, string>>({})
const orderError = ref<{ field?: string; msg: string } | null>(null)
const sending = ref(false)
const sent = ref(false)
const failure = ref('')

async function submit() {
  if (!form.value) return
  for (const k of Object.keys(errors)) delete errors[k]
  orderError.value = null
  failure.value = ''
  sending.value = true
  try {
    await api('/public/devis', { method: 'POST', body: { ...contact, lignes: form.value.lignes, livraison: form.value.livraison } })
    sent.value = true
    window.scrollTo({ top: 0 })
  } catch (e) {
    if (e instanceof ApiError && e.field && (e.field.startsWith('lignes') || e.field.startsWith('livraison'))) orderError.value = { field: e.field, msg: e.message }
    else if (e instanceof ApiError && e.field) errors[e.field] = e.message
    else failure.value = e instanceof ApiError ? e.message : 'Envoi impossible. Réessayez, ou appelez-nous.'
    const first = Object.keys(errors)[0]
    if (first) document.getElementById(`d-${first}`)?.focus()
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <div class="s-wrap page">
    <header class="top">
      <span class="eyebrow">Configurateur de pliage</span>
      <h1>Dessinez votre pièce, voyez le prix</h1>
      <p class="lead">Choisissez le modèle, les cotes, la matière et le coloris : le prix se met à jour à chaque changement. Quand il vous convient, demandez le devis. Pour une pièce très particulière, <RouterLink :to="{ name: 'site-contact' }">envoyez-nous votre plan</RouterLink>.</p>
    </header>

    <p v-if="loadError" class="alert bad" role="alert">{{ loadError }}</p>
    <p v-else-if="emptyCatalog" class="alert bad" role="alert">Le configurateur n’est pas disponible pour l’instant. <RouterLink :to="{ name: 'site-contact' }">Contactez-nous</RouterLink> pour votre devis.</p>
    <p v-else-if="!catalog" class="muted" aria-busy="true">Chargement…</p>

    <section v-if="sent" class="card done" role="status">
      <AppIcon name="check" :size="32" />
      <h2>Demande de devis envoyée</h2>
      <p>Merci ! Nous avons bien reçu vos pièces et le prix affiché. Nous vérifions la faisabilité, puis nous vous envoyons le devis par e-mail.</p>
      <p><RouterLink :to="{ name: 'site-home' }" class="s-btn">Retour à l’accueil</RouterLink></p>
    </section>

    <template v-else-if="catalog && form && !emptyCatalog">
      <form class="configurateur" novalidate @submit.prevent="submit">
        <OrderEditor v-model="form" :catalog="catalog" :addresses="[]" :error="orderError" quote-url="/public/configurateur/chiffrage" visitor @priced="priced = $event">
          <p class="muted hint">Prix indicatif pour un particulier, TVA comprise. Le devis fait foi.</p>
          <a class="btn primary" href="#devis" :aria-disabled="!priced" :class="{ off: !priced }">Demander ce devis</a>
        </OrderEditor>

        <fieldset id="devis" class="card devis">
          <legend>Demander le devis</legend>
          <p class="muted">Laissez vos coordonnées : nous vous répondons avec un devis gratuit.</p>
          <p v-if="failure" class="alert bad" role="alert">{{ failure }}</p>
          <div class="two">
            <div class="field">
              <label for="d-nom">Votre nom *</label>
              <input id="d-nom" v-model="contact.nom" class="input" :class="{ invalid: errors.nom }" autocomplete="name" required :aria-invalid="!!errors.nom" :aria-describedby="errors.nom ? 'ed-nom' : undefined" />
              <span v-if="errors.nom" id="ed-nom" class="field-error">{{ errors.nom }}</span>
            </div>
            <div class="field">
              <label for="d-email">Votre e-mail *</label>
              <input id="d-email" v-model="contact.email" type="email" class="input" :class="{ invalid: errors.email }" autocomplete="email" required :aria-invalid="!!errors.email" :aria-describedby="errors.email ? 'ed-email' : undefined" />
              <span v-if="errors.email" id="ed-email" class="field-error">{{ errors.email }}</span>
            </div>
          </div>
          <div class="two">
            <div class="field">
              <label for="d-telephone">Votre téléphone</label>
              <input id="d-telephone" v-model="contact.telephone" type="tel" class="input" :class="{ invalid: errors.telephone }" autocomplete="tel" :aria-invalid="!!errors.telephone" :aria-describedby="errors.telephone ? 'ed-telephone' : undefined" />
              <span v-if="errors.telephone" id="ed-telephone" class="field-error">{{ errors.telephone }}</span>
            </div>
            <div class="field">
              <label for="d-codePostal">Code postal du chantier</label>
              <input id="d-codePostal" v-model="contact.codePostal" class="input" :class="{ invalid: errors.codePostal }" inputmode="numeric" autocomplete="postal-code" :aria-invalid="!!errors.codePostal" :aria-describedby="errors.codePostal ? 'ed-codePostal' : undefined" />
              <span v-if="errors.codePostal" id="ed-codePostal" class="field-error">{{ errors.codePostal }}</span>
            </div>
          </div>
          <div class="field">
            <label for="d-message">Une précision ? (facultatif)</label>
            <textarea id="d-message" v-model="contact.message" class="input" rows="3" placeholder="Date souhaitée, pose, remarque sur le chantier…" />
          </div>
          <div class="trap" aria-hidden="true">
            <label for="d-site">Ne pas remplir</label>
            <input id="d-site" v-model="contact.site" tabindex="-1" autocomplete="off" />
          </div>
          <div class="field">
            <label class="check">
              <input id="d-consentement" v-model="contact.consentement" type="checkbox" :aria-invalid="!!errors.consentement" :aria-describedby="errors.consentement ? 'ed-consentement' : undefined" />
              <span>J’accepte que mes données servent à traiter ma demande (<RouterLink :to="{ name: 'site-confidentialite' }" target="_blank">politique de confidentialité</RouterLink>). *</span>
            </label>
            <span v-if="errors.consentement" id="ed-consentement" class="field-error">{{ errors.consentement }}</span>
          </div>
          <p><button class="s-btn primary" type="submit" :disabled="sending || !priced">{{ sending ? 'Envoi…' : 'Envoyer ma demande de devis' }}</button></p>
          <p v-if="!priced" class="muted hint">Corrigez d’abord les pièces signalées ci-dessus : le prix doit s’afficher.</p>
        </fieldset>
      </form>
    </template>
  </div>
</template>

<style scoped>
.page {
  padding-top: 36px;
  display: grid;
  gap: 18px;
}
.top h1 {
  font-size: clamp(1.9rem, 4.5vw, 2.8rem);
  margin: 6px 0 12px;
  text-transform: none;
}
.lead {
  color: var(--muted);
  max-width: 48em;
}
.configurateur {
  display: grid;
  gap: 16px;
}
.devis {
  padding: 24px;
  display: grid;
  gap: 14px;
  margin: 0;
}
.two {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.done {
  padding: 24px;
  display: grid;
  gap: 12px;
  justify-items: start;
}
.done svg {
  color: var(--ok);
}
.hint {
  font-size: 0.84rem;
}
.btn.off {
  opacity: 0.5;
  pointer-events: none;
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
@media (max-width: 640px) {
  .two {
    grid-template-columns: minmax(0, 1fr);
  }
  .devis {
    padding: 18px;
  }
  .devis .s-btn {
    width: 100%;
  }
}
</style>
