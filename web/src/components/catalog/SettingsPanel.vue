<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { api, ApiError } from '@/api'
import { eur, toField, toMoneyField, type PricingSettings } from '@/lib/catalog'
import AppIcon from '@/components/AppIcon.vue'

// Les nombres sont édités comme du texte « à la française » (1,10) et envoyés tels quels : l'API les convertit
const MONEY = new Set(['prixPliMl', 'miseEnRoute', 'minimumCommande'])
const show = (k: string, v: number) => (MONEY.has(k) ? toMoneyField(v) : toField(v))
type Form = { [K in Exclude<keyof PricingSettings, 'remisesQuantite' | 'pinceAutorisee'>]: string } & { remisesQuantite: { seuil: string; remise: string }[]; pinceAutorisee: boolean }

const original = ref<PricingSettings | null>(null)
const form = reactive<Form>({
  prixPliMl: '',
  miseEnRoute: '',
  minimumCommande: '',
  remisePro: '',
  tva: '',
  delaiStandard: '',
  remisesQuantite: [],
  largeurTole: '',
  longueurMin: '',
  longueurMax: '',
  plisMax: '',
  angleMin: '',
  angleMax: '',
  pinceAutorisee: false,
})
const loadError = ref('')
const error = ref<{ field?: string; msg: string } | null>(null)
const notice = ref('')
const saving = ref(false)

function fill(s: PricingSettings) {
  original.value = s
  for (const k of Object.keys(form) as (keyof Form)[]) {
    if (k === 'remisesQuantite') form.remisesQuantite = s.remisesQuantite.map((p) => ({ seuil: String(p.seuil), remise: toField(p.remise) }))
    else if (k === 'pinceAutorisee') form.pinceAutorisee = s.pinceAutorisee
    else form[k] = show(k, s[k])
  }
}

onMounted(async () => {
  try {
    fill((await api<{ settings: PricingSettings }>('/catalog/settings')).settings)
  } catch (e) {
    loadError.value = e instanceof ApiError ? e.message : 'Chargement impossible.'
  }
})

// Comparaison avec les valeurs enregistrées : le bouton ne s'active que s'il y a quelque chose à enregistrer
const snapshot = (f: Form) => JSON.stringify(f)
const saved = computed(() => {
  if (!original.value) return ''
  const s = original.value
  const f = {} as Form
  for (const k of Object.keys(form) as (keyof Form)[]) {
    if (k === 'remisesQuantite') f.remisesQuantite = s.remisesQuantite.map((p) => ({ seuil: String(p.seuil), remise: toField(p.remise) }))
    else if (k === 'pinceAutorisee') f.pinceAutorisee = s.pinceAutorisee
    else f[k] = show(k, s[k])
  }
  return snapshot(f)
})
const dirty = computed(() => !!original.value && snapshot(form) !== saved.value)

// Quitter la page avec des modifications non enregistrées demande confirmation
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
    const { settings } = await api<{ settings: PricingSettings }>('/catalog/settings', { method: 'PATCH', body: { ...form } })
    fill(settings)
    notice.value = 'Réglages enregistrés. Ils s’appliqueront aux prochains devis.'
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

function addTier() {
  const last = form.remisesQuantite.at(-1)
  form.remisesQuantite.push({
    seuil: last ? String((Number(last.seuil) || 0) * 2 || 10) : '10',
    remise: last ? toField((Number(last.remise.replace(',', '.')) || 0) + 5) : '5',
  })
}

const num = (s: string) => Number(s.replace(/\s/g, '').replace(',', '.'))
// Exemple concret pour se représenter le prix d'un pli
const example = computed(() => {
  const n = num(form.prixPliMl)
  return Number.isFinite(n) ? `Une couvertine de 3 m à 4 plis : ${eur(n * 4 * 3)} de façonnage par pièce.` : ''
})

const err = (f: string) => (error.value?.field === f ? error.value.msg : '')
</script>

<template>
  <form class="settings" novalidate aria-label="Façonnage et conditions" @submit.prevent="save">
    <p v-if="loadError" class="alert bad" role="alert">{{ loadError }}</p>
    <p v-if="notice" class="alert ok" role="status">{{ notice }}</p>
    <p v-if="error && !['prixPliMl', 'miseEnRoute', 'minimumCommande', 'remisePro', 'tva', 'delaiStandard', 'remisesQuantite', 'largeurTole', 'longueurMin', 'longueurMax', 'plisMax', 'angleMin', 'angleMax', 'pinceAutorisee'].includes(error.field ?? '')" class="alert bad" role="alert">{{ error.msg }}</p>

    <div v-if="original" class="groups">
      <fieldset class="card group">
        <legend>Façonnage</legend>
        <div class="field">
          <label for="s-pli">Prix par pli et par mètre</label>
          <span class="unit"><input id="s-pli" v-model="form.prixPliMl" class="input mono" inputmode="decimal" :aria-invalid="!!err('prixPliMl') || undefined" /><span>€</span></span>
          <span v-if="err('prixPliMl')" class="field-error">{{ err('prixPliMl') }}</span>
          <span class="hint muted">{{ example }}</span>
        </div>
        <div class="field">
          <label for="s-mer">Mise en route machine</label>
          <span class="unit"><input id="s-mer" v-model="form.miseEnRoute" class="input mono" inputmode="decimal" :aria-invalid="!!err('miseEnRoute') || undefined" /><span>€ / référence</span></span>
          <span v-if="err('miseEnRoute')" class="field-error">{{ err('miseEnRoute') }}</span>
          <span class="hint muted">Ajoutée une fois par pièce différente d’un devis (réglage de la plieuse).</span>
        </div>
      </fieldset>

      <fieldset class="card group">
        <legend>Conditions commerciales</legend>
        <div class="field">
          <label for="s-min">Minimum de commande</label>
          <span class="unit"><input id="s-min" v-model="form.minimumCommande" class="input mono" inputmode="decimal" :aria-invalid="!!err('minimumCommande') || undefined" /><span>€ HT</span></span>
          <span v-if="err('minimumCommande')" class="field-error">{{ err('minimumCommande') }}</span>
        </div>
        <div class="field">
          <label for="s-pro">Remise compte pro</label>
          <span class="unit"><input id="s-pro" v-model="form.remisePro" class="input mono" inputmode="decimal" :aria-invalid="!!err('remisePro') || undefined" /><span>%</span></span>
          <span v-if="err('remisePro')" class="field-error">{{ err('remisePro') }}</span>
        </div>
        <div class="field">
          <label for="s-tva">TVA</label>
          <span class="unit"><input id="s-tva" v-model="form.tva" class="input mono" inputmode="decimal" :aria-invalid="!!err('tva') || undefined" /><span>%</span></span>
          <span v-if="err('tva')" class="field-error">{{ err('tva') }}</span>
        </div>
        <div class="field">
          <label for="s-delai">Délai de fabrication standard</label>
          <span class="unit"><input id="s-delai" v-model="form.delaiStandard" class="input mono" inputmode="numeric" :aria-invalid="!!err('delaiStandard') || undefined" /><span>jours ouvrés</span></span>
          <span v-if="err('delaiStandard')" class="field-error">{{ err('delaiStandard') }}</span>
        </div>
      </fieldset>

      <fieldset class="card group tiers-group">
        <legend>Remises quantité</legend>
        <p class="hint muted">Appliquées sur le prix des pièces d’une même ligne de devis, selon le nombre de pièces.</p>
        <ol v-if="form.remisesQuantite.length" class="tiers">
          <li v-for="(t, i) in form.remisesQuantite" :key="i">
            <span aria-hidden="true">Dès</span>
            <span class="unit small"><input :id="`s-seuil-${i}`" v-model="t.seuil" class="input mono" inputmode="numeric" :aria-label="`Palier ${i + 1} : nombre de pièces`" /><span>pièces</span></span>
            <span aria-hidden="true">→</span>
            <span class="unit tiny"><input :id="`s-remise-${i}`" v-model="t.remise" class="input mono" inputmode="decimal" :aria-label="`Palier ${i + 1} : remise`" /><span>%</span></span>
            <button class="btn small icon" type="button" :aria-label="`Supprimer le palier ${i + 1}`" @click="form.remisesQuantite.splice(i, 1)">
              <AppIcon name="trash" :size="15" />
            </button>
          </li>
        </ol>
        <p v-else class="muted">Aucune remise quantité.</p>
        <span v-if="err('remisesQuantite')" class="field-error" role="alert">{{ err('remisesQuantite') }}</span>
        <div>
          <button class="btn small" type="button" :disabled="form.remisesQuantite.length >= 6" @click="addTier"><AppIcon name="plus" :size="15" />Ajouter un palier</button>
        </div>
      </fieldset>

      <fieldset class="card group">
        <legend>Limites des machines</legend>
        <div class="field">
          <label for="s-largeur">Largeur de tôle</label>
          <span class="unit"><input id="s-largeur" v-model="form.largeurTole" class="input mono" inputmode="numeric" :aria-invalid="!!err('largeurTole') || undefined" /><span>mm</span></span>
          <span v-if="err('largeurTole')" class="field-error">{{ err('largeurTole') }}</span>
          <span class="hint muted">Développé maximum d’une pièce.</span>
        </div>
        <div class="row">
          <div class="field">
            <label for="s-lmin">Longueur minimum</label>
            <span class="unit"><input id="s-lmin" v-model="form.longueurMin" class="input mono" inputmode="numeric" :aria-invalid="!!err('longueurMin') || undefined" /><span>mm</span></span>
            <span v-if="err('longueurMin')" class="field-error">{{ err('longueurMin') }}</span>
          </div>
          <div class="field">
            <label for="s-lmax">Longueur maximum</label>
            <span class="unit"><input id="s-lmax" v-model="form.longueurMax" class="input mono" inputmode="numeric" :aria-invalid="!!err('longueurMax') || undefined" /><span>mm</span></span>
            <span v-if="err('longueurMax')" class="field-error">{{ err('longueurMax') }}</span>
          </div>
        </div>
        <div class="field">
          <label for="s-plis">Nombre de plis maximum</label>
          <span class="unit"><input id="s-plis" v-model="form.plisMax" class="input mono" inputmode="numeric" :aria-invalid="!!err('plisMax') || undefined" /><span>plis</span></span>
          <span v-if="err('plisMax')" class="field-error">{{ err('plisMax') }}</span>
        </div>
        <div class="row">
          <div class="field">
            <label for="s-amin">Angle minimum</label>
            <span class="unit"><input id="s-amin" v-model="form.angleMin" class="input mono" inputmode="numeric" :aria-invalid="!!err('angleMin') || undefined" /><span>°</span></span>
            <span v-if="err('angleMin')" class="field-error">{{ err('angleMin') }}</span>
          </div>
          <div class="field">
            <label for="s-amax">Angle maximum</label>
            <span class="unit"><input id="s-amax" v-model="form.angleMax" class="input mono" inputmode="numeric" :aria-invalid="!!err('angleMax') || undefined" /><span>°</span></span>
            <span v-if="err('angleMax')" class="field-error">{{ err('angleMax') }}</span>
          </div>
        </div>
        <span class="hint muted">Angle intérieur d’un pli : 90° pour un angle droit, plus petit pour un pli plus fermé.</span>
        <label class="check">
          <input v-model="form.pinceAutorisee" type="checkbox" />
          <span>L’atelier fait les pinces <span class="muted">(tôle repliée à plat sur elle-même, saisie 0°)</span></span>
        </label>
        <span v-if="err('pinceAutorisee')" class="field-error">{{ err('pinceAutorisee') }}</span>
      </fieldset>
    </div>

    <div v-if="original" class="savebar">
      <span class="muted state" aria-live="polite">{{ dirty ? 'Modifications non enregistrées' : 'À jour' }}</span>
      <button class="btn" type="button" :disabled="!dirty || saving" @click="reset">Annuler les modifications</button>
      <button class="btn primary" type="submit" :disabled="!dirty || saving">{{ saving ? 'Enregistrement…' : 'Enregistrer' }}</button>
    </div>
  </form>
</template>

<style>
@import './settings.css';
</style>
