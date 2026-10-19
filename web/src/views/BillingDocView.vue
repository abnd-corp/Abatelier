<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, ApiError } from '@/api'
import { eur } from '@/lib/catalog'
import { dateTime } from '@/lib/format'
import { formatDay, todayParis } from '@/lib/employees'
import { lineTotal, MODES, modeLabel, pdfUrl, statutOf, typeOf, type BillingDetail, type PaiementMode } from '@/lib/billing'
import { useUiStore } from '@/stores/ui'
import AppIcon from '@/components/AppIcon.vue'

const route = useRoute()
const router = useRouter()
const ui = useUiStore()
const id = computed(() => route.params.id as string)

const detail = ref<BillingDetail | null>(null)
const loadError = ref('')
const notice = ref('')
const actionError = ref<{ field?: string; msg: string } | null>(null)
const busy = ref(false)
const form = ref<'paiement' | 'avoir' | null>(null)

async function load() {
  try {
    detail.value = await api<BillingDetail>(`/billing/${id.value}`)
    ui.crumb = { for: route.fullPath, label: detail.value.document.numero }
    document.title = `${detail.value.document.numero} · Devis et factures · Atelier · Alu Pliage Service`
  } catch (e) {
    loadError.value = e instanceof ApiError ? e.message : 'Chargement impossible.'
  }
}
onMounted(load)
watch(id, () => {
  form.value = null
  notice.value = ''
  load()
})

const d = computed(() => detail.value?.document)
const statut = computed(() => (d.value ? statutOf(d.value.type, d.value.statut) : null))
const isDevis = computed(() => d.value?.type === 'devis')
const isFacture = computed(() => d.value?.type === 'facture')
const canSend = computed(() => !!d.value && !d.value.envoyeLe && ['emis', 'emise'].includes(d.value.statut))
const canAnswer = computed(() => isDevis.value && !d.value!.reponse)
const canAccept = computed(() => canAnswer.value && d.value!.statut !== 'expire')
const canPay = computed(() => isFacture.value && ['emise', 'envoyee', 'en_retard'].includes(d.value!.statut))
const canCredit = computed(() => isFacture.value && d.value!.statut !== 'annulee')

async function act(path: string, body: unknown, done: string, method = 'POST') {
  actionError.value = null
  notice.value = ''
  busy.value = true
  try {
    const res = await api<{ id?: string }>(`/billing/${id.value}/${path}`, { method, body })
    form.value = null
    notice.value = done
    // Un avoir est un nouveau document : on l'ouvre
    if (path === 'avoir' && res?.id) return void router.push({ name: 'billing-doc', params: { id: res.id } })
    await load()
  } catch (e) {
    actionError.value = e instanceof ApiError ? { msg: e.message, field: e.field } : { msg: 'L’action a échoué.' }
  } finally {
    busy.value = false
  }
}

// --- Paiement ---
const payDate = ref(todayParis())
const payMode = ref<PaiementMode>('virement')
const openPay = () => {
  payDate.value = todayParis()
  actionError.value = null
  form.value = 'paiement'
}
const pay = () => act('paiement', { date: payDate.value, mode: payMode.value }, 'Paiement enregistré.')

// --- Avoir ---
const motif = ref('')
const openCredit = () => {
  motif.value = ''
  actionError.value = null
  form.value = 'avoir'
}
const credit = () => act('avoir', { motif: motif.value }, 'Avoir émis : la facture est annulée.')

const sendLabel = computed(() => (isDevis.value ? 'Marquer envoyé' : 'Marquer envoyée'))
</script>

<template>
  <p v-if="loadError" class="alert bad" role="alert">{{ loadError }}</p>

  <template v-if="detail && d && statut">
    <div class="head">
      <RouterLink :to="{ name: 'billing', query: d.type !== 'facture' ? { type: d.type } : {} }" class="back"><AppIcon name="arrow-left" :size="16" />Devis et factures</RouterLink>
      <div class="identity">
        <div>
          <span class="eyebrow">{{ typeOf(d.type).one }}</span>
          <h1 class="mono">{{ d.numero }}</h1>
          <p class="muted">
            <RouterLink :to="{ name: 'client', params: { id: d.clientId } }">{{ d.clientNom }}</RouterLink> · commande
            <RouterLink :to="{ name: 'order', params: { id: detail.order.id } }" class="mono">{{ detail.order.numero }}</RouterLink>
            ({{ detail.order.statutLabel.toLowerCase() }})
          </p>
        </div>
        <span class="pill" :class="statut.tone">{{ statut.label }}</span>
      </div>
    </div>

    <p v-if="notice" class="alert ok" role="status">{{ notice }}</p>
    <p v-if="actionError && !['date', 'mode', 'motif'].includes(actionError.field ?? '')" class="alert bad" role="alert">{{ actionError.msg }}</p>

    <section class="card block" aria-labelledby="suivi-title">
      <h2 id="suivi-title">Suivi</h2>
      <dl class="facts">
        <div>
          <dt>Émis le</dt>
          <dd>{{ dateTime(d.emisLe) }}<template v-if="d.createdByNom"> · {{ d.createdByNom }}</template></dd>
        </div>
        <div v-if="d.echeance">
          <dt>{{ isDevis ? 'Valable jusqu’au' : 'Échéance' }}</dt>
          <dd :class="{ late: d.statut === 'en_retard' || d.statut === 'expire' }">{{ formatDay(d.echeance) }}</dd>
        </div>
        <div v-if="d.envoyeLe">
          <dt>Envoyé le</dt>
          <dd>{{ dateTime(d.envoyeLe) }}</dd>
        </div>
        <div v-if="d.reponseLe">
          <dt>{{ d.reponse === 'accepte' ? 'Accepté le' : 'Refusé le' }}</dt>
          <dd>{{ dateTime(d.reponseLe) }}</dd>
        </div>
        <div v-if="d.payeLe">
          <dt>Payée le</dt>
          <dd>{{ formatDay(d.payeLe) }} · {{ modeLabel(d.modePaiement) }}</dd>
        </div>
        <div v-if="detail.lie">
          <dt>{{ isFacture ? 'Annulée par l’avoir' : 'Annule la facture' }}</dt>
          <dd>
            <RouterLink :to="{ name: 'billing-doc', params: { id: detail.lie.id } }" class="mono">{{ detail.lie.numero }}</RouterLink>
          </dd>
        </div>
      </dl>
      <p v-if="d.motif" class="motif"><b>Motif :</b> {{ d.motif }}</p>
      <p v-if="d.statut === 'accepte' && detail.order.statut === 'recue'" class="hint">
        Devis accepté : pensez à <RouterLink :to="{ name: 'order', params: { id: detail.order.id } }">valider la commande</RouterLink>.
      </p>
      <p v-if="d.statut === 'expire'" class="hint">Ce devis a expiré. Pour le proposer à nouveau, émettez un nouveau devis depuis la commande, aux tarifs actuels.</p>
      <p v-if="d.statut === 'annulee'" class="hint">Pour refacturer, émettez une nouvelle facture depuis la <RouterLink :to="{ name: 'order', params: { id: detail.order.id } }">commande</RouterLink>.</p>

      <!-- Enregistrer un paiement -->
      <form v-if="form === 'paiement'" class="inline-form" novalidate @submit.prevent="pay">
        <div class="field">
          <label for="pay-date">Date du paiement</label>
          <input id="pay-date" v-model="payDate" class="input" type="date" :max="todayParis()" required :aria-invalid="actionError?.field === 'date' || undefined" aria-describedby="pay-error" />
        </div>
        <div class="field">
          <label for="pay-mode">Mode</label>
          <select id="pay-mode" v-model="payMode" class="input" :aria-invalid="actionError?.field === 'mode' || undefined">
            <option v-for="m in MODES" :key="m.value" :value="m.value">{{ m.label }}</option>
          </select>
        </div>
        <p v-if="actionError && ['date', 'mode'].includes(actionError.field ?? '')" id="pay-error" class="field-error" role="alert">{{ actionError.msg }}</p>
        <div class="actions">
          <button class="btn primary" type="submit" :disabled="busy || !payDate">Enregistrer le paiement de {{ eur(d.ttc) }}</button>
          <button class="btn" type="button" @click="form = null">Retour</button>
        </div>
      </form>

      <!-- Faire un avoir -->
      <form v-else-if="form === 'avoir'" class="inline-form avoir" novalidate @submit.prevent="credit">
        <p class="warn-box">
          L’avoir annule <b>toute</b> la facture ({{ eur(d.ttc) }} TTC). Pour corriger une erreur, émettez ensuite une nouvelle facture depuis la commande.
          <template v-if="d.payeLe"> La facture est payée : pensez à rembourser le client.</template>
        </p>
        <div class="field">
          <label for="avoir-motif">Motif de l’avoir</label>
          <input id="avoir-motif" v-model="motif" class="input" maxlength="500" placeholder="Erreur de coloris, commande annulée…" :aria-invalid="actionError?.field === 'motif' || undefined" aria-describedby="avoir-error" />
          <p v-if="actionError?.field === 'motif'" id="avoir-error" class="field-error" role="alert">{{ actionError.msg }}</p>
        </div>
        <div class="actions">
          <button class="btn danger" type="submit" :disabled="busy || !motif.trim()">Émettre l’avoir</button>
          <button class="btn" type="button" @click="form = null">Retour</button>
        </div>
      </form>

      <div v-else class="actions">
        <a class="btn" :href="pdfUrl(d.id)" target="_blank" rel="noopener"><AppIcon name="download" :size="16" />Ouvrir le PDF</a>
        <button v-if="canSend" class="btn" type="button" :disabled="busy" @click="act('envoi', {}, isDevis ? 'Devis marqué comme envoyé.' : 'Facture marquée comme envoyée.')">
          <AppIcon name="mail" :size="16" />{{ sendLabel }}
        </button>
        <button v-if="canAccept" class="btn primary" type="button" :disabled="busy" @click="act('reponse', { reponse: 'accepte' }, 'Devis accepté.')"><AppIcon name="check" :size="16" />Accepté par le client</button>
        <button v-if="canAnswer" class="btn" type="button" :disabled="busy" @click="act('reponse', { reponse: 'refuse' }, 'Devis refusé.')">Refusé</button>
        <button v-if="canPay" class="btn primary" type="button" @click="openPay">Enregistrer le paiement</button>
        <button v-if="isFacture && d.payeLe" class="btn" type="button" :disabled="busy" @click="act('paiement', undefined, 'Paiement annulé.', 'DELETE')">Annuler le paiement</button>
        <button v-if="canCredit" class="btn danger-ghost" type="button" @click="openCredit">Faire un avoir</button>
      </div>
    </section>

    <div class="grid">
      <section class="card lines" aria-labelledby="lines-title">
        <h2 id="lines-title">Détail</h2>
        <div class="table-wrap">
          <table class="table fits-sm">
            <thead>
              <tr>
                <th>Désignation</th>
                <th class="n hide-sm">Qté</th>
                <th class="n hide-sm">PU HT</th>
                <th class="n">Total HT</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(l, i) in d.lignes" :key="i">
                <td>
                  <b>{{ l.designation }}</b>
                  <span v-if="l.detail" class="sub">{{ l.detail }}</span>
                  <span class="sub only-sm">{{ l.quantite.toLocaleString('fr-FR') }} × {{ eur(l.prixUnitaire) }}</span>
                </td>
                <td class="n hide-sm">{{ l.quantite.toLocaleString('fr-FR') }}</td>
                <td class="n nowrap hide-sm">{{ eur(l.prixUnitaire) }}</td>
                <td class="n nowrap">{{ eur(lineTotal(l)) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <div class="col">
        <section class="card block">
          <h2>Montant</h2>
          <dl class="totals">
            <dt>Total HT</dt>
            <dd>{{ eur(d.ht) }}</dd>
            <dt>TVA {{ d.tauxTva.toLocaleString('fr-FR') }} %</dt>
            <dd>{{ eur(d.tva) }}</dd>
            <dt class="big">Total TTC</dt>
            <dd class="big">{{ eur(d.ttc) }}</dd>
          </dl>
        </section>
        <section class="card block">
          <h2>Client</h2>
          <p class="address">
            <b>{{ d.clientNom }}</b><template v-if="d.clientAdresse"><br />{{ d.clientAdresse }}</template>
          </p>
          <p class="muted small">Tel qu’imprimé sur le document.</p>
        </section>
      </div>
    </div>
  </template>
</template>

<style scoped>
.head {
  display: grid;
  gap: 12px;
  margin-bottom: 16px;
}
.back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--muted);
  text-decoration: none;
  font-size: 0.88rem;
  width: fit-content;
}
.back:hover {
  color: var(--accent);
}
.identity {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}
.identity h1 {
  font-size: clamp(1.5rem, 3vw, 2rem);
}
.identity p {
  margin: 4px 0 0;
}
.identity a {
  color: inherit;
}
.block {
  padding: 18px 20px;
  display: grid;
  gap: 12px;
  margin-bottom: 16px;
}
.block p {
  margin: 0;
}
.facts {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 10px 16px;
  margin: 0;
}
.facts dt {
  font-size: 0.78rem;
  color: var(--muted);
}
.facts dd {
  margin: 2px 0 0;
  font-weight: 600;
}
.facts dd.late {
  color: var(--bad);
}
.hint {
  color: var(--muted);
}
.actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.btn.danger-ghost {
  color: var(--bad);
  margin-left: auto;
}
.inline-form {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 260px));
  gap: 10px 14px;
  align-items: end;
}
.inline-form .actions,
.inline-form .field-error,
.inline-form .warn-box {
  grid-column: 1 / -1;
}
.inline-form.avoir {
  grid-template-columns: minmax(0, 520px);
}
.warn-box {
  background: var(--warn-soft);
  color: var(--ink);
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 0.9rem;
}
.grid {
  display: grid;
  grid-template-columns: minmax(0, 1.8fr) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}
.col {
  display: grid;
  gap: 16px;
  min-width: 0;
}
.col .block {
  margin-bottom: 0;
}
.lines h2 {
  padding: 16px 20px 0;
  margin: 0 0 8px;
}
.lines .table .sub {
  font-weight: 400;
}
.nowrap {
  white-space: nowrap;
}
.only-sm {
  display: none !important;
}
@media (max-width: 640px) {
  .only-sm {
    display: block !important;
  }
}
.totals {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px 12px;
  margin: 0;
  font-size: 0.9rem;
}
.totals dt {
  color: var(--muted);
}
.totals dd {
  margin: 0;
  text-align: right;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.totals .big {
  color: var(--ink);
  font-weight: 750;
  font-size: 1.15rem;
  border-top: 1px solid var(--line);
  padding-top: 6px;
}
.address {
  white-space: pre-line;
}
.small {
  font-size: 0.8rem;
}
@media (max-width: 960px) {
  .grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (max-width: 640px) {
  .btn.danger-ghost {
    margin-left: 0;
  }
  .inline-form {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
