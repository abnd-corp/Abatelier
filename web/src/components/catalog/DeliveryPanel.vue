<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { api, ApiError } from '@/api'
import { eur, km, toMoneyField, type DeliveryEstimate, type DeliverySettings } from '@/lib/catalog'
import AppIcon from '@/components/AppIcon.vue'

// Les nombres sont édités comme du texte « à la française » (39,00) et envoyés tels quels : l'API les convertit
interface ZoneForm {
  distanceMax: string
  prix: string
  franco: string
}
interface Form {
  retraitActif: boolean
  retraitInfo: string
  atelierAdresse: string
  zones: ZoneForm[]
  longueurActif: boolean
  longueurSeuil: string
  longueurPrix: string
}

const original = ref<DeliverySettings | null>(null)
const form = reactive<Form>({ retraitActif: true, retraitInfo: '', atelierAdresse: '', zones: [], longueurActif: false, longueurSeuil: '', longueurPrix: '' })
const loadError = ref('')
const error = ref<{ field?: string; msg: string } | null>(null)
const notice = ref('')
const saving = ref(false)

function toForm(s: DeliverySettings): Form {
  return {
    retraitActif: s.retraitActif,
    retraitInfo: s.retraitInfo,
    atelierAdresse: s.atelierAdresse,
    zones: s.zones.map((z) => ({ distanceMax: String(z.distanceMax), prix: toMoneyField(z.prix), franco: z.franco === null ? '' : toMoneyField(z.franco) })),
    longueurActif: s.longueurSeuil !== null,
    // Valeurs proposées quand on active le supplément
    longueurSeuil: String(s.longueurSeuil ?? 2500),
    longueurPrix: s.longueurSeuil === null && !s.longueurPrix ? '20,00' : toMoneyField(s.longueurPrix),
  }
}
function fill(s: DeliverySettings) {
  original.value = s
  Object.assign(form, toForm(s))
}

onMounted(async () => {
  try {
    fill((await api<{ delivery: DeliverySettings }>('/catalog/delivery')).delivery)
  } catch (e) {
    loadError.value = e instanceof ApiError ? e.message : 'Chargement impossible.'
  }
})

// Comparaison avec les valeurs enregistrées. Le supplément désactivé ne compte pas ses champs.
const snapshot = (f: Form) => JSON.stringify({ ...f, longueurSeuil: f.longueurActif ? f.longueurSeuil : '', longueurPrix: f.longueurActif ? f.longueurPrix : '' })
const dirty = computed(() => !!original.value && snapshot(form) !== snapshot(toForm(original.value)))

onBeforeRouteLeave(() => (dirty.value ? window.confirm('Des réglages ne sont pas enregistrés. Quitter quand même ?') : true))
const beforeUnload = (e: BeforeUnloadEvent) => {
  if (dirty.value) e.preventDefault()
}
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))

async function save() {
  error.value = null
  notice.value = ''
  saving.value = true
  try {
    const body = {
      retraitActif: form.retraitActif,
      retraitInfo: form.retraitInfo,
      atelierAdresse: form.atelierAdresse,
      zones: form.zones.map((z) => ({ ...z })),
      longueurSeuil: form.longueurActif ? form.longueurSeuil : '',
      ...(form.longueurActif ? { longueurPrix: form.longueurPrix } : {}),
    }
    const { delivery } = await api<{ delivery: DeliverySettings }>('/catalog/delivery', { method: 'PATCH', body })
    fill(delivery)
    notice.value = 'Réglages de livraison enregistrés. Ils s’appliqueront aux prochains devis.'
  } catch (e) {
    error.value = e instanceof ApiError ? { msg: e.message, field: e.field } : { msg: 'L’enregistrement a échoué.' }
  } finally {
    saving.value = false
  }
}

function reset() {
  if (original.value) fill(original.value)
  error.value = null
}

function addZone() {
  const last = form.zones.at(-1)
  const d = last ? (Number(last.distanceMax) || 0) + 50 : 30
  const p = last ? (Number(last.prix.replace(',', '.')) || 0) + 30 : 39
  form.zones.push({ distanceMax: String(d), prix: toMoneyField(p), franco: '' })
}

const FIELDS = ['retraitActif', 'retraitInfo', 'atelierAdresse', 'zones', 'longueurSeuil', 'longueurPrix']
const err = (f: string) => (error.value?.field === f ? error.value.msg : '')

// --- Simulateur ---
const sim = reactive({ adresse: '', montant: '', longueurMax: '' })
const simResult = ref<DeliveryEstimate | null>(null)
const simError = ref<{ field?: string; msg: string } | null>(null)
const simLoading = ref(false)

async function estimate() {
  simError.value = null
  simResult.value = null
  simLoading.value = true
  try {
    simResult.value = await api<DeliveryEstimate>('/catalog/delivery/estimate', { method: 'POST', body: { ...sim } })
  } catch (e) {
    simError.value = e instanceof ApiError ? { msg: e.message, field: e.field } : { msg: 'Le calcul a échoué.' }
  } finally {
    simLoading.value = false
  }
}
const simErr = (f: string) => (simError.value?.field === f ? simError.value.msg : '')
const lastZone = computed(() => original.value?.zones.at(-1)?.distanceMax)
</script>

<template>
  <div class="delivery">
    <form class="settings" novalidate aria-label="Réglages de livraison" @submit.prevent="save">
      <p v-if="loadError" class="alert bad" role="alert">{{ loadError }}</p>
      <p v-if="notice" class="alert ok" role="status">{{ notice }}</p>
      <p v-if="error && !FIELDS.includes(error.field ?? '')" class="alert bad" role="alert">{{ error.msg }}</p>

      <div v-if="original" class="groups">
        <fieldset class="card group">
          <legend>Retrait à l’atelier</legend>
          <label class="check">
            <input id="d-retrait" v-model="form.retraitActif" type="checkbox" />
            Proposer le retrait à l’atelier (gratuit)
          </label>
          <div v-if="form.retraitActif" class="field">
            <label for="d-retrait-info">Horaires et consignes de retrait</label>
            <textarea id="d-retrait-info" v-model="form.retraitInfo" class="input" rows="3" maxlength="300" :aria-invalid="!!err('retraitInfo') || undefined" />
            <span v-if="err('retraitInfo')" class="field-error">{{ err('retraitInfo') }}</span>
            <span class="hint muted">Affiché au client quand il choisit le retrait.</span>
          </div>
          <p v-else class="hint muted">Les clients devront se faire livrer.</p>
        </fieldset>

        <fieldset class="card group">
          <legend>Point de départ</legend>
          <div class="field">
            <label for="d-adresse">Adresse de l’atelier</label>
            <input id="d-adresse" v-model="form.atelierAdresse" class="input" autocomplete="street-address" :aria-invalid="!!err('atelierAdresse') || undefined" />
            <span v-if="err('atelierAdresse')" class="field-error">{{ err('atelierAdresse') }}</span>
            <span class="hint muted">
              <template v-if="original.atelierLabel"><AppIcon name="map-pin" :size="13" class="inline" />Localisée : {{ original.atelierLabel }}</template>
              <template v-else>Elle sera localisée au premier calcul de distance.</template>
            </span>
          </div>
          <p class="hint muted">Les distances sont calculées par la route depuis cette adresse, avec les services gratuits de l’IGN.</p>
        </fieldset>

        <fieldset class="card group tiers-group">
          <legend>Zones de livraison</legend>
          <p class="hint muted">De la plus proche à la plus lointaine. Au-delà de la dernière zone, pas de livraison. Laissez « offerte dès » vide pour ne jamais l’offrir.</p>
          <div v-if="form.zones.length" class="zones">
            <div class="zones-head" aria-hidden="true">
              <span>Jusqu’à</span>
              <span>Prix</span>
              <span>Offerte dès</span>
            </div>
            <ol>
              <li v-for="(z, i) in form.zones" :key="i">
                <span class="cell km">
                  <span class="cap" aria-hidden="true">Jusqu’à</span>
                  <span class="unit"><input :id="`d-km-${i}`" v-model="z.distanceMax" class="input mono" inputmode="numeric" :aria-label="`Zone ${i + 1} : distance maximum`" /><span>km</span></span>
                </span>
                <span class="cell prix">
                  <span class="cap" aria-hidden="true">Prix</span>
                  <span class="unit"><input :id="`d-prix-${i}`" v-model="z.prix" class="input mono" inputmode="decimal" :aria-label="`Zone ${i + 1} : prix`" /><span>€ HT</span></span>
                </span>
                <span class="cell franco">
                  <span class="cap" aria-hidden="true">Offerte dès</span>
                  <span class="unit"
                    ><input :id="`d-franco-${i}`" v-model="z.franco" class="input mono" inputmode="decimal" placeholder="jamais" :aria-label="`Zone ${i + 1} : livraison offerte dès`" /><span
                      >€ HT</span
                    ></span
                  >
                </span>
                <button class="btn small icon del" type="button" :aria-label="`Supprimer la zone ${i + 1}`" @click="form.zones.splice(i, 1)">
                  <AppIcon name="trash" :size="15" />
                </button>
              </li>
            </ol>
          </div>
          <p v-else class="muted">Aucune zone : seul le retrait à l’atelier est proposé.</p>
          <span v-if="err('zones')" class="field-error" role="alert">{{ err('zones') }}</span>
          <div>
            <button class="btn small" type="button" :disabled="form.zones.length >= 8" @click="addZone"><AppIcon name="plus" :size="15" />Ajouter une zone</button>
          </div>
        </fieldset>

        <fieldset class="card group">
          <legend>Pièces longues</legend>
          <label class="check">
            <input id="d-longueur" v-model="form.longueurActif" type="checkbox" />
            Supplément de livraison pour les pièces longues
          </label>
          <div v-if="form.longueurActif" class="row">
            <div class="field">
              <label for="d-seuil">Au-delà de</label>
              <span class="unit"><input id="d-seuil" v-model="form.longueurSeuil" class="input mono" inputmode="numeric" :aria-invalid="!!err('longueurSeuil') || undefined" /><span>mm</span></span>
              <span v-if="err('longueurSeuil')" class="field-error">{{ err('longueurSeuil') }}</span>
            </div>
            <div class="field">
              <label for="d-supplement">Supplément</label>
              <span class="unit"
                ><input id="d-supplement" v-model="form.longueurPrix" class="input mono" inputmode="decimal" :aria-invalid="!!err('longueurPrix') || undefined" /><span>€ HT</span></span
              >
              <span v-if="err('longueurPrix')" class="field-error">{{ err('longueurPrix') }}</span>
            </div>
          </div>
          <p class="hint muted">Ajouté une fois par livraison si une pièce dépasse la longueur, même quand la livraison est offerte (camion adapté).</p>
        </fieldset>
      </div>

      <div v-if="original" class="savebar">
        <span class="muted state" aria-live="polite">{{ dirty ? 'Modifications non enregistrées' : 'À jour' }}</span>
        <button class="btn" type="button" :disabled="!dirty || saving" @click="reset">Annuler les modifications</button>
        <button class="btn primary" type="submit" :disabled="!dirty || saving">{{ saving ? 'Enregistrement…' : 'Enregistrer' }}</button>
      </div>
    </form>

    <form v-if="original" class="card sim settings" novalidate aria-label="Tester une adresse" @submit.prevent="estimate">
      <h3>Tester une adresse</h3>
      <p class="hint muted">
        Calcule la distance depuis l’atelier et le prix de livraison, avec les réglages enregistrés. Le montant et la longueur sont facultatifs : ils servent à la livraison offerte et au supplément
        pièces longues.
      </p>
      <div class="sim-fields">
        <div class="field grow">
          <label for="sim-adresse">Adresse du chantier</label>
          <input id="sim-adresse" v-model="sim.adresse" class="input" placeholder="12 rue de la Paix, 42000 Saint-Étienne" :aria-invalid="!!simErr('adresse') || undefined" />
          <span v-if="simErr('adresse')" class="field-error">{{ simErr('adresse') }}</span>
        </div>
        <div class="field">
          <label for="sim-montant">Montant commande</label>
          <span class="unit"><input id="sim-montant" v-model="sim.montant" class="input mono" inputmode="decimal" :aria-invalid="!!simErr('montant') || undefined" /><span>€ HT</span></span>
          <span v-if="simErr('montant')" class="field-error">{{ simErr('montant') }}</span>
        </div>
        <div class="field">
          <label for="sim-longueur">Pièce la plus longue</label>
          <span class="unit"><input id="sim-longueur" v-model="sim.longueurMax" class="input mono" inputmode="numeric" :aria-invalid="!!simErr('longueurMax') || undefined" /><span>mm</span></span>
          <span v-if="simErr('longueurMax')" class="field-error">{{ simErr('longueurMax') }}</span>
        </div>
      </div>
      <div>
        <button class="btn primary" type="submit" :disabled="simLoading"><AppIcon name="map-pin" />{{ simLoading ? 'Calcul…' : 'Calculer' }}</button>
      </div>
      <p v-if="simError && !['adresse', 'montant', 'longueurMax'].includes(simError.field ?? '')" class="alert bad" role="alert">{{ simError.msg }}</p>

      <div v-if="simResult" class="result" role="status">
        <p class="where">
          <b>{{ simResult.adresse }}</b>
          <span class="muted">· {{ km(simResult.distanceKm) }} {{ simResult.methode === 'route' ? 'par la route' : 'environ (estimation à vol d’oiseau)' }}</span>
        </p>
        <template v-if="simResult.zone">
          <p>
            Zone jusqu’à {{ simResult.zone.distanceMax }} km : <span class="mono">{{ eur(simResult.zone.prix) }}</span> HT
          </p>
          <p v-if="simResult.offerte">Livraison offerte : la commande atteint {{ eur(simResult.zone.franco ?? 0) }} HT.</p>
          <p v-if="simResult.supplement">
            Supplément pièces longues : <span class="mono">+{{ eur(simResult.supplement) }}</span> HT
          </p>
          <p class="total">
            Livraison : <span class="mono">{{ eur(simResult.total ?? 0) }}</span> HT
          </p>
        </template>
        <p v-else class="total out">Hors zone : pas de livraison au-delà de {{ lastZone ?? 0 }} km.</p>
        <p class="muted">{{ simResult.retrait.actif ? 'Retrait à l’atelier possible, gratuit.' : 'Retrait à l’atelier désactivé.' }}</p>
      </div>
    </form>
  </div>
</template>

<style>
@import './settings.css';
</style>

<style scoped>
.delivery {
  display: grid;
  gap: 18px;
}
.check {
  display: flex;
  gap: 8px;
  align-items: center;
  font-weight: 600;
  font-size: 0.92rem;
}
.check input {
  accent-color: var(--accent);
  width: 18px;
  height: 18px;
}
textarea.input {
  resize: vertical;
  min-height: 70px;
  font: inherit;
}
.inline {
  display: inline-block;
  vertical-align: -2px;
  margin-right: 4px;
}
.zones {
  container-type: inline-size;
}
.zones ol {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}
.zones-head,
.zones li {
  display: grid;
  grid-template-columns: minmax(84px, 0.8fr) minmax(112px, 1fr) minmax(112px, 1fr) 34px;
  gap: 8px;
  align-items: center;
}
.zones-head {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--muted);
  margin-bottom: 4px;
}
.cell {
  display: grid;
  gap: 4px;
  min-width: 0;
}
.cap {
  display: none;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--muted);
}
/* Carte étroite (téléphone, tablette) : distance et prix sur une ligne, « offerte dès » en dessous,
   chaque champ avec son libellé */
@container (max-width: 470px) {
  .zones-head {
    display: none;
  }
  .zones ol {
    gap: 14px;
  }
  .zones li {
    grid-template-columns: 1fr 1fr 34px;
    grid-template-areas: 'km prix del' 'franco franco .';
    padding-bottom: 12px;
    border-bottom: 1px solid var(--line);
  }
  .zones li:last-child {
    border-bottom: 0;
    padding-bottom: 0;
  }
  .cap {
    display: block;
  }
  .km {
    grid-area: km;
  }
  .prix {
    grid-area: prix;
  }
  .franco {
    grid-area: franco;
  }
  .del {
    grid-area: del;
    align-self: end;
    margin-bottom: 4px;
  }
}
.sim {
  padding: 18px 20px;
  gap: 12px;
}
.sim h3 {
  font-size: 1.05rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.sim-fields {
  display: grid;
  grid-template-columns: minmax(0, 2fr) repeat(2, minmax(150px, 1fr));
  gap: 14px;
  align-items: start;
}
.result {
  border-top: 1px solid var(--line);
  padding-top: 12px;
  display: grid;
  gap: 4px;
  font-size: 0.92rem;
}
.result p {
  margin: 0;
}
.where b {
  margin-right: 4px;
}
.total {
  font-weight: 700;
  font-size: 1.02rem;
  margin-top: 4px !important;
}
.out {
  color: var(--bad);
}
@media (max-width: 720px) {
  .sim-fields {
    grid-template-columns: 1fr;
  }
}
@media (pointer: coarse) {
  .check input {
    width: 22px;
    height: 22px;
  }
}
</style>
