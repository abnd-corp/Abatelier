<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { api, ApiError } from '@/api'
import AppIcon from '@/components/AppIcon.vue'
import EspaceAuthForm from '@/components/site/EspaceAuthForm.vue'
import EspaceAvantages from '@/components/site/EspaceAvantages.vue'
import PhotoPlaceholder from '@/components/site/PhotoPlaceholder.vue'
import { eur } from '@/lib/catalog'
import { loadBoutique, QUANTITE_MAX, type BoutiqueData, type PanierPrix } from '@/lib/boutique'
import { nomCompte } from '@/lib/espace'
import { useEspaceStore } from '@/stores/espace'
import { usePanierStore } from '@/stores/panier'

// Panier : articles et quantités gardés dans le navigateur, prix recalculés par le serveur, puis paiement.
// Le compte client n'est demandé qu'au moment de payer.
const router = useRouter()
const panier = usePanierStore()
const espace = useEspaceStore()
const prix = ref<PanierPrix | null>(null)
const boutique = ref<BoutiqueData | null>(null)
const error = ref('')
const failure = ref('')
const paying = ref(false)
const tab = ref<'inscription' | 'connexion'>('inscription')
const livraison = reactive({ mode: 'retrait' as 'retrait' | 'livraison', adresse: '', codePostal: '', ville: '' })
const fieldError = ref<{ field?: string; msg: string } | null>(null)

const body = () => ({ lignes: panier.lignes, livraison: livraison.mode === 'retrait' ? { mode: 'retrait' } : { mode: 'livraison', adresse: livraison.adresse, codePostal: livraison.codePostal, ville: livraison.ville } })

let timer: ReturnType<typeof setTimeout> | undefined
async function refresh() {
  fieldError.value = null
  if (!panier.lignes.length) {
    prix.value = null
    return
  }
  // Livraison pas encore saisie : on chiffre le panier seul, en attendant l'adresse
  const withDelivery = livraison.mode === 'livraison' && (!livraison.adresse || !livraison.codePostal || !livraison.ville)
  try {
    prix.value = await api<PanierPrix>('/public/boutique/panier', { method: 'POST', body: withDelivery ? { ...body(), livraison: { mode: 'retrait' } } : body() })
  } catch (e) {
    if (e instanceof ApiError && e.field?.startsWith('livraison')) fieldError.value = { field: e.field, msg: e.message }
    else if (e instanceof ApiError && e.field?.startsWith('lignes')) error.value = e.message
    else error.value = e instanceof ApiError ? e.message : 'Impossible de calculer le prix. Réessayez.'
  }
}
onMounted(async () => {
  espace.ensureLoaded()
  loadBoutique().then((b) => (boutique.value = b)).catch(() => undefined)
  await refresh()
})
watch(
  () => [panier.lignes.map((l) => `${l.variantId}:${l.quantite}`).join(), livraison.mode, livraison.adresse, livraison.codePostal, livraison.ville],
  () => {
    clearTimeout(timer)
    timer = setTimeout(refresh, 350)
  },
)
onBeforeUnmount(() => clearTimeout(timer))

const image = (produitId: string) => boutique.value?.produits.find((p) => p.id === produitId)?.image ?? null
const retirerIndisponibles = () => {
  for (const id of prix.value?.indisponibles ?? []) panier.remove(id)
}
const setQty = (id: string, ev: Event) => panier.setQuantite(id, Number((ev.target as HTMLInputElement).value))
const livraisonPrete = computed(() => livraison.mode === 'retrait' || (livraison.adresse && livraison.codePostal && livraison.ville))
const payable = computed(() => !!prix.value && prix.value.lignes.length > 0 && !prix.value.indisponibles.length && !fieldError.value && !!livraisonPrete.value)

async function payer() {
  failure.value = ''
  paying.value = true
  try {
    const res = await api<{ id: string; url: string }>('/espace/boutique/paiement', { method: 'POST', body: body() })
    // Page de paiement du prestataire (adresse complète), ou page de démonstration du site
    if (res.url.startsWith('/')) await router.push(res.url)
    else window.location.assign(res.url)
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) await refresh()
    if (e instanceof ApiError && e.field?.startsWith('livraison')) fieldError.value = { field: e.field, msg: e.message }
    else if (!(e instanceof ApiError && e.status === 401)) failure.value = e instanceof ApiError ? e.message : 'Paiement impossible. Réessayez, ou appelez-nous.'
  } finally {
    paying.value = false
  }
}
</script>

<template>
  <div class="s-wrap page">
    <header class="top">
      <span class="eyebrow">Boutique</span>
      <h1>Mon panier</h1>
    </header>

    <section v-if="!panier.lignes.length" class="card empty">
      <h2>Votre panier est vide</h2>
      <p class="muted">Choisissez des articles dans la boutique, ils s’afficheront ici avec leur prix.</p>
      <p><RouterLink :to="{ name: 'site-boutique' }" class="s-btn primary">Voir la boutique</RouterLink></p>
    </section>

    <template v-else>
      <p v-if="error" class="alert bad" role="alert">{{ error }}</p>
      <p v-if="prix?.indisponibles.length" class="alert warn" role="alert">
        {{ prix.indisponibles.length === 1 ? 'Un article de votre panier n’est plus en vente.' : `${prix.indisponibles.length} articles de votre panier ne sont plus en vente.` }}
        <button class="link" type="button" @click="retirerIndisponibles">Les retirer</button>
      </p>

      <div class="layout">
        <section class="card box" aria-labelledby="articles">
          <h2 id="articles">Vos articles</h2>
          <p v-if="!prix" class="muted" aria-busy="true">Calcul du prix…</p>
          <ul v-else class="lignes">
            <li v-for="l in prix.lignes" :key="l.variantId">
              <span class="thumb">
                <img v-if="image(l.produitId)" :src="image(l.produitId)!.url" alt="" loading="lazy" />
                <PhotoPlaceholder v-else :size="22" />
              </span>
              <span class="nom">
                <RouterLink :to="{ name: 'site-produit', params: { id: l.produitId } }">{{ l.produit }}</RouterLink>
                <span class="muted">{{ l.libelle }}</span>
                <span class="muted">{{ eur(l.prixTtc) }} TTC l’unité</span>
              </span>
              <span class="qte">
                <label :for="`q-${l.variantId}`" class="sr-only">Quantité de {{ l.produit }} {{ l.libelle }}</label>
                <input :id="`q-${l.variantId}`" class="input compact" type="number" inputmode="numeric" min="1" :max="QUANTITE_MAX" :value="l.quantite" @change="setQty(l.variantId, $event)" />
              </span>
              <b class="total">{{ eur(l.totalTtc) }}</b>
              <button class="link" type="button" :aria-label="`Retirer ${l.produit} ${l.libelle} du panier`" @click="panier.remove(l.variantId)"><AppIcon name="trash" :size="16" /></button>
            </li>
          </ul>
        </section>

        <aside class="card box recap" aria-label="Récapitulatif">
          <h2>Retrait ou livraison</h2>
          <div class="modes" role="radiogroup" aria-label="Mode de remise">
            <label class="mode"><input v-model="livraison.mode" type="radio" name="mode" value="retrait" /> Retrait à l’atelier</label>
            <label class="mode"><input v-model="livraison.mode" type="radio" name="mode" value="livraison" /> Livraison</label>
          </div>
          <div v-if="livraison.mode === 'livraison'" class="adresse">
            <div class="field">
              <label for="l-adresse">Adresse</label>
              <input id="l-adresse" v-model="livraison.adresse" class="input" autocomplete="street-address" />
            </div>
            <div class="two">
              <div class="field">
                <label for="l-cp">Code postal</label>
                <input id="l-cp" v-model="livraison.codePostal" class="input" inputmode="numeric" autocomplete="postal-code" />
              </div>
              <div class="field">
                <label for="l-ville">Ville</label>
                <input id="l-ville" v-model="livraison.ville" class="input" autocomplete="address-level2" />
              </div>
            </div>
            <p v-if="fieldError" class="alert bad" role="alert">{{ fieldError.msg }}</p>
          </div>

          <dl v-if="prix" class="totals">
            <dt>Articles</dt>
            <dd>{{ eur(prix.totals.brut) }} HT</dd>
            <template v-if="livraison.mode === 'livraison' && prix.totals.livraisonPrix"><dt>Livraison</dt><dd>{{ eur(prix.totals.livraisonPrix) }} HT</dd></template>
            <dt>TVA {{ prix.totals.tauxTva.toLocaleString('fr-FR') }} %</dt>
            <dd>{{ eur(prix.totals.tva) }}</dd>
            <dt class="big">Total TTC</dt>
            <dd class="big">{{ eur(prix.totals.ttc) }}</dd>
          </dl>
          <p class="muted small">Délai : {{ prix?.totals.delaiJours ?? 5 }} jours ouvrés après validation de la commande.</p>
        </aside>
      </div>

      <section id="paiement" class="card box pay" aria-labelledby="payer">
        <h2 id="payer">Payer ma commande</h2>
        <p v-if="failure" class="alert bad" role="alert">{{ failure }}</p>
        <p v-if="prix && !prix.paiement" class="alert warn" role="status">Le paiement en ligne n’est pas encore ouvert. Pour commander ces articles dès maintenant, <RouterLink :to="{ name: 'site-contact' }">contactez-nous</RouterLink>.</p>
        <template v-else-if="!espace.loaded"><p class="muted" aria-busy="true">Chargement…</p></template>

        <form v-else-if="espace.compte" class="logged" novalidate @submit.prevent="payer">
          <p>Vous êtes connecté : <b>{{ nomCompte(espace.compte) }}</b> ({{ espace.compte.email }}). Vous suivrez la commande dans <RouterLink :to="{ name: 'espace' }">votre espace client</RouterLink>.</p>
          <p class="muted small">En payant, vous passez commande : elle est ferme dès la confirmation du paiement. Si nous ne pouvions pas la réaliser, nous vous rembourserions intégralement. <RouterLink :to="{ name: 'site-cgv' }" target="_blank">Conditions de vente</RouterLink></p>
          <p><button class="s-btn primary big" type="submit" :disabled="paying || !payable">{{ paying ? 'Ouverture du paiement…' : `Payer ${prix ? eur(prix.totals.ttc) : ''} par carte` }}</button></p>
        </form>

        <template v-else>
          <p class="muted">Pour payer et suivre votre commande, créez votre espace client (gratuit) ou connectez-vous. Votre panier est conservé.</p>
          <EspaceAvantages compact id-prefix="pan-av" />
          <div class="switch" role="group" aria-label="Espace client">
            <button type="button" class="chip" :aria-pressed="tab === 'inscription'" @click="tab = 'inscription'">Créer mon espace</button>
            <button type="button" class="chip" :aria-pressed="tab === 'connexion'" @click="tab = 'connexion'">J’ai déjà un espace</button>
          </div>
          <EspaceAuthForm :key="tab" :mode="tab" :busy="paying" :disabled="!payable" :submit-text="tab === 'inscription' ? 'Créer mon espace et payer' : 'Me connecter et payer'" id-prefix="pan" :after="payer" />
        </template>
      </section>
    </template>
  </div>
</template>

<style scoped>
.page {
  padding-top: 36px;
  padding-bottom: 48px;
  display: grid;
  gap: 18px;
}
.top h1 {
  margin: 6px 0 0;
  text-transform: none;
  font-size: clamp(1.9rem, 4.5vw, 2.8rem);
}
.alert.warn {
  background: var(--warn-soft);
  color: var(--warn);
}
.empty,
.box {
  padding: 22px 24px;
  display: grid;
  gap: 14px;
  align-content: start;
}
.empty h2,
.empty p,
.box h2,
.box p {
  margin: 0;
}
.layout {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}
.lignes {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 14px;
}
.lignes li {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr) 84px 90px auto;
  gap: 12px;
  align-items: center;
  padding-top: 14px;
  border-top: 1px solid var(--line);
}
.lignes li:first-child {
  padding-top: 0;
  border-top: 0;
}
.thumb {
  width: 64px;
  height: 48px;
  border-radius: 6px;
  overflow: hidden;
  background: var(--surface-2);
  display: grid;
  place-items: center;
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.nom {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.nom a {
  font-weight: 600;
  text-decoration: none;
}
.qte .input {
  width: 100%;
  text-align: center;
}
.total {
  text-align: right;
}
.modes {
  display: grid;
  gap: 8px;
}
.mode {
  display: flex;
  gap: 8px;
  align-items: center;
}
.adresse {
  display: grid;
  gap: 10px;
}
.two {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr);
  gap: 10px;
}
.totals {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px 14px;
  margin: 0;
}
.totals dt {
  color: var(--muted);
}
.totals dd {
  margin: 0;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.totals .big {
  font-weight: 700;
  font-size: 1.15rem;
  color: var(--ink);
  border-top: 1px solid var(--line);
  padding-top: 8px;
}
.small {
  font-size: 0.86rem;
}
.link {
  background: none;
  border: 0;
  color: var(--accent);
  cursor: pointer;
  padding: 4px;
  text-decoration: underline;
}
.logged {
  display: grid;
  gap: 12px;
}
.logged p {
  margin: 0;
}
.switch {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.s-btn.big {
  padding: 14px 26px;
  font-size: 1.05rem;
}
@media (max-width: 900px) {
  .layout {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (max-width: 560px) {
  .lignes li {
    grid-template-columns: 56px minmax(0, 1fr) auto;
  }
  .lignes .qte {
    grid-column: 2;
  }
  .lignes .total {
    grid-column: 3;
  }
  .empty,
  .box {
    padding: 16px;
  }
  .pay .s-btn {
    width: 100%;
  }
}
</style>
