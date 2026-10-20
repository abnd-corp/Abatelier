<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, ApiError } from '@/api'
import OrderEditor from '@/components/orders/OrderEditor.vue'
import EspaceAuthForm from '@/components/site/EspaceAuthForm.vue'
import EspaceAvantages from '@/components/site/EspaceAvantages.vue'
import { nomCompte } from '@/lib/espace'
import { newLine, type OrderCatalog, type OrderForm } from '@/lib/orders'
import { useEspaceStore } from '@/stores/espace'

// Configurateur de pliage : le visiteur dessine ses pièces et voit le prix en direct (calculé par le serveur, avec les tarifs et
// les limites de la plieuse), sans compte. Pour recevoir son devis, il crée son espace client (ou s'y connecte) : le devis
// est alors dans son espace tout de suite, avec le suivi de la commande.
const router = useRouter()
const espace = useEspaceStore()
const catalog = ref<OrderCatalog | null>(null)
const loadError = ref('')
const form = ref<OrderForm | null>(null)
const priced = ref(false)

onMounted(async () => {
  // Le visiteur est peut-être déjà connecté à son espace : on lui évite de se reconnecter
  espace.ensureLoaded()
  try {
    catalog.value = await api<OrderCatalog>('/public/configurateur')
    form.value = { clientId: '', lignes: [newLine(catalog.value)], livraison: { mode: 'retrait' }, notes: '' }
  } catch (e) {
    loadError.value = e instanceof ApiError ? e.message : 'Le configurateur est momentanément indisponible. Réessayez dans quelques instants.'
  }
})
const emptyCatalog = computed(() => !!catalog.value && (!catalog.value.models.length || !catalog.value.materials.length || !catalog.value.colors.length))

// --- Devis dans l'espace client ---
const tab = ref<'inscription' | 'connexion'>('inscription')
const precision = ref('')
const orderError = ref<{ field?: string; msg: string } | null>(null)
const sending = ref(false)
const failure = ref('')

async function demander() {
  if (!form.value) return
  orderError.value = null
  failure.value = ''
  sending.value = true
  try {
    const res = await api<{ id: string }>('/espace/devis', { method: 'POST', body: { lignes: form.value.lignes, livraison: form.value.livraison, notes: precision.value } })
    await router.push({ name: 'espace-commande', params: { id: res.id } })
  } catch (e) {
    if (e instanceof ApiError && e.field && (e.field.startsWith('lignes') || e.field.startsWith('livraison'))) orderError.value = { field: e.field, msg: e.message }
    else if (!(e instanceof ApiError && e.status === 401)) failure.value = e instanceof ApiError ? e.message : 'Envoi impossible. Réessayez, ou appelez-nous.'
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
      <p class="lead">Choisissez le modèle, les cotes, la matière et le coloris : le prix se met à jour à chaque changement, sans compte. Pour obtenir votre devis et suivre votre commande, créez votre espace client en une minute. Pour une pièce très particulière, <RouterLink :to="{ name: 'site-contact' }">envoyez-nous votre plan</RouterLink>.</p>
    </header>

    <p v-if="loadError" class="alert bad" role="alert">{{ loadError }}</p>
    <p v-else-if="emptyCatalog" class="alert bad" role="alert">Le configurateur n’est pas disponible pour l’instant. <RouterLink :to="{ name: 'site-contact' }">Contactez-nous</RouterLink> pour votre devis.</p>
    <p v-else-if="!catalog" class="muted" aria-busy="true">Chargement…</p>

    <template v-if="catalog && form && !emptyCatalog">
      <div class="configurateur">
        <OrderEditor v-model="form" :catalog="catalog" :addresses="[]" :error="orderError" quote-url="/public/configurateur/chiffrage" visitor @priced="priced = $event">
          <p class="muted hint">Prix indicatif pour un particulier, TVA comprise. Le devis fait foi.</p>
          <a class="btn primary" href="#devis" :aria-disabled="!priced" :class="{ off: !priced }">Obtenir mon devis</a>
        </OrderEditor>

        <section id="devis" class="card devis" aria-labelledby="devis-titre">
          <h2 id="devis-titre">Obtenir mon devis</h2>
          <p v-if="failure" class="alert bad" role="alert">{{ failure }}</p>
          <p v-if="!priced" class="muted hint">Corrigez d’abord les pièces signalées ci-dessus : le prix doit s’afficher.</p>

          <p v-if="!espace.loaded" class="muted" aria-busy="true">Chargement…</p>

          <!-- Déjà connecté : un clic -->
          <form v-else-if="espace.compte" class="logged" novalidate @submit.prevent="demander">
            <p>Vous êtes connecté : <b>{{ nomCompte(espace.compte) }}</b> ({{ espace.compte.email }}). Votre devis sera dans <RouterLink :to="{ name: 'espace' }">votre espace client</RouterLink>.</p>
            <div class="field">
              <label for="d-precision">Une précision pour l’atelier ? (facultatif)</label>
              <textarea id="d-precision" v-model="precision" class="input" rows="3" maxlength="2000" placeholder="Date souhaitée, pose, remarque sur le chantier…" />
            </div>
            <p><button class="s-btn primary" type="submit" :disabled="sending || !priced">{{ sending ? 'Création du devis…' : 'Obtenir mon devis' }}</button></p>
          </form>

          <!-- Pas de compte : on le crée ici, puis le devis est demandé aussitôt -->
          <template v-else>
            <p class="muted">Votre configuration est conservée. Créez votre espace client (gratuit) pour recevoir le devis tout de suite.</p>
            <EspaceAvantages compact id-prefix="cfg-av" />
            <div class="switch" role="group" aria-label="Espace client">
              <button type="button" class="chip" :aria-pressed="tab === 'inscription'" @click="tab = 'inscription'">Créer mon espace</button>
              <button type="button" class="chip" :aria-pressed="tab === 'connexion'" @click="tab = 'connexion'">J’ai déjà un espace</button>
            </div>
            <div class="field">
              <label for="d-precision-n">Une précision pour l’atelier ? (facultatif)</label>
              <textarea id="d-precision-n" v-model="precision" class="input" rows="3" maxlength="2000" placeholder="Date souhaitée, pose, remarque sur le chantier…" />
            </div>
            <EspaceAuthForm :key="tab" :mode="tab" :busy="sending" :disabled="!priced" :submit-text="tab === 'inscription' ? 'Créer mon espace et obtenir mon devis' : 'Me connecter et obtenir mon devis'" id-prefix="cfg" :after="demander" />
          </template>
        </section>
      </div>
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
  /* L'en-tête du site reste collé en haut : l'ancre « #devis » s'arrête juste dessous */
  scroll-margin-top: var(--sticky-top, 16px);
}
.devis h2,
.devis p {
  margin: 0;
}
.switch {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.hint {
  font-size: 0.84rem;
}
.btn.off {
  opacity: 0.5;
  pointer-events: none;
}
.logged {
  display: grid;
  gap: 14px;
}
@media (max-width: 640px) {
  .devis {
    padding: 18px;
  }
  .devis .s-btn {
    width: 100%;
  }
}
</style>
