<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { api, ApiError } from '@/api'
import AppIcon from '@/components/AppIcon.vue'
import CodeField from '@/components/CodeField.vue'
import SheetCodes from '@/components/SheetCodes.vue'
import type { Feuille, StockOptions } from '@/lib/stock'

// Matériaux : la définition des feuilles que l'atelier reçoit (matière, coloris, format) et de leurs codes-barres fournisseur.
// C'est ce qui permet à la réception de savoir, au scan d'un code, de quelle feuille il s'agit. Les quantités restent au stock de l'atelier.
const feuilles = ref<Feuille[]>([])
const options = ref<StockOptions>({ materials: [], colors: [] })
const loading = ref(true)
const error = ref('')
const info = ref('')
const filtre = ref('')
const ouvert = ref<string | null>(null)
const archivees = ref(false)

async function load() {
  try {
    feuilles.value = (await api<{ feuilles: Feuille[] }>(`/stock/feuilles${archivees.value ? '?archivees=1' : ''}`)).feuilles
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Chargement impossible.'
  } finally {
    loading.value = false
  }
}
onMounted(async () => {
  await load()
  try {
    options.value = await api<StockOptions>('/stock/options?tous=1')
  } catch {
    /* le formulaire d'ajout restera vide : l'erreur de chargement est déjà affichée */
  }
})

// Suggestions de saisie : les matières, épaisseurs et coloris déjà connus (la saisie reste libre)
const unique = (l: (string | undefined)[]) => [...new Set(l.filter((v): v is string => !!v))]
const matieres = computed(() => unique(options.value.materials.map((m) => m.nom)))
const epaisseurs = computed(() => unique(options.value.materials.map((m) => (m.epaisseur === undefined ? undefined : String(m.epaisseur).replace('.', ',')))))
const colorisConnus = computed(() => unique(options.value.colors.map((c) => c.nom)))
const references = computed(() => unique(options.value.colors.map((c) => c.reference)))

const fmt = (n: number) => n.toLocaleString('fr-FR')
// Espaces insécables des milliers et espaces ordinaires se valent quand on cherche
const flat = (t: string) => t.toLowerCase().replace(/\s+/g, ' ').trim()
const visibles = computed(() => {
  const q = flat(filtre.value)
  // Les chutes (morceaux récupérés) restent au stock de l'atelier : pas de code-barres fournisseur à définir
  return feuilles.value.filter((f) => !f.chute).filter((f) => !q || flat(f.libelle).includes(q) || (f.codes ?? []).some((c) => c.toLowerCase().includes(q)))
})

// --- Ajouter une référence ---
const ajout = ref(false)
const draft = reactive({ matiere: '', epaisseur: '', coloris: '', reference: '', largeur: '1250', longueur: '3000', code: '' })
const errors = reactive<Record<string, string>>({})
const adding = ref(false)
const num = (v: string) => (v.trim() === '' ? NaN : Number(v.replace(',', '.')))

function ouvrirAjout() {
  ajout.value = !ajout.value
  for (const k of Object.keys(errors)) delete errors[k]
  Object.assign(draft, { matiere: '', epaisseur: '', coloris: '', reference: '', largeur: '1250', longueur: '3000', code: '' })
}

async function add() {
  for (const k of Object.keys(errors)) delete errors[k]
  error.value = info.value = ''
  adding.value = true
  try {
    await api('/stock/feuilles', {
      method: 'POST',
      body: {
        matiere: draft.matiere,
        epaisseur: num(draft.epaisseur),
        ...(draft.coloris.trim() ? { coloris: draft.coloris, ...(draft.reference.trim() ? { reference: draft.reference } : {}) } : {}),
        largeur: num(draft.largeur),
        longueur: num(draft.longueur),
        quantite: 0,
        ...(draft.code.trim() ? { code: draft.code } : {}),
      },
    })
    info.value = 'Référence ajoutée : l’atelier peut la réceptionner.'
    ajout.value = false
    await load()
  } catch (e) {
    if (e instanceof ApiError && e.field) errors[e.field] = e.message
    else error.value = e instanceof ApiError ? e.message : 'Enregistrement impossible.'
  } finally {
    adding.value = false
  }
}

// Une référence ne se supprime jamais : on l'archive (elle n'est plus proposée), et on peut la désarchiver
async function archiver(f: Feuille, archive: boolean) {
  error.value = info.value = ''
  try {
    await api(`/stock/feuilles/${f.id}/${archive ? 'archive' : 'unarchive'}`, { method: 'POST' })
    info.value = archive ? 'Référence archivée.' : 'Référence désarchivée.'
    if (ouvert.value === f.id) ouvert.value = null
    await load()
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Action impossible.'
  }
}

async function basculerArchivees() {
  archivees.value = !archivees.value
  ouvert.value = null
  loading.value = true
  await load()
}
</script>

<template>
  <div class="page-head">
    <div>
      <span class="eyebrow">Direction</span>
      <h1>Matériaux</h1>
      <p class="muted lead">Les feuilles que l’atelier reçoit : matière, coloris, format, et les codes-barres du fournisseur qui permettent de les reconnaître au scan.</p>
    </div>
    <div class="head-actions">
      <button class="btn" type="button" :aria-pressed="archivees" @click="basculerArchivees">{{ archivees ? 'Voir les références en service' : 'Voir les archivées' }}</button>
      <button v-if="!archivees" class="btn primary" type="button" aria-controls="ajout" :aria-expanded="ajout" @click="ouvrirAjout"><AppIcon name="plus" :size="16" />Ajouter une référence</button>
    </div>
  </div>

  <p v-if="info" class="alert ok" role="status">{{ info }}</p>
  <p v-if="error" class="alert bad" role="alert">{{ error }}</p>

  <section v-if="ajout" id="ajout" class="card new" aria-labelledby="ajout-titre">
    <h2 id="ajout-titre">Nouvelle référence</h2>
    <p class="muted hint">
      Saisissez librement la matière, l’épaisseur et le coloris : ce qui n’existe pas encore au catalogue y est créé (à prix zéro, inactif), à compléter dans « Tarifs et catalogue ». Le stock démarre
      à zéro : l’atelier ajoute les feuilles à la réception.
    </p>
    <form class="grid" novalidate @submit.prevent="add">
      <div class="field">
        <label for="m-matiere">Matière</label>
        <input
          id="m-matiere"
          v-model="draft.matiere"
          class="input"
          list="m-matieres"
          maxlength="60"
          autocomplete="off"
          placeholder="Aluminium"
          :class="{ invalid: errors.matiere }"
          :aria-invalid="!!errors.matiere"
        />
        <datalist id="m-matieres"><option v-for="m in matieres" :key="m" :value="m" /></datalist>
        <span v-if="errors.matiere" class="field-error">{{ errors.matiere }}</span>
      </div>
      <div class="field">
        <label for="m-epaisseur">Épaisseur (mm)</label>
        <input
          id="m-epaisseur"
          v-model="draft.epaisseur"
          class="input mono"
          list="m-epaisseurs"
          inputmode="decimal"
          autocomplete="off"
          placeholder="1,5"
          :class="{ invalid: errors.epaisseur }"
          :aria-invalid="!!errors.epaisseur"
        />
        <datalist id="m-epaisseurs"><option v-for="e in epaisseurs" :key="e" :value="e" /></datalist>
        <span v-if="errors.epaisseur" class="field-error">{{ errors.epaisseur }}</span>
      </div>
      <div class="field">
        <label for="m-coloris">Coloris (vide = brut, sans laquage)</label>
        <input
          id="m-coloris"
          v-model="draft.coloris"
          class="input"
          list="m-coloris-liste"
          maxlength="60"
          autocomplete="off"
          placeholder="Gris anthracite"
          :class="{ invalid: errors.coloris }"
          :aria-invalid="!!errors.coloris"
        />
        <datalist id="m-coloris-liste"><option v-for="c in colorisConnus" :key="c" :value="c" /></datalist>
        <span v-if="errors.coloris" class="field-error">{{ errors.coloris }}</span>
      </div>
      <div class="field">
        <label for="m-reference">Référence du coloris (RAL…)</label>
        <input id="m-reference" v-model="draft.reference" class="input mono" list="m-references" maxlength="40" autocomplete="off" placeholder="RAL 7016" :disabled="!draft.coloris.trim()" />
        <datalist id="m-references"><option v-for="r in references" :key="r" :value="r" /></datalist>
      </div>
      <div class="field">
        <label for="m-largeur">Largeur (mm)</label>
        <input id="m-largeur" v-model="draft.largeur" class="input mono" inputmode="numeric" :class="{ invalid: errors.largeur }" :aria-invalid="!!errors.largeur" />
        <span v-if="errors.largeur" class="field-error">{{ errors.largeur }}</span>
      </div>
      <div class="field">
        <label for="m-longueur">Longueur (mm)</label>
        <input id="m-longueur" v-model="draft.longueur" class="input mono" inputmode="numeric" :class="{ invalid: errors.longueur }" :aria-invalid="!!errors.longueur" />
        <span v-if="errors.longueur" class="field-error">{{ errors.longueur }}</span>
      </div>
      <div class="field wide">
        <label for="m-code">Code-barres du fournisseur (facultatif)</label>
        <CodeField id="m-code" v-model="draft.code" :invalid="!!errors.code" />
        <span v-if="errors.code" class="field-error">{{ errors.code }}</span>
      </div>
      <p class="actions">
        <button class="btn primary" type="submit" :disabled="adding || !draft.matiere.trim()">Ajouter la référence</button>
        <button class="btn" type="button" @click="ouvrirAjout">Annuler</button>
      </p>
    </form>
  </section>

  <section v-if="feuilles.length" class="card filtres" aria-label="Recherche">
    <label for="m-filtre">Chercher une référence ou un code</label>
    <input id="m-filtre" v-model="filtre" class="input" placeholder="Aluminium, Blanc, 1 250, 3760…" autocomplete="off" />
  </section>

  <p v-if="loading" class="muted">Chargement…</p>
  <div v-else-if="!feuilles.length" class="card empty">
    <p>{{ archivees ? 'Aucune référence archivée.' : 'Aucune référence pour l’instant.' }}</p>
    <p v-if="!archivees" class="muted">Ajoutez la première : une matière, un coloris, un format et le code-barres de son emballage.</p>
  </div>

  <ul v-else class="refs" aria-label="Références de feuilles">
    <li v-for="f in visibles" :key="f.id" class="card ref">
      <div class="ref-main">
        <span v-if="f.coloris" class="swatch" :style="{ background: f.hex ?? undefined }" aria-hidden="true" />
        <div class="ref-id">
          <b>{{ f.matiere }}</b> <span class="sub">{{ fmt(f.epaisseur) }} mm</span>
          <div class="muted">{{ f.coloris ? `${f.coloris} · ${f.reference}` : 'Brut, sans laquage' }}</div>
        </div>
        <span class="format mono">{{ fmt(f.largeur) }} × {{ fmt(f.longueur) }} mm{{ f.chute ? ' (chute)' : '' }}</span>
        <span class="muted stock">{{ fmt(f.quantite) }} en stock</span>
        <div class="ref-actions">
          <button v-if="!f.archivee" class="btn small" type="button" :aria-expanded="ouvert === f.id" :aria-label="`Codes-barres : ${f.libelle}`" @click="ouvert = ouvert === f.id ? null : f.id">
            <AppIcon name="tag" :size="14" />Codes-barres{{ f.codes?.length ? ` (${f.codes.length})` : '' }}
          </button>
          <button v-if="f.archivee" class="btn small" type="button" :aria-label="`Désarchiver la référence ${f.libelle}`" @click="archiver(f, false)">Désarchiver</button>
          <button v-else-if="!f.quantite" class="btn small" type="button" :aria-label="`Archiver la référence ${f.libelle}`" @click="archiver(f, true)">
            <AppIcon name="inbox" :size="14" />Archiver
          </button>
        </div>
      </div>
      <SheetCodes v-if="ouvert === f.id" :feuille="f" @changed="load" />
    </li>
    <li v-if="!visibles.length" class="muted">Aucune référence ne correspond.</li>
  </ul>
</template>

<style scoped>
.head-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.lead {
  max-width: 60ch;
  margin: 4px 0 0;
}
.new,
.filtres,
.empty {
  display: grid;
  gap: 12px;
  padding: 20px;
}
h2 {
  margin: 0;
  font-size: 1.15rem;
  text-transform: none;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px;
}
.field {
  display: grid;
  gap: 6px;
  align-content: start;
}
.field.wide,
.actions {
  grid-column: 1 / -1;
}
.actions {
  display: flex;
  gap: 10px;
  margin: 0;
}
.field-error {
  color: var(--danger, #b42318);
  font-size: 0.85rem;
}
.refs {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
}
.ref {
  display: grid;
  gap: 12px;
  padding: 14px 16px;
}
.ref-main {
  display: grid;
  grid-template-columns: auto minmax(0, 1.6fr) minmax(0, 1fr) minmax(0, 0.7fr) auto;
  gap: 12px 16px;
  align-items: center;
}
.swatch {
  width: 22px;
  height: 22px;
  border-radius: 5px;
  border: 1px solid var(--line);
}
.ref-id .sub {
  color: var(--muted);
}
.ref-actions {
  display: flex;
  gap: 8px;
  justify-self: end;
}
@media (max-width: 800px) {
  .ref-main {
    grid-template-columns: auto minmax(0, 1fr);
  }
  .format,
  .stock,
  .ref-actions {
    grid-column: 2;
    justify-self: start;
  }
}
</style>
