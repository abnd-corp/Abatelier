<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { api, ApiError } from '@/api'
import AppIcon from '@/components/AppIcon.vue'
import { jour } from '@/lib/espace'
import { ETAT_LABELS, MOTIFS, MOTIFS_ENTREE, MOTIFS_SORTIE, type EtatStock, type Feuille, type Motif, type Mouvement, type StockOptions, type StockTotaux } from '@/lib/stock'

// Stock de feuilles de l'atelier : ce qu'il y a (matière, épaisseur, coloris, format), les entrées et sorties, l'inventaire.
// Les chutes sont des feuilles comme les autres, marquées « chute » : le conseil de découpe les utilise en premier.
const feuilles = ref<Feuille[]>([])
const totaux = ref<StockTotaux>({ references: 0, feuillesEntieres: 0, chutes: 0, m2Entieres: 0, m2Chutes: 0, bas: 0 })
const options = ref<StockOptions>({ materials: [], colors: [] })
const mouvements = ref<Mouvement[]>([])
const loading = ref(true)
const error = ref('')
const info = ref('')

async function load() {
  try {
    const [f, m] = await Promise.all([api<{ feuilles: Feuille[]; totaux: StockTotaux }>('/stock/feuilles'), api<{ mouvements: Mouvement[] }>('/stock/mouvements')])
    feuilles.value = f.feuilles
    totaux.value = f.totaux
    mouvements.value = m.mouvements
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Chargement impossible.'
  } finally {
    loading.value = false
  }
}
onMounted(async () => {
  await load()
  try {
    options.value = await api<StockOptions>('/stock/options')
  } catch {
    /* le formulaire d'ajout restera vide : l'erreur de chargement est déjà affichée */
  }
})

// --- Ajouter des feuilles ou des chutes : deux boutons, deux informations différentes ---
// Une chute n'est pas une feuille (un morceau de dimensions quelconques, parfois trop petit pour être
// réutilisé) : on garde un seul formulaire, mais pas les mêmes valeurs de départ ni le même intitulé.
const ajoutType = ref<'entiere' | 'chute' | null>(null)
const histOuvert = ref(false)
const draft = reactive({ materialId: '', colorId: '', largeur: '1250', longueur: '3000', quantite: '0', seuil: '0', chute: false, note: '' })
const errors = reactive<Record<string, string>>({})
const adding = ref(false)
const num = (v: string) => (v.trim() === '' ? NaN : Number(v.replace(',', '.')))

function ouvrirAjout(type: 'entiere' | 'chute') {
  if (ajoutType.value === type) {
    ajoutType.value = null
    return
  }
  ajoutType.value = type
  for (const k of Object.keys(errors)) delete errors[k]
  Object.assign(draft, {
    materialId: '',
    colorId: '',
    largeur: type === 'entiere' ? '1250' : '',
    longueur: type === 'entiere' ? '3000' : '',
    quantite: '0',
    seuil: '0',
    chute: type === 'chute',
    note: '',
  })
}

async function add() {
  for (const k of Object.keys(errors)) delete errors[k]
  error.value = ''
  info.value = ''
  adding.value = true
  try {
    await api('/stock/feuilles', {
      method: 'POST',
      body: {
        materialId: draft.materialId,
        colorId: draft.colorId || null,
        largeur: num(draft.largeur),
        longueur: num(draft.longueur),
        quantite: num(draft.quantite),
        seuil: num(draft.seuil),
        chute: draft.chute,
        note: draft.note,
      },
    })
    info.value = draft.chute ? 'Chute ajoutée au stock.' : 'Feuille ajoutée au stock.'
    Object.assign(draft, { quantite: '0', seuil: '0', note: '' })
    ajoutType.value = null
    await load()
  } catch (e) {
    if (e instanceof ApiError && e.field) errors[e.field] = e.message
    else error.value = e instanceof ApiError ? e.message : 'Enregistrement impossible.'
  } finally {
    adding.value = false
  }
}

// --- Ajuster le stock (entrée, sortie ou inventaire) et noter une instruction : un seul panneau par carte à la fois ---
type Mode = 'entree' | 'sortie' | 'inventaire'
type Panel = 'ajuster' | 'note'
const openPanel = ref<{ id: string; panel: Panel } | null>(null)
const estOuvert = (f: Feuille, panel: Panel) => openPanel.value?.id === f.id && openPanel.value.panel === panel

const move = reactive({ mode: 'entree' as Mode, valeur: '', motif: 'reception' as Motif, note: '', erreur: '', busy: false })
function choisirMode(f: Feuille, mode: Mode) {
  Object.assign(move, {
    mode,
    valeur: mode === 'inventaire' ? String(f.quantite) : '',
    motif: mode === 'entree' ? 'reception' : mode === 'sortie' ? 'fabrication' : 'inventaire',
    note: '',
    erreur: '',
  })
}
function ouvrirAjuster(f: Feuille) {
  openPanel.value = estOuvert(f, 'ajuster') ? null : { id: f.id, panel: 'ajuster' }
  if (openPanel.value) choisirMode(f, 'entree')
}
const motifs = computed(() => (move.mode === 'entree' ? MOTIFS_ENTREE : move.mode === 'sortie' ? MOTIFS_SORTIE : (['inventaire'] as Motif[])))

async function appliquer(f: Feuille) {
  move.erreur = ''
  const v = num(move.valeur)
  if (!Number.isInteger(v) || v < 0 || (move.mode !== 'inventaire' && v === 0)) {
    move.erreur = move.mode === 'inventaire' ? 'Indiquez la quantité comptée (0 ou plus).' : 'Indiquez un nombre de feuilles supérieur à 0.'
    return
  }
  move.busy = true
  info.value = ''
  try {
    const body = move.mode === 'inventaire' ? { quantite: v, motif: move.motif, note: move.note } : { delta: move.mode === 'sortie' ? -v : v, motif: move.motif, note: move.note }
    const r = await api<{ quantite: number; bas: boolean }>(`/stock/feuilles/${f.id}/mouvement`, { method: 'POST', body })
    info.value = `Stock mis à jour : ${r.quantite} feuille${r.quantite > 1 ? 's' : ''}${r.bas ? ' (stock bas)' : ''}.`
    openPanel.value = null
    await load()
  } catch (e) {
    move.erreur = e instanceof ApiError ? e.message : 'Mouvement impossible.'
  } finally {
    move.busy = false
  }
}

// --- Note : une petite instruction (rack, palette, fournisseur…), cachée derrière un bouton ---
const noteDraft = reactive({ valeur: '', busy: false })
function ouvrirNote(f: Feuille) {
  openPanel.value = estOuvert(f, 'note') ? null : { id: f.id, panel: 'note' }
  if (openPanel.value) Object.assign(noteDraft, { valeur: f.note, busy: false })
}
async function validerNote(f: Feuille) {
  noteDraft.busy = true
  await patch(f, { note: noteDraft.valeur })
  noteDraft.busy = false
  openPanel.value = null
}

// --- Supprimer une référence vide ---
async function supprimer(f: Feuille) {
  error.value = ''
  info.value = ''
  try {
    await api(`/stock/feuilles/${f.id}`, { method: 'DELETE' })
    info.value = 'Référence supprimée.'
    await load()
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Suppression impossible.'
  }
}

// --- Seuil et note ---
async function patch(f: Feuille, body: Record<string, unknown>) {
  error.value = ''
  try {
    await api(`/stock/feuilles/${f.id}`, { method: 'PATCH', body })
    await load()
  } catch (e) {
    error.value = e instanceof ApiError ? `${f.libelle} : ${e.message}` : 'Modification impossible.'
    await load()
  }
}
const onSeuil = (f: Feuille, ev: Event) => patch(f, { seuil: Number((ev.target as HTMLInputElement).value) || 0 })

// --- Filtres détaillés : un champ par paramètre, plutôt qu'un seul filtre par type (R7) ---
const filtres = reactive({ matiere: '', epaisseur: '', couleur: '', format: '', etat: '' as '' | EtatStock })
const sorted = (arr: string[]) => [...new Set(arr)].sort((a, b) => a.localeCompare(b, 'fr'))
const matiereOptions = computed(() => sorted(feuilles.value.map((f) => f.matiere)))
const epaisseurOptions = computed(() => [...new Set(feuilles.value.map((f) => f.epaisseur))].sort((a, b) => a - b))
const couleurOptions = computed(() => {
  const seen = new Map<string, { id: string; label: string }>()
  for (const f of feuilles.value) if (f.colorId && !seen.has(f.colorId)) seen.set(f.colorId, { id: f.colorId, label: f.coloris! })
  return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label, 'fr'))
})
const formatOptions = computed(() => sorted(feuilles.value.map((f) => `${f.largeur}×${f.longueur}`)))
const ETATS: EtatStock[] = ['vide', 'critique', 'bas', 'ok']

const visibles = computed(() =>
  feuilles.value.filter(
    (f) =>
      (!filtres.matiere || f.matiere === filtres.matiere) &&
      (!filtres.epaisseur || String(f.epaisseur) === filtres.epaisseur) &&
      (!filtres.couleur || (filtres.couleur === 'brut' ? !f.colorId : f.colorId === filtres.couleur)) &&
      (!filtres.format || `${f.largeur}×${f.longueur}` === filtres.format) &&
      (!filtres.etat || f.etat === filtres.etat),
  ),
)
// Deux sections : les feuilles entières, et les chutes (représentées à part, avec leurs dimensions)
const entieres = computed(() => visibles.value.filter((f) => !f.chute))
const chutes = computed(() => visibles.value.filter((f) => f.chute))
const filtresActifs = computed(() => Object.values(filtres).some(Boolean))
function reinitialiserFiltres() {
  Object.assign(filtres, { matiere: '', epaisseur: '', couleur: '', format: '', etat: '' })
}

const ETAT_PILL: Record<EtatStock, string> = { vide: 'vide', critique: 'bad', bas: 'warn', ok: 'ok' }
const heure = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
const fmt = (n: number) => n.toLocaleString('fr-FR')
</script>

<template>
  <div class="page-head">
    <div>
      <span class="eyebrow">Atelier</span>
      <h1>Stock de feuilles</h1>
    </div>
  </div>

  <p v-if="error" class="alert bad" role="alert">{{ error }}</p>
  <p v-if="info" class="alert ok" role="status">{{ info }}</p>

  <dl class="totaux" aria-label="Résumé du stock">
    <div>
      <dt>Références</dt>
      <dd>{{ fmt(totaux.references) }}</dd>
    </div>
    <div>
      <dt>Feuilles entières</dt>
      <dd>
        {{ fmt(totaux.feuillesEntieres) }} <span class="sub">{{ fmt(totaux.m2Entieres) }} m²</span>
      </dd>
    </div>
    <div>
      <dt>Chutes</dt>
      <dd>
        {{ fmt(totaux.chutes) }} <span class="sub">{{ fmt(totaux.m2Chutes) }} m²</span>
      </dd>
    </div>
    <div :class="{ alerte: totaux.bas }">
      <dt>Stock bas</dt>
      <dd>{{ totaux.bas }}</dd>
    </div>
  </dl>

  <div class="bar">
    <button class="btn primary" type="button" aria-controls="ajout" :aria-expanded="ajoutType === 'entiere'" @click="ouvrirAjout('entiere')">
      <AppIcon :name="ajoutType === 'entiere' ? 'x' : 'plus'" :size="16" /> {{ ajoutType === 'entiere' ? 'Fermer le formulaire' : 'Ajouter des feuilles' }}
    </button>
    <button class="btn" type="button" aria-controls="ajout" :aria-expanded="ajoutType === 'chute'" @click="ouvrirAjout('chute')">
      <AppIcon :name="ajoutType === 'chute' ? 'x' : 'plus'" :size="16" /> {{ ajoutType === 'chute' ? 'Fermer le formulaire' : 'Ajouter des chutes' }}
    </button>
  </div>

  <section v-if="ajoutType" id="ajout" class="card new" aria-labelledby="ajout-titre">
    <h2 id="ajout-titre">{{ ajoutType === 'chute' ? 'Ajouter des chutes' : 'Ajouter des feuilles' }}</h2>
    <p class="muted hint">
      {{
        ajoutType === 'chute'
          ? 'Un morceau récupéré d’une feuille entamée : ses dimensions réelles, pas un format standard. Gardez-la même si elle est petite, tant qu’elle peut encore servir.'
          : 'Une ligne par matière, épaisseur, coloris et format standard. La matière et son épaisseur viennent du catalogue de la direction ; si elle manque, demandez-lui de l’ajouter dans « Tarifs et catalogue ».'
      }}
    </p>
    <form class="grid" novalidate @submit.prevent="add">
      <div class="field">
        <label for="s-matiere">Matière et épaisseur</label>
        <select
          id="s-matiere"
          v-model="draft.materialId"
          class="input"
          :class="{ invalid: errors.materialId }"
          :aria-invalid="!!errors.materialId"
          :aria-describedby="errors.materialId ? 's-matiere-e' : undefined"
        >
          <option value="" disabled>Choisir…</option>
          <option v-for="m in options.materials" :key="m.id" :value="m.id">{{ m.label }}</option>
        </select>
        <span v-if="errors.materialId" id="s-matiere-e" class="field-error">{{ errors.materialId }}</span>
      </div>
      <div class="field">
        <label for="s-coloris">Coloris</label>
        <select id="s-coloris" v-model="draft.colorId" class="input">
          <option value="">Brut, sans laquage</option>
          <option v-for="c in options.colors" :key="c.id" :value="c.id">{{ c.label }}</option>
        </select>
      </div>
      <div class="field">
        <label for="s-largeur">Largeur (mm)</label>
        <input
          id="s-largeur"
          v-model="draft.largeur"
          class="input mono"
          inputmode="numeric"
          :class="{ invalid: errors.largeur }"
          :aria-invalid="!!errors.largeur"
          :aria-describedby="errors.largeur ? 's-largeur-e' : undefined"
        />
        <span v-if="errors.largeur" id="s-largeur-e" class="field-error">{{ errors.largeur }}</span>
      </div>
      <div class="field">
        <label for="s-longueur">Longueur (mm)</label>
        <input
          id="s-longueur"
          v-model="draft.longueur"
          class="input mono"
          inputmode="numeric"
          :class="{ invalid: errors.longueur }"
          :aria-invalid="!!errors.longueur"
          :aria-describedby="errors.longueur ? 's-longueur-e' : undefined"
        />
        <span v-if="errors.longueur" id="s-longueur-e" class="field-error">{{ errors.longueur }}</span>
      </div>
      <div class="field">
        <label for="s-quantite">Quantité en stock</label>
        <input id="s-quantite" v-model="draft.quantite" class="input mono" inputmode="numeric" :class="{ invalid: errors.quantite }" :aria-invalid="!!errors.quantite" />
        <span v-if="errors.quantite" class="field-error">{{ errors.quantite }}</span>
      </div>
      <div v-if="ajoutType !== 'chute'" class="field">
        <label for="s-seuil">Alerte stock bas (0 = aucune)</label>
        <input id="s-seuil" v-model="draft.seuil" class="input mono" inputmode="numeric" />
        <span v-if="errors.seuil" class="field-error">{{ errors.seuil }}</span>
      </div>
      <div class="field wide">
        <label for="s-note">{{ ajoutType === 'chute' ? 'Note (pièce d’origine, découpe…)' : 'Note (rack, palette, fournisseur…)' }}</label>
        <input id="s-note" v-model="draft.note" class="input" maxlength="300" autocomplete="off" />
      </div>
      <p class="actions">
        <button class="btn primary" type="submit" :disabled="adding"><AppIcon name="plus" :size="16" /> {{ ajoutType === 'chute' ? 'Ajouter la chute' : 'Ajouter au stock' }}</button>
      </p>
    </form>
  </section>

  <section v-if="feuilles.length" class="card filtres" aria-label="Filtres">
    <div class="field">
      <label for="f-matiere">Matière</label>
      <select id="f-matiere" v-model="filtres.matiere" class="input">
        <option value="">Toutes</option>
        <option v-for="m in matiereOptions" :key="m" :value="m">{{ m }}</option>
      </select>
    </div>
    <div class="field">
      <label for="f-epaisseur">Épaisseur</label>
      <select id="f-epaisseur" v-model="filtres.epaisseur" class="input">
        <option value="">Toutes</option>
        <option v-for="e in epaisseurOptions" :key="e" :value="String(e)">{{ fmt(e) }} mm</option>
      </select>
    </div>
    <div class="field">
      <label for="f-couleur">Coloris</label>
      <select id="f-couleur" v-model="filtres.couleur" class="input">
        <option value="">Tous</option>
        <option value="brut">Brut</option>
        <option v-for="c in couleurOptions" :key="c.id" :value="c.id">{{ c.label }}</option>
      </select>
    </div>
    <div class="field">
      <label for="f-format">Format</label>
      <select id="f-format" v-model="filtres.format" class="input">
        <option value="">Tous</option>
        <option v-for="fo in formatOptions" :key="fo" :value="fo">{{ fo }} mm</option>
      </select>
    </div>
    <div class="field">
      <label for="f-etat">État</label>
      <select id="f-etat" v-model="filtres.etat" class="input">
        <option value="">Tous</option>
        <option v-for="e in ETATS" :key="e" :value="e">{{ ETAT_LABELS[e] }}</option>
      </select>
    </div>
    <button v-if="filtresActifs" class="btn small reset" type="button" @click="reinitialiserFiltres"><AppIcon name="x" :size="14" />Réinitialiser les filtres</button>
  </section>

  <div v-if="!loading && !feuilles.length" class="card empty">
    <AppIcon name="layers" :size="32" class="muted" />
    <p><b>Aucune feuille en stock pour l’instant.</b></p>
    <p class="muted">Ajoutez vos feuilles ci-dessus : l’atelier saura quelle feuille prendre pour chaque commande.</p>
  </div>

  <template v-else>
    <section aria-labelledby="entieres-titre">
      <h2 id="entieres-titre" class="section-titre">
        Feuilles entières <span class="muted">({{ entieres.length }})</span>
      </h2>
      <p v-if="feuilles.length && !entieres.length" class="muted vide-filtre">Aucune feuille entière avec ces filtres.</p>
      <div v-else class="cards">
        <article v-for="f in entieres" :key="f.id" class="sheet-card" :class="f.etat">
          <div class="top">
            <div class="qty">
              <b class="mono">{{ fmt(f.quantite) }}</b> <span class="unit muted">feuille{{ f.quantite > 1 ? 's' : '' }}</span>
            </div>
            <span class="pill" :class="ETAT_PILL[f.etat]">{{ ETAT_LABELS[f.etat] }}</span>
          </div>
          <div class="id">
            <span v-if="f.coloris" class="swatch" :style="{ background: f.hex ?? undefined }" aria-hidden="true" />
            <div>
              <b>{{ f.matiere }}</b> <span class="sub">{{ fmt(f.epaisseur) }} mm</span>
              <div class="muted coloris">{{ f.coloris ? `${f.coloris} · ${f.reference}` : 'Brut, sans laquage' }}</div>
            </div>
          </div>
          <p class="format mono">{{ fmt(f.largeur) }} × {{ fmt(f.longueur) }} mm</p>
          <label class="mini seuil"
            >Alerte stock bas<input class="input compact" inputmode="numeric" :aria-label="`Alerte stock bas de ${f.libelle}`" :value="f.seuil" @change="onSeuil(f, $event)"
          /></label>
          <p v-if="f.note" class="muted note-apercu">{{ f.note }}</p>

          <div class="card-actions">
            <button class="btn small" type="button" :aria-expanded="estOuvert(f, 'ajuster')" :aria-label="`Ajuster le stock : ${f.libelle}`" @click="ouvrirAjuster(f)">Ajuster le stock</button>
            <button class="btn small" type="button" :aria-expanded="estOuvert(f, 'note')" :aria-label="`${f.note ? 'Modifier la' : 'Ajouter une'} note : ${f.libelle}`" @click="ouvrirNote(f)">
              {{ f.note ? 'Modifier la note' : 'Ajouter une note' }}
            </button>
            <button v-if="!f.quantite" class="btn small danger" type="button" :aria-label="`Supprimer la référence ${f.libelle}`" @click="supprimer(f)">
              <AppIcon name="trash" :size="14" />
            </button>
          </div>

          <form v-if="estOuvert(f, 'ajuster')" class="move" novalidate @submit.prevent="appliquer(f)">
            <div class="field wide">
              <span class="mode-label muted">Mouvement</span>
              <div class="chips" role="radiogroup" :aria-label="`Mouvement pour ${f.libelle}`">
                <button type="button" class="chip" :aria-pressed="move.mode === 'entree'" @click="choisirMode(f, 'entree')">Entrée</button>
                <button type="button" class="chip" :aria-pressed="move.mode === 'sortie'" @click="choisirMode(f, 'sortie')">Sortie</button>
                <button type="button" class="chip" :aria-pressed="move.mode === 'inventaire'" @click="choisirMode(f, 'inventaire')">Compter</button>
              </div>
            </div>
            <div class="field">
              <label :for="`m-${f.id}`">{{ move.mode === 'entree' ? 'Feuilles reçues' : move.mode === 'sortie' ? 'Feuilles sorties' : 'Quantité comptée' }}</label>
              <input :id="`m-${f.id}`" v-model="move.valeur" class="input mono" inputmode="numeric" :aria-invalid="!!move.erreur" :aria-describedby="move.erreur ? `m-${f.id}-e` : undefined" />
            </div>
            <div v-if="move.mode !== 'inventaire'" class="field">
              <label :for="`mm-${f.id}`">Motif</label>
              <select :id="`mm-${f.id}`" v-model="move.motif" class="input">
                <option v-for="m in motifs" :key="m" :value="m">{{ MOTIFS[m] }}</option>
              </select>
            </div>
            <div class="field grow">
              <label :for="`mn-${f.id}`">Note (n° de commande, fournisseur…)</label>
              <input :id="`mn-${f.id}`" v-model="move.note" class="input" maxlength="300" autocomplete="off" />
            </div>
            <div class="move-actions">
              <button class="btn primary" type="submit" :disabled="move.busy">Valider</button>
              <button class="btn" type="button" @click="openPanel = null">Annuler</button>
            </div>
            <span v-if="move.erreur" :id="`m-${f.id}-e`" class="field-error full" role="alert">{{ move.erreur }}</span>
          </form>

          <form v-if="estOuvert(f, 'note')" class="move" novalidate @submit.prevent="validerNote(f)">
            <div class="field wide">
              <label :for="`note-${f.id}`">Note (petite instruction : rack, palette, fournisseur…)</label>
              <input :id="`note-${f.id}`" v-model="noteDraft.valeur" class="input" maxlength="300" autocomplete="off" />
            </div>
            <div class="move-actions">
              <button class="btn primary" type="submit" :disabled="noteDraft.busy">Valider</button>
              <button class="btn" type="button" @click="openPanel = null">Annuler</button>
            </div>
          </form>
        </article>
      </div>
    </section>

    <section aria-labelledby="chutes-titre">
      <h2 id="chutes-titre" class="section-titre">
        Chutes <span class="muted">({{ chutes.length }})</span>
      </h2>
      <p v-if="feuilles.length && !chutes.length" class="muted vide-filtre">Aucune chute avec ces filtres.</p>
      <div v-else class="cards">
        <article v-for="f in chutes" :key="f.id" class="sheet-card" :class="f.etat">
          <div class="top">
            <div class="qty">
              <b class="mono">{{ fmt(f.quantite) }}</b> <span class="unit muted">morceau{{ f.quantite > 1 ? 'x' : '' }}</span>
            </div>
            <span class="pill" :class="ETAT_PILL[f.etat]">{{ ETAT_LABELS[f.etat] }}</span>
          </div>
          <div class="id">
            <span v-if="f.coloris" class="swatch" :style="{ background: f.hex ?? undefined }" aria-hidden="true" />
            <div>
              <b>{{ f.matiere }}</b> <span class="sub">{{ fmt(f.epaisseur) }} mm</span>
              <div class="muted coloris">{{ f.coloris ? `${f.coloris} · ${f.reference}` : 'Brut, sans laquage' }}</div>
            </div>
          </div>
          <p class="format mono">{{ fmt(f.largeur) }} × {{ fmt(f.longueur) }} mm</p>
          <!-- Pas d'alerte sur une chute : elle n'est pas réapprovisionnée, juste reçue comme sous-produit de la découpe -->
          <p v-if="f.note" class="muted note-apercu">{{ f.note }}</p>

          <div class="card-actions">
            <button class="btn small" type="button" :aria-expanded="estOuvert(f, 'ajuster')" :aria-label="`Ajuster le stock : ${f.libelle}`" @click="ouvrirAjuster(f)">Ajuster le stock</button>
            <button class="btn small" type="button" :aria-expanded="estOuvert(f, 'note')" :aria-label="`${f.note ? 'Modifier la' : 'Ajouter une'} note : ${f.libelle}`" @click="ouvrirNote(f)">
              {{ f.note ? 'Modifier la note' : 'Ajouter une note' }}
            </button>
            <button v-if="!f.quantite" class="btn small danger" type="button" :aria-label="`Supprimer la référence ${f.libelle}`" @click="supprimer(f)">
              <AppIcon name="trash" :size="14" />
            </button>
          </div>

          <form v-if="estOuvert(f, 'ajuster')" class="move" novalidate @submit.prevent="appliquer(f)">
            <div class="field wide">
              <span class="mode-label muted">Mouvement</span>
              <div class="chips" role="radiogroup" :aria-label="`Mouvement pour ${f.libelle}`">
                <button type="button" class="chip" :aria-pressed="move.mode === 'entree'" @click="choisirMode(f, 'entree')">Entrée</button>
                <button type="button" class="chip" :aria-pressed="move.mode === 'sortie'" @click="choisirMode(f, 'sortie')">Sortie</button>
                <button type="button" class="chip" :aria-pressed="move.mode === 'inventaire'" @click="choisirMode(f, 'inventaire')">Compter</button>
              </div>
            </div>
            <div class="field">
              <label :for="`m-${f.id}`">{{ move.mode === 'entree' ? 'Morceaux reçus' : move.mode === 'sortie' ? 'Morceaux sortis' : 'Quantité comptée' }}</label>
              <input :id="`m-${f.id}`" v-model="move.valeur" class="input mono" inputmode="numeric" :aria-invalid="!!move.erreur" :aria-describedby="move.erreur ? `m-${f.id}-e` : undefined" />
            </div>
            <div v-if="move.mode !== 'inventaire'" class="field">
              <label :for="`mm-${f.id}`">Motif</label>
              <select :id="`mm-${f.id}`" v-model="move.motif" class="input">
                <option v-for="m in motifs" :key="m" :value="m">{{ MOTIFS[m] }}</option>
              </select>
            </div>
            <div class="field grow">
              <label :for="`mn-${f.id}`">Note (n° de commande, fournisseur…)</label>
              <input :id="`mn-${f.id}`" v-model="move.note" class="input" maxlength="300" autocomplete="off" />
            </div>
            <div class="move-actions">
              <button class="btn primary" type="submit" :disabled="move.busy">Valider</button>
              <button class="btn" type="button" @click="openPanel = null">Annuler</button>
            </div>
            <span v-if="move.erreur" :id="`m-${f.id}-e`" class="field-error full" role="alert">{{ move.erreur }}</span>
          </form>

          <form v-if="estOuvert(f, 'note')" class="move" novalidate @submit.prevent="validerNote(f)">
            <div class="field wide">
              <label :for="`note-${f.id}`">Note (petite instruction : pièce d’origine, découpe…)</label>
              <input :id="`note-${f.id}`" v-model="noteDraft.valeur" class="input" maxlength="300" autocomplete="off" />
            </div>
            <div class="move-actions">
              <button class="btn primary" type="submit" :disabled="noteDraft.busy">Valider</button>
              <button class="btn" type="button" @click="openPanel = null">Annuler</button>
            </div>
          </form>
        </article>
      </div>
    </section>
  </template>

  <section v-if="mouvements.length" class="card hist" aria-labelledby="hist">
    <h2 id="hist">
      <button class="fold" type="button" aria-controls="hist-liste" :aria-expanded="histOuvert" @click="histOuvert = !histOuvert">
        <AppIcon :name="histOuvert ? 'chevron-up' : 'chevron-down'" :size="16" /> Derniers mouvements <span class="muted">({{ mouvements.length }})</span>
      </button>
    </h2>
    <ul v-if="histOuvert" id="hist-liste">
      <li v-for="m in mouvements" :key="m.id">
        <b class="mono delta" :class="m.delta > 0 ? 'plus' : 'moins'">{{ m.delta > 0 ? '+' : '−' }}{{ Math.abs(m.delta) }}</b>
        <span
          >{{ m.libelle
          }}<span class="sub"
            >{{ MOTIFS[m.motif] }}<template v-if="m.note"> · {{ m.note }}</template> · reste {{ m.apres }}</span
          ></span
        >
        <span class="muted when"
          >{{ jour(m.at) }} {{ heure(m.at) }}<template v-if="m.par"> · {{ m.par }}</template></span
        >
      </li>
    </ul>
  </section>
</template>

<style scoped>
.page-head {
  margin-bottom: 16px;
}
.card {
  margin-bottom: 16px;
}
.totaux {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin: 0 0 16px;
}
.totaux div {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r);
  padding: 12px 16px;
}
.totaux dt {
  color: var(--muted);
  font-size: 0.82rem;
}
.totaux dd {
  margin: 2px 0 0;
  font-family: var(--f-display);
  font-size: 1.5rem;
  font-weight: 700;
}
.totaux .sub {
  display: block;
  font-family: initial;
  font-size: 0.78rem;
  font-weight: 500;
  color: var(--muted);
}
.totaux .alerte {
  background: var(--warn-soft);
}
.totaux .alerte dd {
  color: var(--warn);
}
.new {
  padding: 18px 20px;
  display: grid;
  gap: 10px;
}
.new h2 {
  margin: 0;
  font-size: 1.1rem;
}
.bar {
  margin-bottom: 16px;
}
.fold {
  all: unset;
  cursor: pointer;
  display: inline-flex;
  gap: 8px;
  align-items: center;
  font: inherit;
  text-transform: inherit;
  letter-spacing: inherit;
}
.fold:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
  border-radius: 4px;
}
.hist h2 {
  margin: 0;
  font-size: 1.1rem;
}
.hint {
  font-size: 0.86rem;
  margin: 0;
}
.grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px 16px;
  align-items: end;
}
.grid .wide,
.grid .check,
.grid .actions {
  grid-column: 1 / -1;
}
.actions {
  margin: 0;
}
.check {
  display: flex;
  gap: 8px;
  align-items: center;
}
.swatch {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  border: 1px solid var(--line);
  flex: none;
}
.hist .sub {
  display: block;
}
.move {
  display: flex;
  gap: 12px;
  align-items: end;
  flex-wrap: wrap;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
}
.move .grow {
  flex: 1 1 220px;
}
.move .full {
  flex-basis: 100%;
}
.move-actions {
  display: flex;
  gap: 8px;
}
.empty {
  padding: 36px 20px;
  display: grid;
  justify-items: center;
  gap: 8px;
  text-align: center;
}

/* --- Filtres détaillés : un champ par paramètre --- */
.filtres {
  padding: 14px 16px;
  display: flex;
  gap: 12px 16px;
  flex-wrap: wrap;
  align-items: end;
}
.filtres .field {
  min-width: 150px;
  flex: 1 1 150px;
}
.filtres .reset {
  white-space: nowrap;
}

/* --- Sections et cartes --- */
.section-titre {
  font-size: 1rem;
  margin: 20px 0 10px;
}
.vide-filtre {
  padding: 16px;
}
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
  margin-bottom: 8px;
}
.sheet-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-left: 4px solid var(--line);
  border-radius: var(--r);
  padding: 14px 16px;
  display: grid;
  gap: 10px;
  align-content: start;
}
/* Couleur de l'état, décidée par l'API (jamais réglable ici) : noir vide, rouge critique, jaune bas, vert correct */
.sheet-card.vide {
  border-left-color: var(--ink);
}
.sheet-card.critique {
  border-left-color: var(--bad);
}
.sheet-card.bas {
  border-left-color: var(--warn);
}
.sheet-card.ok {
  border-left-color: var(--ok);
}
/* La quantité est la première chose qu'on voit sur la carte, en grand */
.sheet-card .top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
}
.sheet-card .qty {
  margin: 0;
  line-height: 1;
}
.sheet-card .qty b {
  font-family: var(--f-display);
  font-size: 2.2rem;
  font-weight: 700;
}
.sheet-card .qty .unit {
  font-size: 0.9rem;
  margin-left: 4px;
}
.sheet-card .id {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  min-width: 0;
}
.sheet-card .id .swatch {
  margin-top: 3px;
}
.sheet-card .coloris {
  font-size: 0.82rem;
}
.pill.vide {
  background: var(--ink);
  color: var(--surface);
  border-color: transparent;
}
.sheet-card .format {
  margin: 0;
  color: var(--muted);
  display: flex;
  align-items: center;
  gap: 8px;
}
.sheet-card .note-apercu {
  margin: 0;
  font-size: 0.84rem;
  font-style: italic;
}
.sheet-card .mini {
  display: grid;
  gap: 3px;
  font-size: 0.76rem;
  color: var(--muted);
}
.sheet-card .mini.seuil input {
  width: 76px;
}
.mode-label {
  display: block;
  font-size: 0.78rem;
  margin-bottom: 4px;
}
.card-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.card-actions .btn {
  white-space: nowrap;
}
.hist {
  padding: 18px 20px;
}
.hist ul {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  display: grid;
  gap: 8px;
}
.hist li {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: baseline;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--line);
}
.delta.plus {
  color: var(--ok);
}
.delta.moins {
  color: var(--bad);
}
.when {
  font-size: 0.84rem;
  white-space: nowrap;
}
@media (max-width: 860px) {
  .totaux {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
/* Téléphone : une carte par ligne, boutons à portée de pouce */
@media (max-width: 700px) {
  .cards {
    grid-template-columns: minmax(0, 1fr);
  }
  .filtres {
    flex-direction: column;
    align-items: stretch;
  }
  .filtres .field {
    min-width: 0;
  }
  .card-actions {
    justify-content: stretch;
  }
  .card-actions .btn {
    flex: 1 1 auto;
  }
}
@media (max-width: 560px) {
  .grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .hist li {
    grid-template-columns: 48px minmax(0, 1fr);
  }
  .when {
    grid-column: 2;
  }
}
</style>
