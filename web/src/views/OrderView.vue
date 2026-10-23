<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, ApiError } from '@/api'
import { eur } from '@/lib/catalog'
import { dateTime } from '@/lib/format'
import { formatDay } from '@/lib/employees'
import type { Client, ClientSite } from '@/lib/clients'
import { PRODUCTION_STATUTS, sheetUrl, shortDay, statutOf, STATUTS, STEP_ACTIONS, toLineForm, type OrderCatalog, type OrderDetail, type OrderForm, type OrderStatut } from '@/lib/orders'
import { DEVIS_STATUTS, FACTURE_STATUTS, statutOf as billingStatut, typeOf, type BillingSummary } from '@/lib/billing'
import { useUiStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'
import AppIcon from '@/components/AppIcon.vue'
import OrderLineCard from '@/components/orders/OrderLineCard.vue'
import OrderEditor from '@/components/orders/OrderEditor.vue'

const route = useRoute()
const router = useRouter()
const ui = useUiStore()
const auth = useAuthStore()
const id = computed(() => route.params.id as string)

const detail = ref<OrderDetail | null>(null)
const loadError = ref('')
const notice = ref('')
const actionError = ref<{ field?: string; msg: string } | null>(null)
const busy = ref(false)

async function load() {
  try {
    detail.value = await api<OrderDetail>(`/orders/${id.value}`)
    ui.crumb = { for: route.fullPath, label: detail.value.order.numero }
    document.title = `${detail.value.order.numero} · Commandes · Atelier · Alu Pliage Service`
  } catch (e) {
    loadError.value = e instanceof ApiError ? e.message : 'Chargement impossible.'
  }
  await loadDocuments()
}

// --- Devis et factures de la commande (direction) ---
const documents = ref<BillingSummary[]>([])
async function loadDocuments() {
  if (!auth.can('billing.manage')) return
  try {
    documents.value = (await api<{ documents: BillingSummary[] }>(`/billing?orderId=${id.value}`)).documents
  } catch {
    documents.value = []
  }
}
const invoiced = computed(() => documents.value.some((d) => d.type === 'facture' && d.statut !== 'annulee'))
const canQuote = computed(() => !!o.value && o.value.kind !== 'boutique' && DEVIS_STATUTS.includes(o.value.statut))
const canInvoice = computed(() => !!o.value && FACTURE_STATUTS.includes(o.value.statut) && !invoiced.value)
async function issue(type: 'devis' | 'facture') {
  actionError.value = null
  notice.value = ''
  busy.value = true
  try {
    const res = await api<{ id: string }>(`/billing/orders/${id.value}/${type}`, { method: 'POST' })
    await router.push({ name: 'billing-doc', params: { id: res.id } })
  } catch (e) {
    actionError.value = e instanceof ApiError ? { msg: e.message, field: e.field } : { msg: 'L’émission a échoué.' }
  } finally {
    busy.value = false
  }
}
onMounted(load)
watch(id, () => {
  editing.value = false
  load()
})

const o = computed(() => detail.value?.order)
// Frise des étapes, avec la date de chacune
const PATH: OrderStatut[] = ['recue', 'validee', 'fabrication', 'prete', 'livree']
const steps = computed(() => {
  const events = detail.value?.events ?? []
  const current = o.value ? PATH.indexOf(o.value.statut) : -1
  return PATH.map((s, i) => {
    const e = [...events].reverse().find((x) => x.statut === s)
    return { s, label: statutOf(s).label, at: e?.at ?? null, nom: e?.nom ?? null, done: current >= i, current: current === i }
  })
})
const cancelled = computed(() => detail.value?.events.find((e) => e.statut === 'annulee') ?? null)
const forward = computed(() => o.value?.next.filter((s) => s !== 'annulee') ?? [])
const boutique = computed(() => o.value?.kind === 'boutique')
// Une commande payée en ligne ne s'annule pas : elle se refuse, ce qui rembourse le client
const paidOnline = computed(() => detail.value?.paiement?.statut === 'paye')
const canCancel = computed(() => !!o.value?.next.includes('annulee') && !paidOnline.value)
const canRefuse = computed(() => paidOnline.value && !!o.value?.next.includes('annulee'))

// --- Étapes ---
const cancelling = ref(false)
const reason = ref('')
async function step(statut: OrderStatut, note?: string) {
  actionError.value = null
  notice.value = ''
  busy.value = true
  try {
    await api(`/orders/${id.value}/status`, { method: 'POST', body: { statut, note } })
    notice.value = statut === 'annulee' ? 'Commande annulée.' : `Commande passée à l’étape « ${statutOf(statut).label} ».`
    cancelling.value = false
    reason.value = ''
    await load()
  } catch (e) {
    actionError.value = e instanceof ApiError ? { msg: e.message, field: e.field } : { msg: 'L’action a échoué.' }
  } finally {
    busy.value = false
  }
}

// --- Refus d'une commande payée en ligne : remboursement intégral ---
const refusing = ref(false)
const motif = ref('')
async function refuse() {
  actionError.value = null
  notice.value = ''
  busy.value = true
  try {
    const res = await api<{ rembourse: number; avoir: string | null }>(`/orders/${id.value}/refus`, { method: 'POST', body: { motif: motif.value } })
    notice.value = `Commande refusée : ${eur(res.rembourse)} remboursés au client${res.avoir ? `, facture annulée par l’avoir ${res.avoir}` : ''}. Le client est prévenu par e-mail avec votre motif.`
    refusing.value = false
    motif.value = ''
    await load()
  } catch (e) {
    actionError.value = e instanceof ApiError ? { msg: e.message, field: e.field } : { msg: 'Le refus a échoué.' }
  } finally {
    busy.value = false
  }
}

// --- Modification des pièces (avant validation) ---
const editing = ref(false)
const catalog = ref<OrderCatalog | null>(null)
const form = ref<OrderForm | null>(null)
const addresses = ref<{ label: string; adresse: string; codePostal: string; ville: string }[]>([])
const editError = ref<{ field?: string; msg: string } | null>(null)
const priced = ref(false)

async function startEdit() {
  const d = detail.value!
  editError.value = null
  try {
    const [c, cl] = await Promise.all([api<OrderCatalog>('/orders/catalog'), api<{ client: Client; sites: ClientSite[] }>(`/clients/${d.order.clientId}`)])
    catalog.value = c
    const list = cl.sites.map((s) => ({ label: s.libelle, adresse: s.adresse, codePostal: s.codePostal, ville: s.ville }))
    if (cl.client.adresse && cl.client.codePostal && cl.client.ville) list.unshift({ label: 'Facturation', adresse: cl.client.adresse, codePostal: cl.client.codePostal, ville: cl.client.ville })
    addresses.value = list
  } catch (e) {
    return void (actionError.value = { msg: e instanceof ApiError ? e.message : 'Chargement impossible.' })
  }
  form.value = {
    clientId: d.order.clientId,
    lignes: d.lignes.map(toLineForm),
    livraison:
      d.order.livraisonMode === 'retrait'
        ? { mode: 'retrait' }
        : { mode: 'livraison', adresse: d.order.livraisonAdresse ?? '', codePostal: d.order.livraisonCodePostal ?? '', ville: d.order.livraisonVille ?? '' },
    notes: d.order.notes ?? '',
  }
  notice.value = ''
  editing.value = true
}

async function saveEdit() {
  if (!form.value) return
  editError.value = null
  busy.value = true
  try {
    const { clientId: _c, ...body } = form.value
    await api(`/orders/${id.value}`, { method: 'PATCH', body })
    editing.value = false
    notice.value = 'Commande modifiée.'
    await load()
  } catch (e) {
    editError.value = e instanceof ApiError ? { msg: e.message, field: e.field } : { msg: 'L’enregistrement a échoué.' }
  } finally {
    busy.value = false
  }
}

const tone = (s: OrderStatut) => STATUTS.find((x) => x.value === s)!.tone
</script>

<template>
  <p v-if="loadError" class="alert bad" role="alert">{{ loadError }}</p>

  <template v-if="detail && o">
    <div class="head">
      <RouterLink :to="{ name: 'orders' }" class="back"><AppIcon name="arrow-left" :size="16" />Commandes</RouterLink>
      <div class="identity">
        <div>
          <h1 class="mono">{{ o.numero }}</h1>
          <p class="muted">
            <RouterLink :to="{ name: 'client', params: { id: detail.client.id } }">{{ detail.client.nom }}</RouterLink>
            <template v-if="detail.client.type === 'professionnel'"> (pro)</template> · reçue le {{ formatDay(o.createdAt.slice(0, 10)) }}
          </p>
        </div>
        <span class="pill" :class="tone(o.statut)">{{ o.statutLabel }}</span>
        <span v-if="boutique" class="pill accent">Boutique</span>
      </div>
    </div>

    <p v-if="notice" class="alert ok" role="status">{{ notice }}</p>
    <p v-if="actionError" class="alert bad" role="alert">{{ actionError.msg }}</p>

    <form v-if="editing && form && catalog" novalidate @submit.prevent="saveEdit">
      <OrderEditor v-model="form" :catalog="catalog" :addresses="addresses" :error="editError" @priced="priced = $event">
        <button class="btn primary" type="submit" :disabled="busy || !priced">{{ busy ? 'Enregistrement…' : 'Enregistrer les modifications' }}</button>
        <button class="btn" type="button" @click="editing = false">Annuler</button>
      </OrderEditor>
    </form>

    <template v-else>
      <section class="card block" aria-labelledby="steps-title">
        <h2 id="steps-title">Suivi</h2>
        <ol class="steps" :class="{ cancelled: o.statut === 'annulee' }">
          <li v-for="s in steps" :key="s.s" :class="{ done: s.done, current: s.current }">
            <span class="dot" aria-hidden="true"><AppIcon v-if="s.done" name="check" :size="13" /></span>
            <span class="step-label">{{ s.label }}</span>
            <span v-if="s.at" class="sub" :title="dateTime(s.at)"
              >{{ dateTime(s.at) }}<template v-if="s.nom"> · {{ s.nom }}</template></span
            >
          </li>
        </ol>
        <p v-if="cancelled" class="alert bad">
          Annulée le {{ dateTime(cancelled.at) }}<template v-if="cancelled.nom"> par {{ cancelled.nom }}</template> : {{ cancelled.note }}
        </p>
        <p v-if="o.datePrevue" class="muted">
          Prévue le <b>{{ shortDay(o.datePrevue) }}</b> ({{ o.delaiJours }} jours ouvrés après validation).
        </p>
        <p v-else-if="o.statut === 'recue'" class="muted">Délai : {{ o.delaiJours }} jours ouvrés à partir de la validation.</p>

        <div v-if="refusing" class="cancel">
          <p class="muted">
            La commande a été payée en ligne : elle vaut contrat. Si vous ne pouvez pas la réaliser, le client est <b>remboursé en totalité</b> ({{ eur(detail.paiement?.montantTtc ?? 0) }} TTC) et
            reçoit votre motif par e-mail.
          </p>
          <div class="field">
            <label for="refus-motif">Motif du refus (transmis au client)</label>
            <textarea
              id="refus-motif"
              v-model="motif"
              class="input"
              rows="3"
              maxlength="500"
              placeholder="Longueur impossible à plier sur notre machine, matière indisponible…"
              :aria-invalid="actionError?.field === 'motif' || undefined"
            />
          </div>
          <div class="actions">
            <button class="btn danger" type="button" :disabled="busy || !motif.trim()" @click="refuse">Refuser et rembourser {{ eur(detail.paiement?.montantTtc ?? 0) }}</button>
            <button class="btn" type="button" @click="refusing = false">Retour</button>
          </div>
        </div>
        <div v-else-if="cancelling" class="cancel">
          <div class="field">
            <label for="cancel-reason">Raison de l’annulation</label>
            <input id="cancel-reason" v-model="reason" class="input" maxlength="500" placeholder="Client injoignable, doublon…" :aria-invalid="actionError?.field === 'note' || undefined" />
          </div>
          <div class="actions">
            <button class="btn danger" type="button" :disabled="busy || !reason.trim()" @click="step('annulee', reason)">Confirmer l’annulation</button>
            <button class="btn" type="button" @click="cancelling = false">Retour</button>
          </div>
        </div>
        <div v-else-if="forward.length || canCancel || canRefuse || o.statut === 'recue'" class="actions">
          <button v-for="s in forward" :key="s" class="btn primary" type="button" :disabled="busy" @click="step(s)">{{ STEP_ACTIONS[s] }}</button>
          <a v-if="PRODUCTION_STATUTS.includes(o.statut)" class="btn" :href="sheetUrl(o.id)" target="_blank" rel="noopener"><AppIcon name="printer" :size="16" />Fiche de fabrication</a>
          <button v-if="o.statut === 'recue' && !boutique" class="btn" type="button" @click="startEdit"><AppIcon name="pencil" :size="16" />Modifier les pièces</button>
          <button v-if="canCancel" class="btn danger-ghost" type="button" @click="cancelling = true">Annuler la commande</button>
          <button v-if="canRefuse" class="btn danger-ghost" type="button" @click="refusing = true">Refuser et rembourser</button>
        </div>
      </section>

      <div class="grid">
        <div class="col">
          <h2 class="section-title">{{ boutique ? 'Articles' : 'Pièces' }}</h2>
          <OrderLineCard v-for="(l, i) in detail.lignes" :key="l.id" :index="i" :line="l" prices />
        </div>
        <div class="col">
          <section class="card block">
            <h2>Montant</h2>
            <dl class="totals">
              <dt>Pièces et accessoires</dt>
              <dd>{{ eur(o.brut) }}</dd>
              <template v-if="o.remisePro">
                <dt>Remise pro</dt>
                <dd>− {{ eur(o.remisePro) }}</dd>
              </template>
              <template v-if="o.complementMinimum">
                <dt>Complément minimum</dt>
                <dd>{{ eur(o.complementMinimum) }}</dd>
              </template>
              <dt>{{ o.livraisonMode === 'retrait' ? 'Retrait à l’atelier' : 'Livraison' }}</dt>
              <dd>{{ o.livraisonMode === 'retrait' ? 'gratuit' : o.livraisonPrix ? eur(o.livraisonPrix) : 'offerte' }}</dd>
              <dt class="strong">Total HT</dt>
              <dd class="strong">{{ eur(o.ht) }}</dd>
              <dt>TVA {{ o.tauxTva.toLocaleString('fr-FR') }} %</dt>
              <dd>{{ eur(o.tva) }}</dd>
              <dt class="big">Total TTC</dt>
              <dd class="big">{{ eur(o.ttc) }}</dd>
            </dl>
          </section>
          <section v-if="detail.paiement" class="card block" aria-labelledby="pay-title">
            <h2 id="pay-title">Paiement en ligne</h2>
            <p>
              <span class="pill" :class="detail.paiement.statut === 'paye' ? 'ok' : detail.paiement.statut === 'rembourse' ? 'neutral' : 'warn'">{{
                { paye: 'Payé', rembourse: 'Remboursé', attente: 'En attente', echec: 'Échoué' }[detail.paiement.statut]
              }}</span>
              <b class="pay-amount">{{ eur(detail.paiement.montantTtc) }} TTC</b>
            </p>
            <p v-if="detail.paiement.paidAt" class="muted">Payé par carte le {{ dateTime(detail.paiement.paidAt) }}.</p>
            <p v-if="detail.paiement.refundedAt" class="muted">Remboursé en totalité le {{ dateTime(detail.paiement.refundedAt) }} : {{ detail.paiement.refundMotif }}</p>
          </section>
          <section v-if="auth.can('billing.manage')" class="card block" aria-labelledby="billing-title">
            <h2 id="billing-title">Devis et factures</h2>
            <ul v-if="documents.length" class="docs">
              <li v-for="d in documents" :key="d.id">
                <RouterLink :to="{ name: 'billing-doc', params: { id: d.id } }" class="mono">{{ d.numero }}</RouterLink>
                <span class="muted">{{ typeOf(d.type).one }}</span>
                <span class="pill" :class="billingStatut(d.type, d.statut).tone">{{ billingStatut(d.type, d.statut).label }}</span>
                <span class="doc-ttc">{{ eur(d.ttc) }}</span>
              </li>
            </ul>
            <p v-else class="muted">Aucun devis ni facture pour cette commande.</p>
            <p v-if="canInvoice && detail?.facturx?.manque.length" class="warn-box" role="status">
              Facture électronique : il manque <b>{{ detail.facturx?.manque.join(', ') }}</b
              >. La facture peut être émise, mais elle ne sera pas conforme tant que ce n’est pas complété (non modifiable après émission : complétez avant).
            </p>
            <div v-if="canQuote || canInvoice" class="actions">
              <button v-if="canQuote" class="btn" type="button" :disabled="busy" @click="issue('devis')"><AppIcon name="receipt" :size="16" />Faire un devis</button>
              <button v-if="canInvoice" class="btn primary" type="button" :disabled="busy" @click="issue('facture')"><AppIcon name="receipt" :size="16" />Facturer</button>
            </div>
            <p v-if="o.statut === 'recue'" class="muted small">La facture se fait une fois la commande validée.</p>
          </section>
          <section class="card block">
            <h2>{{ o.livraisonMode === 'retrait' ? 'Retrait' : 'Livraison' }}</h2>
            <p v-if="o.livraisonMode === 'retrait'">Le client vient chercher sa commande à l’atelier.</p>
            <p v-else>
              {{ o.livraisonAdresse }}<br />{{ o.livraisonCodePostal }} {{ o.livraisonVille }}
              <span v-if="o.distanceKm !== null" class="sub">À {{ o.distanceKm.toLocaleString('fr-FR') }} km de l’atelier</span>
            </p>
            <p v-if="detail.client.telephone" class="muted">
              Contact : <a :href="`tel:${detail.client.telephone.replace(/[^+\d]/g, '')}`" class="mono">{{ detail.client.telephone }}</a>
            </p>
          </section>
          <section v-if="o.notes" class="card block">
            <h2>Notes internes</h2>
            <p class="notes">{{ o.notes }}</p>
          </section>
        </div>
      </div>
    </template>
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
.steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
}
.steps li {
  display: grid;
  gap: 4px;
  justify-items: start;
  position: relative;
  padding-top: 4px;
  color: var(--muted);
  font-size: 0.86rem;
}
.steps .dot {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid var(--line);
  display: grid;
  place-items: center;
  background: var(--surface);
}
.steps li.done {
  color: var(--ink);
}
.steps li.done .dot {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--surface);
}
.steps li.current .step-label {
  font-weight: 700;
}
.steps.cancelled li {
  opacity: 0.6;
}
.sub {
  display: block;
  font-size: 0.76rem;
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
.cancel {
  display: grid;
  gap: 10px;
  max-width: 520px;
}
.grid {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}
.col {
  display: grid;
  gap: 12px;
  min-width: 0;
}
.section-title {
  margin: 0;
  font-size: 1rem;
}
.col .block {
  margin-bottom: 0;
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
.totals .strong {
  color: var(--ink);
  font-weight: 650;
  border-top: 1px solid var(--line);
  padding-top: 6px;
}
.totals .big {
  color: var(--ink);
  font-weight: 750;
  font-size: 1.15rem;
}
.notes {
  white-space: pre-wrap;
}
.docs {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}
.docs li {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 0.9rem;
}
.doc-ttc {
  margin-left: auto;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
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
  .steps {
    grid-template-columns: minmax(0, 1fr);
  }
  .steps li {
    grid-template-columns: 22px minmax(0, 1fr);
    column-gap: 10px;
    align-items: center;
  }
  .steps .sub {
    grid-column: 2;
  }
  .btn.danger-ghost {
    margin-left: 0;
  }
}
.warn-box {
  background: var(--warn-soft);
  color: var(--ink);
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 0.9rem;
}
.pay-amount {
  margin-left: 10px;
}
</style>
