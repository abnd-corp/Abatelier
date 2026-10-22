<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api, ApiError } from '@/api'
import AppIcon from '@/components/AppIcon.vue'
import ProfileSketch from '@/components/orders/ProfileSketch.vue'
import { eur } from '@/lib/catalog'
import { AIDE_RECUE_BOUTIQUE, documentUrl, jour, PARCOURS, statutDocument, type EspaceDocument, type EspaceOrder } from '@/lib/espace'
import { letter, statutOf } from '@/lib/orders'

// Une commande du client : suivi des étapes, devis à accepter, pièces, montants, documents à télécharger
const props = defineProps<{ id: string }>()
const data = ref<EspaceOrder | null>(null)
const notFound = ref(false)
const error = ref('')
const answering = ref(false)
const confirmRefus = ref(false)
const answered = ref('')

async function load() {
  try {
    data.value = await api<EspaceOrder>(`/espace/commandes/${props.id}`)
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound.value = true
    else if (!(e instanceof ApiError && e.status === 401)) error.value = e instanceof ApiError ? e.message : 'Impossible de charger la commande. Réessayez.'
  }
}
onMounted(load)

const c = computed(() => data.value?.commande)
const devis = computed(() => data.value?.documents.find((d) => d.type === 'devis') ?? null)
const factures = computed(() => (data.value?.documents ?? []).filter((d) => d.type !== 'devis'))
const attenteReponse = (d: EspaceDocument | null) => !!d && (d.statut === 'emis' || d.statut === 'envoye') && c.value?.statut !== 'annulee'

const etapes = computed(() => new Map((data.value?.etapes ?? []).map((e) => [e.statut, e.at])))
const annulee = computed(() => c.value?.statut === 'annulee')
const boutique = computed(() => c.value?.kind === 'boutique')
// Payée en ligne (boutique ou commande sur mesure du configurateur) : le paiement tient lieu de réponse au devis
const payee = computed(() => !!data.value?.paiement)
const rembourse = computed(() => data.value?.paiement?.statut === 'rembourse')
const aide = (statut: string, defaut: string) => (payee.value && statut === 'recue' ? AIDE_RECUE_BOUTIQUE : defaut)
const courant = computed(() => PARCOURS.findIndex((p) => p.statut === c.value?.statut))

async function respond(reponse: 'accepte' | 'refuse') {
  if (!devis.value) return
  answering.value = true
  error.value = ''
  try {
    await api(`/espace/documents/${devis.value.id}/reponse`, { method: 'POST', body: { reponse } })
    answered.value =
      reponse === 'accepte' ? 'Merci ! Votre accord est transmis à l’atelier, qui valide votre commande.' : 'Le devis est refusé. Vous pouvez en composer un autre dans le configurateur.'
    confirmRefus.value = false
    await load()
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Envoi impossible. Réessayez, ou appelez-nous.'
  } finally {
    answering.value = false
  }
}

const fmt = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })
</script>

<template>
  <div class="s-wrap page">
    <p>
      <RouterLink :to="{ name: 'espace' }" class="back"><AppIcon name="arrow-left" :size="15" /> Mes commandes</RouterLink>
    </p>

    <section v-if="notFound" class="card box">
      <h1>Commande introuvable</h1>
      <p class="muted">Cette commande n’existe pas ou n’est pas dans votre espace.</p>
    </section>
    <p v-else-if="error && !data" class="alert bad" role="alert">{{ error }}</p>
    <p v-else-if="!data || !c" class="muted" aria-busy="true">Chargement…</p>

    <template v-else>
      <header class="top">
        <span class="eyebrow">Commande</span>
        <h1>{{ c.numero }}</h1>
        <p class="muted">
          Demandée le {{ jour(c.createdAt) }}<template v-if="c.datePrevue && !annulee && c.statut !== 'livree'"> · prévue le {{ jour(c.datePrevue) }}</template>
        </p>
      </header>

      <p v-if="answered" class="alert ok" role="status">{{ answered }}</p>
      <p v-if="error" class="alert bad" role="alert">{{ error }}</p>

      <!-- Suivi -->
      <section class="card box" aria-labelledby="suivi">
        <h2 id="suivi">Suivi de la commande</h2>
        <p v-if="annulee && rembourse" class="alert bad" role="status">
          L’atelier n’a pas pu réaliser cette commande<template v-if="data.paiement?.refundedAt"> (refusée le {{ jour(data.paiement.refundedAt) }})</template>.
          <b>Vous êtes remboursé de la totalité, {{ eur(data.paiement?.montantTtc ?? 0) }}</b
          >, sur le moyen de paiement utilisé (quelques jours selon votre banque).
          <template v-if="data.paiement?.refundMotif"><br />Motif : {{ data.paiement.refundMotif }}</template>
        </p>
        <p v-else-if="annulee" class="alert bad" role="status">
          Cette commande a été annulée<template v-if="etapes.get('annulee')"> le {{ jour(etapes.get('annulee')!) }}</template
          >.
        </p>
        <ol v-else class="steps">
          <li
            v-for="(p, i) in PARCOURS"
            :key="p.statut"
            :class="[`t-${statutOf(p.statut).tone}`, { done: i < courant || (i === courant && c.statut === 'livree'), now: i === courant && c.statut !== 'livree', todo: i > courant }]"
            :aria-current="i === courant ? 'step' : undefined"
          >
            <span class="dot" aria-hidden="true"><AppIcon v-if="i < courant || (i === courant && c.statut === 'livree')" name="check" :size="14" /></span>
            <span class="what">
              <b>{{ p.label }}</b>
              <span v-if="etapes.get(p.statut)" class="muted">{{ jour(etapes.get(p.statut)!) }}</span>
              <span v-else-if="i === courant + 1 && p.statut === 'validee' && !annulee" class="muted">en attente de validation par l’atelier</span>
              <span v-if="i === courant && c.statut !== 'livree'" class="aide">{{ aide(p.statut, p.aide) }}</span>
            </span>
          </li>
        </ol>
      </section>

      <!-- Devis -->
      <section v-if="payee && data.paiement" class="card box" aria-labelledby="titre-paiement">
        <h2 id="titre-paiement">Paiement</h2>
        <p>
          <span class="pill" :class="data.paiement.statut === 'paye' ? 'ok' : 'neutral'">{{
            data.paiement.statut === 'paye' ? 'Payé' : data.paiement.statut === 'rembourse' ? 'Remboursé' : 'En attente'
          }}</span>
          <b class="ttc">{{ eur(data.paiement.montantTtc) }} TTC</b>
          <span v-if="data.paiement.paidAt" class="muted"> · par carte le {{ jour(data.paiement.paidAt) }}</span>
        </p>
        <p class="muted hint">Votre commande a été passée et réglée en ligne : elle vaut contrat. Si l’atelier ne pouvait pas la réaliser, il vous préviendrait et vous rembourserait la totalité.</p>
      </section>
      <section v-else-if="devis" id="devis" class="card box" :class="{ highlight: attenteReponse(devis) }" aria-labelledby="titre-devis">
        <h2 id="titre-devis">Votre devis {{ devis.numero }}</h2>
        <p>
          <span class="pill" :class="statutDocument('devis', devis.statut).tone">{{ statutDocument('devis', devis.statut).label }}</span>
          <b class="ttc">{{ eur(devis.ttc) }} TTC</b>
          <span v-if="devis.echeance" class="muted"> · valable jusqu’au {{ jour(devis.echeance) }}</span>
        </p>
        <p class="actions">
          <a :href="documentUrl(devis.id)" target="_blank" rel="noopener" class="s-btn"><AppIcon name="download" :size="16" /> Télécharger le devis (PDF)</a>
          <template v-if="attenteReponse(devis)">
            <button class="s-btn primary" type="button" :disabled="answering" @click="respond('accepte')">Accepter le devis</button>
            <button v-if="!confirmRefus" class="s-btn" type="button" :disabled="answering" @click="confirmRefus = true">Refuser</button>
            <template v-else>
              <button class="s-btn danger" type="button" :disabled="answering" @click="respond('refuse')">Confirmer le refus</button>
              <button class="s-btn" type="button" @click="confirmRefus = false">Garder le devis</button>
            </template>
          </template>
        </p>
        <p v-if="attenteReponse(devis)" class="muted hint">En acceptant, vous demandez à l’atelier de lancer la commande : il la valide, fixe la date prévue, et vous suivez ici chaque étape.</p>
      </section>
      <section v-else-if="!payee" class="card box">
        <h2>Votre devis</h2>
        <p class="muted">Le devis de cette commande est en cours de préparation. Il apparaîtra ici dès qu’il sera prêt.</p>
      </section>

      <!-- Pièces -->
      <section class="card box" aria-labelledby="pieces">
        <h2 id="pieces">{{ boutique ? 'Vos articles' : 'Vos pièces' }}</h2>
        <ul class="pieces">
          <li v-for="(l, i) in data.lignes" :key="i" class="piece">
            <div v-if="l.cotes.length" class="sketch"><ProfileSketch :cotes="l.cotes" :angles="l.angles" :cap="l.cap" :color="l.colorHex" :label="`Profil de la pièce ${i + 1}`" /></div>
            <div class="info">
              <h3>
                {{ l.quantite }} × {{ l.modeleLabel }}<span v-if="l.repere" class="muted"> · {{ l.repere }}</span>
              </h3>
              <p v-if="l.cotes.length" class="muted">{{ l.materialLabel }} · {{ l.colorLabel }} · longueur {{ l.longueur.toLocaleString('fr-FR') }} mm</p>
              <p v-else class="muted">{{ l.materialLabel }}</p>
              <p v-if="l.cotes.length" class="cotes">
                Cotes :
                <template v-for="(v, j) in l.cotes" :key="j"
                  ><b>{{ letter(j) }}</b> {{ fmt(v) }}<span v-if="j < l.cotes.length - 1"> · </span></template
                >
                mm
              </p>
              <p v-for="a in l.accessoires" :key="a.nom" class="muted">+ {{ a.quantite }} × {{ a.nom }}</p>
            </div>
            <div class="price">
              <b>{{ eur(l.total) }}</b
              ><span class="muted">HT</span>
            </div>
          </li>
        </ul>
      </section>

      <!-- Montants et livraison -->
      <section class="card box" aria-labelledby="montants">
        <h2 id="montants">Montants et livraison</h2>
        <dl class="totals">
          <template v-if="c.totaux.remisePro || c.totaux.complementMinimum || c.totaux.livraisonPrix">
            <dt>Pièces</dt>
            <dd>{{ eur(c.totaux.brut) }}</dd>
          </template>
          <template v-if="c.totaux.remisePro"
            ><dt>Remise</dt>
            <dd>− {{ eur(c.totaux.remisePro) }}</dd></template
          >
          <template v-if="c.totaux.complementMinimum"
            ><dt>Complément au minimum de commande</dt>
            <dd>{{ eur(c.totaux.complementMinimum) }}</dd></template
          >
          <template v-if="c.totaux.livraisonPrix"
            ><dt>Livraison</dt>
            <dd>{{ eur(c.totaux.livraisonPrix) }}</dd></template
          >
          <dt>Total HT</dt>
          <dd>{{ eur(c.totaux.ht) }}</dd>
          <dt>TVA {{ c.totaux.tauxTva.toLocaleString('fr-FR') }} %</dt>
          <dd>{{ eur(c.totaux.tva) }}</dd>
          <dt class="big">Total TTC</dt>
          <dd class="big">{{ eur(c.totaux.ttc) }}</dd>
        </dl>
        <p class="muted">
          <template v-if="c.livraison.mode === 'retrait'">Retrait à l’atelier.</template>
          <template v-else>Livraison : {{ [c.livraison.adresse, [c.livraison.codePostal, c.livraison.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ') }}.</template>
        </p>
      </section>

      <!-- Factures -->
      <section v-if="factures.length" class="card box" aria-labelledby="docs">
        <h2 id="docs">Factures</h2>
        <ul class="docs">
          <li v-for="d in factures" :key="d.id">
            <span
              ><b>{{ d.numero }}</b> <span class="muted">du {{ jour(d.emisLe) }} · {{ eur(d.ttc) }} TTC</span></span
            >
            <span class="pill" :class="statutDocument(d.type, d.statut).tone">{{ statutDocument(d.type, d.statut).label }}</span>
            <a :href="documentUrl(d.id)" target="_blank" rel="noopener" class="s-btn"><AppIcon name="download" :size="16" /> PDF</a>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<style scoped>
.page {
  padding-top: 28px;
  padding-bottom: 40px;
  display: grid;
  gap: 16px;
}
.page > p {
  margin: 0;
}
.back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  text-decoration: none;
}
.top h1 {
  margin: 4px 0;
  text-transform: none;
  font-size: clamp(1.7rem, 4vw, 2.4rem);
}
.top p {
  margin: 0;
}
.box {
  padding: 20px 22px;
  display: grid;
  gap: 12px;
}
.box h1,
.box h2,
.box p {
  margin: 0;
}
.box h2 {
  font-size: 1.15rem;
}
.highlight {
  border-color: var(--accent);
  background: linear-gradient(135deg, var(--accent-soft), var(--surface) 70%);
}
.ttc {
  margin-left: 10px;
  font-size: 1.1rem;
}
.actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.hint {
  font-size: 0.86rem;
}
.s-btn.danger {
  border-color: var(--bad);
  color: var(--bad);
}
.steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0;
}
.steps li {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  gap: 12px;
  position: relative;
  padding-bottom: 18px;
}
.steps li:last-child {
  padding-bottom: 0;
}
.steps li:not(:last-child)::before {
  content: '';
  position: absolute;
  left: 13px;
  top: 28px;
  bottom: 0;
  width: 2px;
  background: var(--line);
}
.steps li.done:not(:last-child)::before {
  background: var(--c);
}
.dot {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid var(--line);
  background: var(--surface);
  display: grid;
  place-items: center;
}
/* Chaque étape a la couleur de sa pastille (la même dans l'atelier) */
.t-warn {
  --c: var(--warn);
  --c-soft: var(--warn-soft);
}
.t-info {
  --c: var(--info);
  --c-soft: var(--info-soft);
}
.t-accent {
  --c: var(--accent);
  --c-soft: var(--accent-soft);
}
.t-ok {
  --c: var(--ok);
  --c-soft: var(--ok-soft);
}
.t-done {
  --c: var(--done);
  --c-soft: var(--done-soft);
}
.done .dot {
  background: var(--c);
  border-color: var(--c);
  color: var(--surface);
}
.now .dot {
  border-color: var(--c);
  background: var(--c-soft);
  box-shadow: 0 0 0 4px var(--c-soft);
}
.todo {
  color: var(--muted);
}
.what {
  display: grid;
  gap: 2px;
  padding-top: 3px;
}
.aide {
  font-size: 0.9rem;
}
.pieces {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 14px;
}
.piece {
  display: grid;
  grid-template-columns: 150px minmax(0, 1fr) auto;
  gap: 16px;
  align-items: center;
  padding-top: 14px;
  border-top: 1px solid var(--line);
}
.piece:not(:has(.sketch)) {
  grid-template-columns: minmax(0, 1fr) auto;
}
.piece:first-child {
  padding-top: 0;
  border-top: 0;
}
.sketch {
  height: 110px;
}
.info {
  display: grid;
  gap: 4px;
}
.info h3 {
  margin: 0;
  font-size: 1rem;
}
.cotes {
  font-family: var(--f-mono);
  font-size: 0.86rem;
}
.cotes b {
  color: var(--accent);
}
.price {
  display: grid;
  justify-items: end;
}
.totals {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px 18px;
  margin: 0;
  max-width: 420px;
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
  font-size: 1.1rem;
  color: var(--ink);
  border-top: 1px solid var(--line);
  padding-top: 8px;
}
.docs {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
}
.docs li {
  display: flex;
  gap: 8px 14px;
  align-items: center;
  flex-wrap: wrap;
  justify-content: space-between;
}
@media (max-width: 640px) {
  .box {
    padding: 16px;
  }
  .piece {
    grid-template-columns: 110px minmax(0, 1fr);
  }
  .price {
    grid-column: 1 / -1;
    justify-items: start;
    grid-auto-flow: column;
    gap: 6px;
  }
  .actions .s-btn {
    flex: 1 1 100%;
  }
}
</style>
