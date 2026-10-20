<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { api, ApiError } from '@/api'
import { COMPANY_FIELDS, facturxMissing, formatNumber, LOGO_MAX, TEMPLATE_FIELDS, type Company, type DocumentSettings, type DocumentType, type Numbering, type Template } from '@/lib/documents'
import AppIcon from '@/components/AppIcon.vue'
import BrandMark from '@/components/BrandMark.vue'
import PdfPreview from '@/components/documents/PdfPreview.vue'

type Tab = 'entreprise' | 'modele' | 'numerotation'
const TABS: { id: Tab; label: string; icon: 'id' | 'palette' | 'list' }[] = [
  { id: 'entreprise', label: 'Entreprise', icon: 'id' },
  { id: 'modele', label: 'Modèle', icon: 'palette' },
  { id: 'numerotation', label: 'Numérotation', icon: 'list' },
]
const route = useRoute()
const router = useRouter()
const tab = ref<Tab>(TABS.find((t) => t.id === route.query.onglet)?.id ?? 'entreprise')
watch(tab, (t) => router.replace({ query: t === 'entreprise' ? {} : { onglet: t } }))

function onKey(e: KeyboardEvent) {
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
  const i = TABS.findIndex((t) => t.id === tab.value)
  const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length]!
  tab.value = next.id
  document.getElementById(`tab-${next.id}`)?.focus()
}

// --- Formulaires (texte brut, l'API valide et met en forme) ---
type CompanyForm = Record<(typeof COMPANY_FIELDS)[number], string>
type TemplateForm = Record<(typeof TEMPLATE_FIELDS)[number], string>
const company = reactive({} as CompanyForm)
// Mis à jour pendant la saisie
const facturxManque = computed(() => (company.siret === undefined ? [] : facturxMissing(company)))
const template = reactive({} as TemplateForm)
const numbering = reactive({ devis: '', facture: '' })

const original = ref<DocumentSettings | null>(null)
const loadError = ref('')
const error = ref<{ field?: string; msg: string } | null>(null)
const notice = ref('')
const saving = ref(false)

const toCompany = (c: Company) => Object.fromEntries(COMPANY_FIELDS.map((k) => [k, c[k]])) as CompanyForm
const toTemplate = (t: Template) => Object.fromEntries(TEMPLATE_FIELDS.map((k) => [k, String(t[k])])) as TemplateForm
const toNumbering = (n: Numbering) => ({ devis: String(n.devis.numero), facture: String(n.facture.numero) })

function fill(s: DocumentSettings) {
  original.value = s
  Object.assign(company, toCompany(s.company))
  Object.assign(template, toTemplate(s.template))
  Object.assign(numbering, toNumbering(s.numbering))
}

onMounted(async () => {
  try {
    fill(await api<DocumentSettings>('/documents/settings'))
  } catch (e) {
    loadError.value = e instanceof ApiError ? e.message : 'Chargement impossible.'
  }
})

const same = (a: object, b: object) => JSON.stringify(a) === JSON.stringify(b)
const dirtyCompany = computed(() => !!original.value && !same(company, toCompany(original.value.company)))
const dirtyTemplate = computed(() => !!original.value && !same(template, toTemplate(original.value.template)))
const dirtyNumbering = computed(() => !!original.value && !same(numbering, toNumbering(original.value.numbering)))
const dirty = computed(() => dirtyCompany.value || dirtyTemplate.value || dirtyNumbering.value)

onBeforeRouteLeave(() => (dirty.value ? window.confirm('Des réglages ne sont pas enregistrés. Quitter quand même ?') : true))
const beforeUnload = (e: BeforeUnloadEvent) => {
  if (dirty.value) e.preventDefault()
}
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))

// Onglet qui contient un champ, pour y emmener l'utilisateur en cas d'erreur
const tabOf = (field?: string): Tab | null =>
  !field
    ? null
    : (COMPANY_FIELDS as readonly string[]).includes(field)
      ? 'entreprise'
      : field === 'devis' || field === 'facture'
        ? 'numerotation'
        : (TEMPLATE_FIELDS as readonly string[]).includes(field)
          ? 'modele'
          : null

async function save() {
  if (!original.value) return
  error.value = null
  notice.value = ''
  saving.value = true
  try {
    const s = { ...original.value }
    if (dirtyCompany.value) s.company = (await api<{ company: Company }>('/documents/company', { method: 'PATCH', body: { ...company } })).company
    if (dirtyTemplate.value) {
      s.template = (await api<{ template: Template }>('/documents/template', { method: 'PATCH', body: { ...template } })).template
    }
    if (dirtyNumbering.value) {
      const body = Object.fromEntries((['devis', 'facture'] as const).filter((k) => numbering[k] !== String(s.numbering[k].numero)).map((k) => [k, numbering[k]]))
      s.numbering = (await api<{ numbering: Numbering }>('/documents/numbering', { method: 'PATCH', body })).numbering
    }
    fill(s)
    notice.value = 'Modèles enregistrés. Ils s’appliqueront aux prochains devis et factures.'
  } catch (e) {
    error.value = e instanceof ApiError ? { msg: e.message, field: e.field } : { msg: 'L’enregistrement a échoué.' }
    const t = tabOf(error.value.field)
    if (t) tab.value = t
  } finally {
    saving.value = false
  }
}

function reset() {
  if (original.value) fill(original.value)
  error.value = null
}

const err = (f: string) => (error.value?.field === f ? error.value.msg : '')
const KNOWN = [...COMPANY_FIELDS, ...TEMPLATE_FIELDS, 'devis', 'facture', 'logo'] as string[]

// Numéro tel qu'il apparaîtra, d'après la saisie
const label = (type: DocumentType, n: string) => (original.value ? formatNumber(type, original.value.numbering.annee, Number(n) || 0) : '')
const locked = (type: DocumentType) => !!original.value?.numbering[type].verrouille
const NUMBERED: { type: DocumentType; legend: string; next: string; lock: string }[] = [
  { type: 'devis', legend: 'Devis', next: 'Prochain devis :', lock: 'Verrouillé : un devis a déjà été créé.' },
  { type: 'facture', legend: 'Factures', next: 'Prochaine facture :', lock: 'Verrouillé : une facture a déjà été créée.' },
]

// --- Logo : envoyé ou retiré tout de suite, hors du bouton « Enregistrer » ---
const logoVersion = ref(0)
const logoError = ref('')
const logoBusy = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

async function upload(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!file || !original.value) return
  logoError.value = ''
  if (!['image/png', 'image/jpeg'].includes(file.type)) return void (logoError.value = 'Format non pris en charge : envoyez une image PNG ou JPEG.')
  if (file.size > LOGO_MAX) return void (logoError.value = 'Image trop lourde : 1 Mo maximum.')
  logoBusy.value = true
  try {
    const r = await api<{ company: Company }>('/documents/logo', { method: 'PUT', raw: file })
    original.value = { ...original.value, company: r.company }
    logoVersion.value++
  } catch (err) {
    logoError.value = err instanceof ApiError ? err.message : 'L’envoi a échoué.'
  } finally {
    logoBusy.value = false
  }
}

async function removeLogo() {
  if (!original.value) return
  logoError.value = ''
  logoBusy.value = true
  try {
    const r = await api<{ company: Company }>('/documents/logo', { method: 'DELETE' })
    original.value = { ...original.value, company: r.company }
    logoVersion.value++
  } catch (err) {
    logoError.value = err instanceof ApiError ? err.message : 'La suppression a échoué.'
  } finally {
    logoBusy.value = false
  }
}
</script>

<template>
  <div class="page-head">
    <div>
      <span class="eyebrow">Direction</span>
      <h1>Modèles de documents</h1>
      <p class="muted intro">Identité, textes et numérotation imprimés sur les devis et les factures.</p>
    </div>
  </div>

  <p v-if="loadError" class="alert bad" role="alert">{{ loadError }}</p>

  <div v-if="original" class="layout">
    <form class="settings editor" novalidate aria-label="Modèles de documents" @submit.prevent="save">
      <div class="tabs" role="tablist" aria-label="Réglages des documents" @keydown="onKey">
        <button
          v-for="t in TABS"
          :id="`tab-${t.id}`"
          :key="t.id"
          class="tab"
          type="button"
          role="tab"
          :aria-selected="tab === t.id"
          :aria-controls="`panel-${t.id}`"
          :tabindex="tab === t.id ? 0 : -1"
          @click="tab = t.id"
        >
          <AppIcon :name="t.icon" :size="17" />{{ t.label }}
        </button>
      </div>

      <p v-if="notice" class="alert ok" role="status">{{ notice }}</p>
      <p v-if="error && !KNOWN.includes(error.field ?? '')" class="alert bad" role="alert">{{ error.msg }}</p>

      <!-- Entreprise -->
      <section v-show="tab === 'entreprise'" id="panel-entreprise" role="tabpanel" aria-labelledby="tab-entreprise" class="groups">
        <div class="card group facturx" :class="{ ok: !facturxManque.length }" role="status">
          <h3>Facturation électronique</h3>
          <p v-if="!facturxManque.length">Les informations de l’entreprise sont complètes : les factures et avoirs sont émis au format Factur-X.</p>
          <p v-else>Pour des factures électroniques conformes, il manque : <b>{{ facturxManque.join(', ') }}</b>.</p>
        </div>

        <fieldset class="card group">
          <legend>Identité</legend>
          <div class="field">
            <label for="c-raison">Raison sociale</label>
            <input id="c-raison" v-model="company.raisonSociale" class="input" autocomplete="organization" :aria-invalid="!!err('raisonSociale') || undefined" />
            <span v-if="err('raisonSociale')" class="field-error">{{ err('raisonSociale') }}</span>
          </div>
          <div class="row">
            <div class="field">
              <label for="c-forme">Forme juridique</label>
              <input id="c-forme" v-model="company.formeJuridique" class="input" placeholder="SARL, SAS, EI…" :aria-invalid="!!err('formeJuridique') || undefined" />
              <span v-if="err('formeJuridique')" class="field-error">{{ err('formeJuridique') }}</span>
            </div>
            <div class="field">
              <label for="c-capital">Capital</label>
              <input id="c-capital" v-model="company.capital" class="input" placeholder="10 000 €" :aria-invalid="!!err('capital') || undefined" />
              <span v-if="err('capital')" class="field-error">{{ err('capital') }}</span>
            </div>
          </div>
        </fieldset>

        <fieldset class="card group">
          <legend>Logo</legend>
          <div class="logo-row">
            <div class="logo-box">
              <img v-if="original.company.logo" :src="`/api/documents/logo?v=${logoVersion}`" alt="Logo envoyé" />
              <BrandMark v-else class="mark" />
            </div>
            <div class="logo-actions">
              <p class="muted hint">{{ original.company.logo ? 'Logo envoyé, utilisé sur les documents.' : 'Logo de l’appli, utilisé par défaut.' }}</p>
              <input ref="fileInput" type="file" accept="image/png,image/jpeg" class="sr-only" aria-label="Envoyer un logo (PNG ou JPEG)" @change="upload" />
              <div class="actions">
                <button class="btn small" type="button" :disabled="logoBusy" @click="fileInput?.click()"><AppIcon name="upload" :size="15" />Envoyer un logo</button>
                <button v-if="original.company.logo" class="btn small" type="button" :disabled="logoBusy" @click="removeLogo">Revenir au logo de l’appli</button>
              </div>
              <p class="muted hint">PNG ou JPEG, 1 Mo maximum. Enregistré tout de suite.</p>
              <p v-if="logoError" class="field-error" role="alert">{{ logoError }}</p>
            </div>
          </div>
        </fieldset>

        <fieldset class="card group">
          <legend>Coordonnées</legend>
          <div class="field">
            <label for="c-adresse">Adresse</label>
            <textarea id="c-adresse" v-model="company.adresse" class="input" rows="3" autocomplete="street-address" :aria-invalid="!!err('adresse') || undefined" />
            <span v-if="err('adresse')" class="field-error">{{ err('adresse') }}</span>
          </div>
          <div class="row">
            <div class="field">
              <label for="c-tel">Téléphone</label>
              <input id="c-tel" v-model="company.telephone" class="input" type="tel" autocomplete="tel" :aria-invalid="!!err('telephone') || undefined" />
              <span v-if="err('telephone')" class="field-error">{{ err('telephone') }}</span>
            </div>
            <div class="field">
              <label for="c-email">E-mail</label>
              <input id="c-email" v-model="company.email" class="input" type="email" autocomplete="email" :aria-invalid="!!err('email') || undefined" />
              <span v-if="err('email')" class="field-error">{{ err('email') }}</span>
            </div>
          </div>
          <div class="field">
            <label for="c-site">Site web</label>
            <input id="c-site" v-model="company.siteWeb" class="input" autocomplete="url" :aria-invalid="!!err('siteWeb') || undefined" />
            <span v-if="err('siteWeb')" class="field-error">{{ err('siteWeb') }}</span>
          </div>
        </fieldset>

        <fieldset class="card group">
          <legend>Immatriculation</legend>
          <div class="field">
            <label for="c-siret">SIRET</label>
            <input id="c-siret" v-model="company.siret" class="input mono" inputmode="numeric" placeholder="14 chiffres" :aria-invalid="!!err('siret') || undefined" />
            <span v-if="err('siret')" class="field-error">{{ err('siret') }}</span>
          </div>
          <div class="row">
            <div class="field">
              <label for="c-rcs">RCS</label>
              <input id="c-rcs" v-model="company.rcs" class="input" placeholder="Saint-Étienne" :aria-invalid="!!err('rcs') || undefined" />
              <span v-if="err('rcs')" class="field-error">{{ err('rcs') }}</span>
            </div>
            <div class="field">
              <label for="c-tva">TVA intracommunautaire</label>
              <input id="c-tva" v-model="company.tvaIntra" class="input mono" placeholder="FR…" :aria-invalid="!!err('tvaIntra') || undefined" />
              <span v-if="err('tvaIntra')" class="field-error">{{ err('tvaIntra') }}</span>
            </div>
          </div>
        </fieldset>

        <fieldset class="card group">
          <legend>Banque</legend>
          <p class="muted hint">Imprimée sur les factures, pour le règlement par virement.</p>
          <div class="field">
            <label for="c-iban">IBAN</label>
            <input id="c-iban" v-model="company.iban" class="input mono" autocomplete="off" :aria-invalid="!!err('iban') || undefined" />
            <span v-if="err('iban')" class="field-error">{{ err('iban') }}</span>
          </div>
          <div class="field">
            <label for="c-bic">BIC</label>
            <input id="c-bic" v-model="company.bic" class="input mono" autocomplete="off" :aria-invalid="!!err('bic') || undefined" />
            <span v-if="err('bic')" class="field-error">{{ err('bic') }}</span>
          </div>
        </fieldset>
      </section>

      <!-- Modèle -->
      <section v-show="tab === 'modele'" id="panel-modele" role="tabpanel" aria-labelledby="tab-modele" class="groups">
        <fieldset class="card group">
          <legend>Apparence</legend>
          <div class="field">
            <label for="t-couleur">Couleur des titres</label>
            <span class="color">
              <input id="t-couleur-picker" v-model="template.couleur" type="color" class="picker" aria-label="Choisir la couleur" />
              <input id="t-couleur" v-model="template.couleur" class="input mono" maxlength="7" :aria-invalid="!!err('couleur') || undefined" />
            </span>
            <span v-if="err('couleur')" class="field-error">{{ err('couleur') }}</span>
            <span class="hint muted">Titre du document, en-tête du tableau et total.</span>
          </div>
        </fieldset>

        <fieldset class="card group">
          <legend>Textes communs</legend>
          <div class="field">
            <label for="t-entete">Introduction</label>
            <textarea id="t-entete" v-model="template.entete" class="input" rows="2" placeholder="Ex. Suite à votre demande, voici notre proposition." :aria-invalid="!!err('entete') || undefined" />
            <span v-if="err('entete')" class="field-error">{{ err('entete') }}</span>
            <span class="hint muted">Sous les coordonnées du client, avant le détail.</span>
          </div>
          <div class="field">
            <label for="t-conditions">Conditions de paiement</label>
            <textarea id="t-conditions" v-model="template.conditionsPaiement" class="input" rows="2" placeholder="Ex. 30 % à la commande, solde à la livraison. Virement ou chèque." :aria-invalid="!!err('conditionsPaiement') || undefined" />
            <span v-if="err('conditionsPaiement')" class="field-error">{{ err('conditionsPaiement') }}</span>
          </div>
          <div class="field">
            <label for="t-mentions">Mentions légales</label>
            <textarea
              id="t-mentions"
              v-model="template.mentionsLegales"
              class="input"
              rows="5"
              placeholder="Ex. Pénalités de retard : trois fois le taux d’intérêt légal. Indemnité forfaitaire pour frais de recouvrement : 40 €. Pas d’escompte pour paiement anticipé."
              :aria-invalid="!!err('mentionsLegales') || undefined"
            />
            <span v-if="err('mentionsLegales')" class="field-error">{{ err('mentionsLegales') }}</span>
            <span class="hint muted">En petit, en bas du document. Faites-les relire par votre comptable.</span>
          </div>
          <div class="field">
            <label for="t-pied">Pied de page</label>
            <input id="t-pied" v-model="template.piedDePage" class="input" placeholder="Ex. Pliage de tôle aluminium sur mesure" :aria-invalid="!!err('piedDePage') || undefined" />
            <span v-if="err('piedDePage')" class="field-error">{{ err('piedDePage') }}</span>
            <span class="hint muted">Sur chaque page, au-dessus de l’identité de l’entreprise (raison sociale, SIRET, RCS, TVA).</span>
          </div>
        </fieldset>

        <fieldset class="card group">
          <legend>Devis</legend>
          <div class="field">
            <label for="t-validite">Validité</label>
            <span class="unit"><input id="t-validite" v-model="template.validiteDevis" class="input mono" inputmode="numeric" :aria-invalid="!!err('validiteDevis') || undefined" /><span>jours</span></span>
            <span v-if="err('validiteDevis')" class="field-error">{{ err('validiteDevis') }}</span>
          </div>
          <div class="field">
            <label for="t-note-devis">Note du devis</label>
            <textarea id="t-note-devis" v-model="template.noteDevis" class="input" rows="2" placeholder="Ex. Délai de fabrication : 5 jours ouvrés après accord." :aria-invalid="!!err('noteDevis') || undefined" />
            <span v-if="err('noteDevis')" class="field-error">{{ err('noteDevis') }}</span>
          </div>
        </fieldset>

        <fieldset class="card group">
          <legend>Facture</legend>
          <div class="field">
            <label for="t-echeance">Délai de paiement</label>
            <span class="unit"><input id="t-echeance" v-model="template.echeanceFacture" class="input mono" inputmode="numeric" :aria-invalid="!!err('echeanceFacture') || undefined" /><span>jours</span></span>
            <span v-if="err('echeanceFacture')" class="field-error">{{ err('echeanceFacture') }}</span>
            <span class="hint muted">60 jours maximum entre professionnels.</span>
          </div>
          <div class="field">
            <label for="t-note-facture">Note de la facture</label>
            <textarea id="t-note-facture" v-model="template.noteFacture" class="input" rows="2" placeholder="Ex. Merci de votre confiance." :aria-invalid="!!err('noteFacture') || undefined" />
            <span v-if="err('noteFacture')" class="field-error">{{ err('noteFacture') }}</span>
          </div>
        </fieldset>
      </section>

      <!-- Numérotation -->
      <section v-show="tab === 'numerotation'" id="panel-numerotation" role="tabpanel" aria-labelledby="tab-numerotation" class="groups">
        <fieldset v-for="t in NUMBERED" :key="t.type" class="card group">
          <legend>{{ t.legend }}</legend>
          <div class="field">
            <label :for="`n-${t.type}`">Prochain numéro</label>
            <input :id="`n-${t.type}`" v-model="numbering[t.type]" class="input mono" inputmode="numeric" :disabled="locked(t.type)" :aria-invalid="!!err(t.type) || undefined" :aria-describedby="locked(t.type) ? `n-${t.type}-lock` : undefined" />
            <span v-if="err(t.type)" class="field-error">{{ err(t.type) }}</span>
            <span v-else-if="locked(t.type)" :id="`n-${t.type}-lock`" class="muted hint">{{ t.lock }}</span>
          </div>
          <p class="next">{{ t.next }} <b class="mono">{{ label(t.type, numbering[t.type]) }}</b></p>
        </fieldset>

        <div class="card group explain">
          <p>Les numéros sont attribués à la création de chaque devis et facture, à la suite, sans trou ni doublon. Ils repartent à 1 chaque 1<sup>er</sup> janvier.</p>
          <p class="muted">Pour continuer la numérotation de votre ancien logiciel, indiquez le prochain numéro avant de créer le premier document.</p>
        </div>
      </section>

      <div class="savebar">
        <span class="muted state" aria-live="polite">{{ dirty ? 'Modifications non enregistrées' : 'À jour' }}</span>
        <button class="btn" type="button" :disabled="!dirty || saving" @click="reset">Annuler les modifications</button>
        <button class="btn primary" type="submit" :disabled="!dirty || saving">{{ saving ? 'Enregistrement…' : 'Enregistrer' }}</button>
      </div>
    </form>

    <PdfPreview class="side" :company="company" :template="template" :logo-version="logoVersion" />
  </div>
</template>

<style>
@import '@/components/catalog/settings.css';
</style>

<style scoped>
.facturx {
  border-left: 4px solid var(--warn);
}
.facturx.ok {
  border-left-color: var(--ok);
}
.facturx h3 {
  font-size: 1rem;
  margin-bottom: 4px;
}
.intro {
  margin-top: 6px;
  font-size: 0.9rem;
}
.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(340px, 440px);
  gap: 20px;
  align-items: start;
}
.side {
  position: sticky;
  top: 16px;
  max-height: calc(100vh - 32px);
  overflow: auto;
}
@media (max-width: 1200px) {
  .layout {
    grid-template-columns: minmax(0, 1fr);
  }
  .side {
    position: static;
    max-height: none;
  }
}
.editor {
  min-width: 0;
}
/* Une colonne de cartes : l'aperçu prend la place à côté */
.editor .groups {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));
}
.tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--line);
}
.tab {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 0;
  background: none;
  padding: 10px 14px;
  font-weight: 600;
  color: var(--muted);
  border-bottom: 3px solid transparent;
  margin-bottom: -1px;
  white-space: nowrap;
}
.tab:hover {
  color: var(--ink);
}
.tab[aria-selected='true'] {
  color: var(--ink);
  border-bottom-color: var(--accent);
}
@media (pointer: coarse) {
  .tab {
    min-height: 44px;
  }
}
@media (max-width: 480px) {
  .tab {
    padding-inline: 10px;
  }
  .tab > .icon {
    display: none;
  }
}
textarea.input {
  resize: vertical;
  font: inherit;
}
.color {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 240px;
}
.picker {
  width: 42px;
  height: 38px;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 2px;
  background: var(--surface);
  cursor: pointer;
  flex: none;
}
.logo-row {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  flex-wrap: wrap;
}
/* Le logo est montré sur fond blanc, comme sur le papier */
.logo-box {
  width: 140px;
  height: 80px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
  display: grid;
  place-items: center;
  padding: 8px;
  flex: none;
}
.logo-box img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.logo-box .mark {
  height: 100%;
}
.logo-actions {
  display: grid;
  gap: 8px;
  min-width: 0;
  flex: 1 1 200px;
}
.logo-actions .hint,
.logo-actions .field-error {
  margin: 0;
}
.actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.next {
  margin: 0;
  font-size: 0.92rem;
}
.explain {
  font-size: 0.88rem;
}
.explain p {
  margin: 0;
}
</style>
