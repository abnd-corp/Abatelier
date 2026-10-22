<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { api, apiFile, ApiError } from '@/api'
import OrderEditor from '@/components/orders/OrderEditor.vue'
import { newLine, type OrderCatalog, type OrderForm } from '@/lib/orders'
import { useEspaceStore } from '@/stores/espace'

// Configurateur de pliage : le visiteur dessine ses pièces et voit le prix en direct (calculé par le serveur, avec les tarifs et
// les limites de la plieuse), sans compte. Trois actions : télécharger le devis (PDF indicatif, sans compte), l'enregistrer
// dans son espace client (devis numéroté) ou passer la commande (paiement en ligne). Les deux dernières demandent un compte.
const router = useRouter()
const espace = useEspaceStore()
const catalog = ref<OrderCatalog | null>(null)
const loadError = ref('')
const form = ref<OrderForm | null>(null)
const priced = ref(false)

// La saisie survit à un détour par la connexion ou la création de l'espace client
const STORE = 'aps-configurateur'
const restore = (): OrderForm | null => {
  try {
    const f = JSON.parse(sessionStorage.getItem(STORE) ?? 'null')
    return f && Array.isArray(f.lignes) && f.lignes.length && f.lignes.every((l: { modelId?: unknown }) => typeof l.modelId === 'string') && f.livraison?.mode ? f : null
  } catch {
    return null
  }
}
const forget = () => {
  try {
    sessionStorage.removeItem(STORE)
  } catch {
    /* stockage indisponible : rien à oublier */
  }
}
watch(
  form,
  (f) => {
    try {
      if (f) sessionStorage.setItem(STORE, JSON.stringify(f))
    } catch {
      /* stockage indisponible : la saisie ne survivra pas à un changement de page */
    }
  },
  { deep: true },
)

onMounted(async () => {
  // Le visiteur est peut-être déjà connecté à son espace
  espace.ensureLoaded()
  try {
    catalog.value = await api<OrderCatalog>('/public/configurateur')
    form.value = restore() ?? { clientId: '', lignes: [newLine(catalog.value)], livraison: { mode: 'retrait' }, notes: '' }
  } catch (e) {
    loadError.value = e instanceof ApiError ? e.message : 'Le configurateur est momentanément indisponible. Réessayez dans quelques instants.'
  }
})
const emptyCatalog = computed(() => !!catalog.value && (!catalog.value.models.length || !catalog.value.materials.length || !catalog.value.colors.length))

// --- Actions ---
const precision = ref('')
const orderError = ref<{ field?: string; msg: string } | null>(null)
const busy = ref<'' | 'telecharger' | 'enregistrer' | 'commander'>('')
const failure = ref('')
const connecte = computed(() => !!espace.compte)
const redirect = { redirect: '/configurateur' }

function guard(e: unknown, fallback: string) {
  if (e instanceof ApiError && e.field && (e.field.startsWith('lignes') || e.field.startsWith('livraison'))) orderError.value = { field: e.field, msg: e.message }
  else if (!(e instanceof ApiError && e.status === 401)) failure.value = e instanceof ApiError ? e.message : fallback
}
async function run(action: 'telecharger' | 'enregistrer' | 'commander', fn: () => Promise<void>, fallback: string) {
  if (!form.value) return
  orderError.value = null
  failure.value = ''
  busy.value = action
  try {
    await fn()
  } catch (e) {
    guard(e, fallback)
  } finally {
    busy.value = ''
  }
}
const corps = () => ({ lignes: form.value!.lignes, livraison: form.value!.livraison, notes: precision.value })

const telecharger = () =>
  run(
    'telecharger',
    async () => {
      const blob = await apiFile('/public/configurateur/estimation.pdf', { method: 'POST', body: { lignes: form.value!.lignes, livraison: form.value!.livraison } })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'devis.pdf'
      a.click()
      URL.revokeObjectURL(url)
    },
    'Téléchargement impossible. Réessayez.',
  )

const enregistrer = () =>
  run(
    'enregistrer',
    async () => {
      const res = await api<{ id: string }>('/espace/devis', { method: 'POST', body: corps() })
      forget()
      await router.push({ name: 'espace-commande', params: { id: res.id } })
    },
    'Envoi impossible. Réessayez, ou appelez-nous.',
  )

const commander = () =>
  run(
    'commander',
    async () => {
      const res = await api<{ id: string; url: string }>('/espace/commande', { method: 'POST', body: corps() })
      // Page de paiement du prestataire (adresse complète), ou page de démonstration du site
      if (res.url.startsWith('/')) await router.push(res.url)
      else window.location.assign(res.url)
    },
    'Paiement impossible. Réessayez, ou appelez-nous.',
  )

// Pourquoi un bouton est grisé : toujours dit, jamais deviné
const reasons = computed(() => {
  const r: string[] = []
  if (!priced.value) r.push('Corrigez d’abord les pièces signalées : le prix doit s’afficher pour télécharger, enregistrer ou commander.')
  return r
})
</script>

<template>
  <div class="s-wrap page">
    <header class="top">
      <span class="eyebrow">Configurateur de pliage</span>
      <h1>Dessinez votre pièce, voyez le prix</h1>
      <p class="lead">Choisissez le modèle, les cotes, la matière et le coloris : le prix se met à jour à chaque changement, sans compte. Téléchargez le devis en PDF. Avec votre espace client, enregistrez-le ou passez directement la commande.</p>
    </header>

    <p v-if="loadError" class="alert bad" role="alert">{{ loadError }}</p>
    <p v-else-if="emptyCatalog" class="alert bad" role="alert">Le configurateur n’est pas disponible pour l’instant. <RouterLink :to="{ name: 'site-contact' }">Contactez-nous</RouterLink> pour votre devis.</p>
    <p v-else-if="!catalog" class="muted" aria-busy="true">Chargement…</p>

    <template v-if="catalog && form && !emptyCatalog">
      <OrderEditor v-model="form" :catalog="catalog" :addresses="[]" :error="orderError" quote-url="/public/configurateur/chiffrage" visitor @priced="priced = $event">
        <p class="muted hint">Prix indicatif pour un particulier, TVA comprise. Le devis enregistré dans votre espace fait foi.</p>
        <p v-if="failure" class="alert bad" role="alert">{{ failure }}</p>
        <div v-if="connecte" class="field">
          <label for="d-precision">Une précision pour l’atelier ? (facultatif)</label>
          <textarea id="d-precision" v-model="precision" class="input" rows="2" maxlength="2000" placeholder="Date souhaitée, pose, remarque sur le chantier…" />
        </div>
        <div class="actions">
          <button class="s-btn" type="button" :disabled="!priced || !!busy" aria-describedby="cfg-why" @click="telecharger">{{ busy === 'telecharger' ? 'Préparation du PDF…' : 'Télécharger le devis' }}</button>
          <button class="s-btn" type="button" :disabled="!priced || !connecte || !!busy" aria-describedby="cfg-why" @click="enregistrer">{{ busy === 'enregistrer' ? 'Enregistrement…' : 'Enregistrer le devis' }}</button>
          <button class="s-btn primary" type="button" :disabled="!priced || !connecte || !!busy" aria-describedby="cfg-why" @click="commander">{{ busy === 'commander' ? 'Ouverture du paiement…' : 'Passer la commande' }}</button>
        </div>
        <div id="cfg-why" class="why muted" aria-live="polite">
          <p v-for="r in reasons" :key="r">{{ r }}</p>
          <p v-if="espace.loaded && !connecte">
            Pour enregistrer le devis ou passer la commande, il faut être connecté à votre espace client.
            <RouterLink :to="{ name: 'espace-connexion', query: redirect }">Me connecter</RouterLink> ·
            <RouterLink :to="{ name: 'espace-inscription', query: redirect }">Créer mon espace</RouterLink>
          </p>
          <p v-else-if="connecte">Le devis enregistré est numéroté et rangé dans <RouterLink :to="{ name: 'espace' }">votre espace client</RouterLink>. La commande se paie en ligne et part directement en fabrication.</p>
        </div>
      </OrderEditor>
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
.hint {
  font-size: 0.84rem;
  margin: 0;
}
.actions {
  display: grid;
  gap: 8px;
}
.actions .s-btn {
  width: 100%;
}
.why {
  display: grid;
  gap: 4px;
  font-size: 0.84rem;
}
.why p {
  margin: 0;
}
</style>
