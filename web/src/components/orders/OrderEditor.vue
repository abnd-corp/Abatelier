<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { api, ApiError } from '@/api'
import { eur } from '@/lib/catalog'
import { metres, standardsOf } from '@/lib/standards'
import { accessoriesFor, developpe, isPince, letter, modelOf, PINCE, newLine, suggestedQuantity, type LineForm, type OrderCatalog, type OrderForm, type PricedLine, type Totals } from '@/lib/orders'
import AppIcon from '@/components/AppIcon.vue'
import ProfileSketch from './ProfileSketch.vue'

// three.js n'est chargé que si l'on ouvre la vue 3D
const Profile3D = defineAsyncComponent(() => import('./Profile3D.vue'))

// Saisie des pièces et de la livraison, avec le prix recalculé par l'API à chaque changement.
const props = defineProps<{
  catalog: OrderCatalog
  // Adresses proposées pour la livraison : facturation du client et chantiers
  addresses: { label: string; adresse: string; codePostal: string; ville: string }[]
  // Erreur renvoyée à l'enregistrement
  error?: { field?: string; msg: string } | null
  // Chiffrage en direct : celui de l'atelier par défaut, celui du configurateur sur le site public
  quoteUrl?: string
  // Site public : pas de notes internes
  visitor?: boolean
}>()
const form = defineModel<OrderForm>({ required: true })
const emit = defineEmits<{ priced: [ok: boolean] }>()

const quote = ref<{ lignes: PricedLine[]; totals: Totals; distanceKm: number | null } | null>(null)
const quoteError = ref<{ field?: string; msg: string } | null>(null)
const pricing = ref(false)

// Erreur affichée : celle de l'enregistrement, sinon celle du chiffrage en direct
const shown = computed(() => props.error ?? quoteError.value)
const err = (field: string) => (shown.value?.field === field ? shown.value.msg : '')
const lineErr = (i: number) => (shown.value?.field?.startsWith(`lignes.${i}.`) ? shown.value.msg : '')
const bad = (field: string) => shown.value?.field === field || undefined

let timer: ReturnType<typeof setTimeout> | undefined
let seq = 0
async function refresh() {
  const mine = ++seq
  pricing.value = true
  try {
    const res = await api<{ lignes: PricedLine[]; totals: Totals; distanceKm: number | null }>(props.quoteUrl ?? '/orders/quote', { method: 'POST', body: form.value })
    if (mine !== seq) return
    quote.value = res
    quoteError.value = null
    emit('priced', true)
  } catch (e) {
    if (mine !== seq) return
    quoteError.value = e instanceof ApiError ? { msg: e.message, field: e.field } : { msg: 'Chiffrage impossible.' }
    emit('priced', false)
  } finally {
    if (mine === seq) pricing.value = false
  }
}
watch(
  form,
  () => {
    clearTimeout(timer)
    timer = setTimeout(refresh, 350)
  },
  { deep: true, immediate: true },
)
onBeforeUnmount(() => clearTimeout(timer))

// --- Pièces ---
function setModele(l: LineForm, modelId: string) {
  const fresh = newLine(props.catalog, modelId, l)
  Object.assign(l, { modelId, cotes: fresh.cotes, angles: fresh.angles, accessoires: fresh.accessoires })
}
// Orientation du dessin et noms des cotes du modèle (un modèle désactivé depuis : dessin à plat, cotes sans nom)
const capOf = (l: LineForm) => modelOf(props.catalog, l.modelId)?.cap ?? 0
const standardOf = (l: LineForm) => standardsOf(modelOf(props.catalog, l.modelId)?.nom)
const coteName = (l: LineForm, j: number) => modelOf(props.catalog, l.modelId)?.noms[j] ?? ''
function setQuantite(l: LineForm, value: string) {
  const before = l.quantite
  l.quantite = Number(value) || 0
  // Les accessoires que l'on n'a pas retouchés suivent la quantité de pièces
  for (const a of l.accessoires) {
    const acc = props.catalog.accessories.find((x) => x.id === a.accessoryId)
    if (acc && a.quantite === suggestedQuantity(acc, before)) a.quantite = suggestedQuantity(acc, l.quantite)
  }
}
function addPli(l: LineForm) {
  l.angles.push(90)
  l.cotes.push(20)
}
function removePli(l: LineForm) {
  if (l.cotes.length < 2) return
  l.cotes.pop()
  l.angles.pop()
}
const addLine = () => form.value.lignes.push(newLine(props.catalog, undefined, form.value.lignes.at(-1)))
const duplicate = (i: number) => form.value.lignes.splice(i + 1, 0, JSON.parse(JSON.stringify(form.value.lignes[i])))
const removeLine = (i: number) => form.value.lignes.splice(i, 1)
const accName = (id: string) => props.catalog.accessories.find((a) => a.id === id)
const colorHex = (id: string) => props.catalog.colors.find((c) => c.id === id)?.hex ?? 'var(--accent)'
const priced = (i: number) => quote.value?.lignes[i]

// --- Livraison ---
const delivery = computed(() => form.value.livraison)
function setMode(mode: 'retrait' | 'livraison') {
  if (mode === delivery.value.mode) return
  const a = props.addresses[0]
  form.value.livraison = mode === 'retrait' ? { mode } : { mode, adresse: a?.adresse ?? '', codePostal: a?.codePostal ?? '', ville: a?.ville ?? '' }
}
function useAddress(i: string) {
  const a = props.addresses[Number(i)]
  if (a && form.value.livraison.mode === 'livraison') Object.assign(form.value.livraison, { adresse: a.adresse, codePostal: a.codePostal, ville: a.ville })
}

// Vue de chaque pièce : profil coté ou 3D (par numéro de ligne)
const views = reactive<Record<number, '2d' | '3d'>>({})
const epaisseur = (id: string) => props.catalog.materials.find((m) => m.id === id)?.epaisseur ?? 1

// Angle saisi : la valeur, le sens étant gardé par le bouton ↑ / ↓. 0 = pince, enregistrée ±PINCE.
function setAngle(l: LineForm, j: number, raw: string) {
  const sign = l.angles[j]! < 0 ? -1 : 1
  const v = Number(raw)
  l.angles[j] = raw.trim() !== '' && v === 0 ? sign * PINCE : (v || 0) * sign
}
const angleHint = computed(() => {
  const { angleMin, angleMax, pince } = props.catalog.limits
  return `Plis de ${angleMin}° à ${angleMax}°${pince ? ', 0° pour une pince' : ''}.`
})

const t = computed(() => quote.value?.totals)
defineExpose({ refresh })
</script>

<template>
  <div class="editor">
    <div class="lines">
      <section v-for="(l, i) in form.lignes" :key="i" class="card line" :aria-label="`Pièce ${i + 1}`">
        <div class="line-head">
          <h2>Pièce {{ i + 1 }}</h2>
          <div class="line-tools">
            <button class="btn small icon" type="button" :aria-label="`Dupliquer la pièce ${i + 1}`" title="Dupliquer" @click="duplicate(i)"><AppIcon name="copy" :size="15" /></button>
            <button v-if="form.lignes.length > 1" class="btn small icon" type="button" :aria-label="`Retirer la pièce ${i + 1}`" title="Retirer" @click="removeLine(i)"><AppIcon name="trash" :size="15" /></button>
          </div>
        </div>
        <p v-if="lineErr(i)" class="alert bad" role="alert">{{ lineErr(i) }}</p>

        <div class="row">
          <div class="field">
            <label :for="`l${i}-modele`">Modèle</label>
            <select :id="`l${i}-modele`" class="input" :value="l.modelId" :aria-invalid="bad(`lignes.${i}.modelId`)" @change="setModele(l, ($event.target as HTMLSelectElement).value)">
              <option v-if="!modelOf(catalog, l.modelId)" value="" disabled>Modèle désactivé : choisissez-en un</option>
              <option v-for="m in catalog.models" :key="m.id" :value="m.id">{{ m.nom }}</option>
            </select>
          </div>
          <div class="field">
            <label :for="`l${i}-repere`">Repère</label>
            <input :id="`l${i}-repere`" v-model="l.repere" class="input" maxlength="60" placeholder="Mur sud, fenêtre cuisine…" autocomplete="off" />
          </div>
        </div>
        <div v-if="standardOf(l)" class="row">
          <div class="field">
            <label :for="`l${i}-std-largeur`">{{ standardOf(l)!.label }} (taille standard)</label>
            <select :id="`l${i}-std-largeur`" class="input" :value="standardOf(l)!.largeurs.includes(l.cotes[standardOf(l)!.cote]!) ? l.cotes[standardOf(l)!.cote] : ''" @change="l.cotes[standardOf(l)!.cote] = Number(($event.target as HTMLSelectElement).value)">
              <option value="" disabled>Sur mesure ({{ l.cotes[standardOf(l)!.cote] }} mm)</option>
              <option v-for="w in standardOf(l)!.largeurs" :key="w" :value="w">{{ w }} mm</option>
            </select>
          </div>
          <div class="field">
            <label :for="`l${i}-std-longueur`">Longueur (taille standard)</label>
            <select :id="`l${i}-std-longueur`" class="input" :value="standardOf(l)!.longueurs.includes(l.longueur) ? l.longueur : ''" @change="l.longueur = Number(($event.target as HTMLSelectElement).value)">
              <option value="" disabled>Sur mesure ({{ l.longueur }} mm)</option>
              <option v-for="v in standardOf(l)!.longueurs" :key="v" :value="v">{{ metres(v) }}</option>
            </select>
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label :for="`l${i}-matiere`">Matière</label>
            <select :id="`l${i}-matiere`" v-model="l.materialId" class="input" :aria-invalid="bad(`lignes.${i}.materialId`)">
              <option v-for="m in catalog.materials" :key="m.id" :value="m.id">{{ m.label }}</option>
            </select>
          </div>
          <div class="field">
            <label :for="`l${i}-coloris`">Coloris</label>
            <span class="with-swatch">
              <span class="swatch" :style="{ background: colorHex(l.colorId) }" aria-hidden="true" />
              <select :id="`l${i}-coloris`" v-model="l.colorId" class="input" :aria-invalid="bad(`lignes.${i}.colorId`)">
                <option v-for="c in catalog.colors" :key="c.id" :value="c.id">{{ c.label }}</option>
              </select>
            </span>
          </div>
        </div>

        <div class="shape">
          <div class="view">
            <div class="switch" role="group" :aria-label="`Vue de la pièce ${i + 1}`">
              <button type="button" class="chip" :aria-pressed="views[i] !== '3d'" @click="views[i] = '2d'">Profil</button>
              <button type="button" class="chip" :aria-pressed="views[i] === '3d'" @click="views[i] = '3d'">3D</button>
            </div>
            <div class="preview">
              <Profile3D
                v-if="views[i] === '3d'"
                :cotes="l.cotes"
                :angles="l.angles"
                :cap="capOf(l)"
                :longueur="l.longueur"
                :epaisseur="epaisseur(l.materialId)"
                :color="colorHex(l.colorId)"
                :label="`Pièce ${i + 1} en 3D`"
              />
              <ProfileSketch v-else :cotes="l.cotes" :angles="l.angles" :cap="capOf(l)" :color="colorHex(l.colorId)" :label="`Profil de la pièce ${i + 1}`" />
            </div>
          </div>
          <fieldset class="cotes">
            <legend>Cotes extérieures et plis</legend>
            <template v-for="(_, j) in l.cotes" :key="j">
              <div class="cote">
                <label :for="`l${i}-cote${j}`"><b>{{ letter(j) }}</b> {{ coteName(l, j) }}</label>
                <span class="unit">
                  <input :id="`l${i}-cote${j}`" v-model.number="l.cotes[j]" class="input mono" type="number" inputmode="numeric" min="1" :aria-invalid="bad(`lignes.${i}.cotes.${j}`) || bad(`lignes.${i}.cotes`)" /><span>mm</span>
                </span>
              </div>
              <div v-if="j < l.angles.length" class="pli">
                <label :for="`l${i}-angle${j}`">Pli {{ j + 1 }}</label>
                <span class="unit">
                  <input
                    :id="`l${i}-angle${j}`"
                    class="input mono"
                    type="number"
                    inputmode="numeric"
                    :min="catalog.limits.pince ? 0 : catalog.limits.angleMin"
                    :max="catalog.limits.angleMax"
                    :value="isPince(l.angles[j]!) ? 0 : Math.abs(l.angles[j]!)"
                    :aria-invalid="bad(`lignes.${i}.angles.${j}`) || bad(`lignes.${i}.angles`)"
                    @input="setAngle(l, j, ($event.target as HTMLInputElement).value)"
                  /><span>{{ isPince(l.angles[j]!) ? '° pince' : '°' }}</span>
                </span>
                <button class="btn small sens" type="button" :aria-label="`Inverser le sens du pli ${j + 1}`" :title="l.angles[j]! < 0 ? 'Pli vers le bas' : 'Pli vers le haut'" @click="l.angles[j] = -l.angles[j]!">
                  {{ l.angles[j]! < 0 ? '↓' : '↑' }}
                </button>
              </div>
            </template>
            <div class="pli-tools">
              <button class="btn small" type="button" :disabled="l.angles.length >= catalog.limits.plisMax" @click="addPli(l)"><AppIcon name="plus" :size="14" />Ajouter un pli</button>
              <button class="btn small" type="button" :disabled="l.cotes.length < 2" @click="removePli(l)">Retirer le dernier pli</button>
            </div>
            <p class="muted hint">{{ angleHint }}</p>
            <p class="muted hint">Développé : <b class="mono">{{ developpe(l.cotes).toLocaleString('fr-FR') }} mm</b> sur {{ catalog.limits.largeurTole.toLocaleString('fr-FR') }} mm de tôle.</p>
          </fieldset>
        </div>

        <div class="row">
          <div class="field">
            <label :for="`l${i}-longueur`">Longueur</label>
            <span class="unit"><input :id="`l${i}-longueur`" v-model.number="l.longueur" class="input mono" type="number" inputmode="numeric" :aria-invalid="bad(`lignes.${i}.longueur`)" /><span>mm</span></span>
            <span class="muted hint">De {{ catalog.limits.longueurMin.toLocaleString('fr-FR') }} à {{ catalog.limits.longueurMax.toLocaleString('fr-FR') }} mm.</span>
          </div>
          <div class="field">
            <label :for="`l${i}-quantite`">Quantité</label>
            <span class="unit"><input :id="`l${i}-quantite`" class="input mono" type="number" inputmode="numeric" min="1" :value="l.quantite" :aria-invalid="bad(`lignes.${i}.quantite`)" @input="setQuantite(l, ($event.target as HTMLInputElement).value)" /><span>pièces</span></span>
          </div>
        </div>

        <fieldset v-if="l.accessoires.length" class="accs">
          <legend>Accessoires</legend>
          <div v-for="(a, j) in l.accessoires" :key="a.accessoryId" class="acc">
            <label :for="`l${i}-acc${j}`">
              {{ accName(a.accessoryId)?.nom }}
              <small class="muted">{{ eur(accName(a.accessoryId)?.prix ?? 0) }} HT {{ accName(a.accessoryId)?.unite === 'paire' ? 'la paire' : 'la pièce' }}</small>
            </label>
            <input :id="`l${i}-acc${j}`" v-model.number="a.quantite" class="input mono qty" type="number" inputmode="numeric" min="0" :aria-invalid="bad(`lignes.${i}.accessoires.${j}`)" />
          </div>
        </fieldset>
        <p v-else-if="accessoriesFor(catalog, l.modelId).length === 0" class="muted hint">Aucun accessoire pour ce modèle.</p>

        <p v-if="priced(i)" class="line-price">
          <span>{{ eur(priced(i)!.prixUnitaire) }} la pièce<template v-if="priced(i)!.remiseQuantite"> · remise quantité {{ priced(i)!.remiseQuantite.toLocaleString('fr-FR') }} %</template> · mise en route {{ eur(priced(i)!.miseEnRoute) }}</span>
          <b>{{ eur(priced(i)!.total) }} HT</b>
        </p>
      </section>

      <button class="btn add-line" type="button" :disabled="form.lignes.length >= 50" @click="addLine"><AppIcon name="plus" :size="16" />Ajouter une pièce</button>

      <fieldset class="card group">
        <legend>Retrait ou livraison</legend>
        <div class="modes">
          <label class="mode" :class="{ on: delivery.mode === 'retrait' }">
            <input type="radio" name="livraison-mode" :checked="delivery.mode === 'retrait'" @change="setMode('retrait')" />
            <span>Retrait à l’atelier</span>
          </label>
          <label class="mode" :class="{ on: delivery.mode === 'livraison' }">
            <input type="radio" name="livraison-mode" :checked="delivery.mode === 'livraison'" @change="setMode('livraison')" />
            <span>Livraison sur chantier</span>
          </label>
        </div>
        <p v-if="delivery.mode === 'retrait' && !catalog.retrait" class="muted hint">Le retrait n’est pas proposé sur le site en ce moment, mais reste possible pour une commande saisie ici.</p>
        <template v-if="form.livraison.mode === 'livraison'">
          <div v-if="addresses.length" class="field">
            <label for="o-adresse-choix">Adresse connue</label>
            <select id="o-adresse-choix" class="input" @change="useAddress(($event.target as HTMLSelectElement).value)">
              <option value="">Choisir…</option>
              <option v-for="(a, k) in addresses" :key="k" :value="k">{{ a.label }} : {{ a.adresse }}, {{ a.codePostal }} {{ a.ville }}</option>
            </select>
          </div>
          <div class="field">
            <label for="o-adresse">Adresse</label>
            <input id="o-adresse" v-model="form.livraison.adresse" class="input" autocomplete="off" :aria-invalid="bad('livraison.adresse')" />
            <span v-if="err('livraison.adresse')" class="field-error">{{ err('livraison.adresse') }}</span>
          </div>
          <div class="place">
            <div class="field">
              <label for="o-cp">Code postal</label>
              <input id="o-cp" v-model="form.livraison.codePostal" class="input mono" inputmode="numeric" maxlength="5" autocomplete="off" :aria-invalid="bad('livraison.codePostal')" />
              <span v-if="err('livraison.codePostal')" class="field-error">{{ err('livraison.codePostal') }}</span>
            </div>
            <div class="field">
              <label for="o-ville">Ville</label>
              <input id="o-ville" v-model="form.livraison.ville" class="input" autocomplete="off" :aria-invalid="bad('livraison.ville')" />
              <span v-if="err('livraison.ville')" class="field-error">{{ err('livraison.ville') }}</span>
            </div>
          </div>
          <p v-if="err('livraison')" class="field-error" role="alert">{{ err('livraison') }}</p>
          <p v-else-if="quote?.distanceKm !== null && quote?.distanceKm !== undefined" class="muted hint">À {{ quote.distanceKm.toLocaleString('fr-FR') }} km de l’atelier par la route.</p>
        </template>
      </fieldset>

      <fieldset v-if="!visitor" class="card group">
        <legend>Notes internes</legend>
        <label for="o-notes" class="sr-only">Notes internes</label>
        <textarea id="o-notes" v-model="form.notes" class="input" rows="3" placeholder="Rappeler avant de livrer, plan reçu par e-mail…" aria-describedby="h-o-notes" />
        <span id="h-o-notes" class="muted hint">Jamais visibles par l’atelier ni par le client.</span>
      </fieldset>
    </div>

    <aside class="card summary" aria-label="Montant de la commande" :aria-busy="pricing">
      <h2>Montant</h2>
      <p v-if="shown && !shown.field?.startsWith('lignes.') && !shown.field?.startsWith('livraison')" class="alert bad" role="alert">{{ shown.msg }}</p>
      <p v-else-if="shown" class="alert bad">À corriger : {{ shown.msg }}</p>
      <dl v-if="t" class="totals">
        <dt>Pièces et accessoires</dt>
        <dd>{{ eur(t.brut) }}</dd>
        <template v-if="t.remisePro">
          <dt>Remise pro ({{ t.tauxRemisePro.toLocaleString('fr-FR') }} %)</dt>
          <dd>− {{ eur(t.remisePro) }}</dd>
        </template>
        <template v-if="t.complementMinimum">
          <dt>Complément minimum de commande</dt>
          <dd>{{ eur(t.complementMinimum) }}</dd>
        </template>
        <dt>{{ form.livraison.mode === 'retrait' ? 'Retrait à l’atelier' : 'Livraison' }}</dt>
        <dd>{{ form.livraison.mode === 'retrait' ? 'gratuit' : t.livraisonOfferte && !t.livraisonPrix ? 'offerte' : eur(t.livraisonPrix) }}</dd>
        <dt class="strong">Total HT</dt>
        <dd class="strong">{{ eur(t.ht) }}</dd>
        <dt>TVA {{ t.tauxTva.toLocaleString('fr-FR') }} %</dt>
        <dd>{{ eur(t.tva) }}</dd>
        <dt class="big">Total TTC</dt>
        <dd class="big">{{ eur(t.ttc) }}</dd>
      </dl>
      <p v-if="t" class="muted hint">Délai : {{ t.delaiJours }} jours ouvrés après validation.</p>
      <slot />
    </aside>
  </div>
</template>

<style scoped>
.editor {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(260px, 320px);
  gap: 16px;
  align-items: start;
}
.lines {
  display: grid;
  gap: 16px;
  min-width: 0;
}
.line,
.group {
  margin: 0;
  padding: 18px 20px 20px;
  display: grid;
  gap: 14px;
  min-width: 0;
}
.line-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.line-tools {
  display: flex;
  gap: 6px;
}
.btn.icon {
  padding-inline: 8px;
}
.row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 14px;
  align-items: start;
}
.with-swatch {
  display: flex;
  gap: 8px;
  align-items: center;
}
.swatch {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  border: 1px solid var(--line);
  flex: none;
}
.unit {
  display: flex;
  align-items: center;
  gap: 6px;
}
.unit .input {
  min-width: 0;
}
.unit > span {
  color: var(--muted);
  font-size: 0.85rem;
}
.shape {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}
.view {
  display: grid;
  gap: 8px;
  min-width: 0;
}
.switch {
  display: flex;
  gap: 6px;
}
.chip {
  border: 1px solid var(--line);
  background: var(--surface);
  border-radius: 999px;
  padding: 4px 14px;
  font-weight: 600;
  font-size: 0.85rem;
  color: var(--muted);
}
.chip[aria-pressed='true'] {
  color: var(--ink);
  border-color: var(--accent);
  background: var(--accent-soft);
}
@media (pointer: coarse) {
  .chip {
    min-height: 40px;
  }
}
.preview {
  aspect-ratio: 4 / 3;
  background: var(--surface-2);
  border-radius: 8px;
  padding: 8px;
}
.cotes,
.accs {
  border: 0;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
  min-width: 0;
}
.cotes legend,
.accs legend {
  font-size: 0.86rem;
  font-weight: 650;
  margin-bottom: 6px;
  padding: 0;
}
.cote,
.pli,
.acc {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 120px;
  gap: 8px;
  align-items: center;
}
.cote label {
  font-size: 0.86rem;
}
.cote b {
  color: var(--accent);
  margin-right: 4px;
}
.pli {
  grid-template-columns: minmax(0, 1fr) 96px auto;
  padding-left: 14px;
  border-left: 2px dashed var(--line);
  margin-left: 6px;
  font-size: 0.82rem;
  color: var(--muted);
}
.sens {
  min-width: 36px;
  font-size: 1rem;
  padding-inline: 8px;
}
.pli-tools {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 6px;
}
.acc {
  grid-template-columns: minmax(0, 1fr) 90px;
}
.acc small {
  display: block;
  font-size: 0.78rem;
}
.line-price {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  margin: 0;
  padding-top: 12px;
  border-top: 1px solid var(--line);
  font-size: 0.88rem;
}
.line-price span {
  color: var(--muted);
}
.add-line {
  justify-self: start;
}
.modes {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.mode {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 9px 14px;
  cursor: pointer;
  font-weight: 600;
}
.mode input {
  accent-color: var(--accent);
  margin: 0;
}
.mode.on {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.place {
  display: grid;
  grid-template-columns: minmax(100px, 140px) minmax(0, 1fr);
  gap: 12px;
  align-items: start;
}
.hint {
  font-size: 0.8rem;
  margin: 0;
}
textarea.input {
  resize: vertical;
  font: inherit;
  line-height: 1.5;
}
.summary {
  position: sticky;
  /* Sur le site public, l'en-tête reste collé en haut : le montant se range juste dessous */
  top: var(--sticky-top, 16px);
  max-height: calc(100vh - var(--sticky-top, 16px) - 16px);
  overflow-y: auto;
  padding: 18px 20px;
  display: grid;
  gap: 12px;
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
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
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
@media (max-width: 1100px) {
  .editor {
    grid-template-columns: minmax(0, 1fr);
  }
  .summary {
    position: static;
  }
}
@media (max-width: 640px) {
  .shape {
    grid-template-columns: minmax(0, 1fr);
  }
  .preview {
    aspect-ratio: auto;
    height: 220px;
  }
}
</style>
