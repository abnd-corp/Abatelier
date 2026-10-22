<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { api, ApiError } from '@/api'
import AppIcon from '@/components/AppIcon.vue'
import { jour } from '@/lib/espace'
import { MOTIFS, MOTIFS_ENTREE, MOTIFS_SORTIE, type Feuille, type Motif, type Mouvement, type StockOptions, type StockTotaux } from '@/lib/stock'

// Stock de feuilles de l'atelier : ce qu'il y a (matière, épaisseur, coloris, format), les entrées et sorties, l'inventaire.
// Les chutes sont des feuilles comme les autres, marquées « chute » : le conseil de découpe les utilise en premier.
const feuilles = ref<Feuille[]>([])
const totaux = ref<StockTotaux>({ references: 0, feuilles: 0, m2: 0, bas: 0 })
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

// --- Ajouter une feuille : le formulaire reste fermé tant qu'on ne le demande pas ---
const ajoutOuvert = ref(false)
const histOuvert = ref(false)
const draft = reactive({ materialId: '', colorId: '', largeur: '1250', longueur: '3000', quantite: '0', seuil: '0', chute: false, note: '' })
const errors = reactive<Record<string, string>>({})
const adding = ref(false)
const num = (v: string) => (v.trim() === '' ? NaN : Number(v.replace(',', '.')))

async function add() {
  for (const k of Object.keys(errors)) delete errors[k]
  error.value = ''
  info.value = ''
  adding.value = true
  try {
    await api('/stock/feuilles', {
      method: 'POST',
      body: { materialId: draft.materialId, colorId: draft.colorId || null, largeur: num(draft.largeur), longueur: num(draft.longueur), quantite: num(draft.quantite), seuil: num(draft.seuil), chute: draft.chute, note: draft.note },
    })
    info.value = 'Feuille ajoutée au stock.'
    Object.assign(draft, { quantite: '0', seuil: '0', note: '' })
    ajoutOuvert.value = false
    await load()
  } catch (e) {
    if (e instanceof ApiError && e.field) errors[e.field] = e.message
    else error.value = e instanceof ApiError ? e.message : 'Enregistrement impossible.'
  } finally {
    adding.value = false
  }
}

// --- Entrées, sorties, inventaire d'une feuille ---
type Mode = 'entree' | 'sortie' | 'inventaire'
const open = ref<string | null>(null)
const move = reactive({ mode: 'entree' as Mode, valeur: '', motif: 'reception' as Motif, note: '', erreur: '', busy: false })
function ouvrir(f: Feuille, mode: Mode) {
  open.value = open.value === f.id && move.mode === mode ? null : f.id
  Object.assign(move, { mode, valeur: mode === 'inventaire' ? String(f.quantite) : '', motif: mode === 'entree' ? 'reception' : mode === 'sortie' ? 'fabrication' : 'inventaire', note: '', erreur: '' })
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
    open.value = null
    await load()
  } catch (e) {
    move.erreur = e instanceof ApiError ? e.message : 'Mouvement impossible.'
  } finally {
    move.busy = false
  }
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
const onNote = (f: Feuille, ev: Event) => patch(f, { note: (ev.target as HTMLInputElement).value })

// Filtre par matière
const filtre = ref('')
const visibles = computed(() => feuilles.value.filter((f) => !filtre.value || f.materialId === filtre.value))
const matieres = computed(() => options.value.materials.filter((m) => feuilles.value.some((f) => f.materialId === m.id)))
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
    <div><dt>Références</dt><dd>{{ fmt(totaux.references) }}</dd></div>
    <div><dt>Feuilles</dt><dd>{{ fmt(totaux.feuilles) }}</dd></div>
    <div><dt>Surface</dt><dd>{{ fmt(totaux.m2) }} m²</dd></div>
    <div :class="{ alerte: totaux.bas }"><dt>Stock bas</dt><dd>{{ totaux.bas }}</dd></div>
  </dl>

  <div class="bar">
    <button class="btn primary" type="button" aria-controls="ajout" :aria-expanded="ajoutOuvert" @click="ajoutOuvert = !ajoutOuvert"><AppIcon :name="ajoutOuvert ? 'x' : 'plus'" :size="16" /> {{ ajoutOuvert ? 'Fermer le formulaire' : 'Ajouter une feuille' }}</button>
  </div>

  <section v-if="ajoutOuvert" id="ajout" class="card new" aria-labelledby="ajout-titre">
    <h2 id="ajout-titre">Ajouter une feuille</h2>
    <p class="muted hint">Une ligne par matière, épaisseur, coloris et format. La matière et son épaisseur viennent du catalogue de la direction ; si elle manque, demandez-lui de l’ajouter dans « Tarifs et catalogue ».</p>
    <form class="grid" novalidate @submit.prevent="add">
      <div class="field">
        <label for="s-matiere">Matière et épaisseur</label>
        <select id="s-matiere" v-model="draft.materialId" class="input" :class="{ invalid: errors.materialId }" :aria-invalid="!!errors.materialId" :aria-describedby="errors.materialId ? 's-matiere-e' : undefined">
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
        <input id="s-largeur" v-model="draft.largeur" class="input mono" inputmode="numeric" :class="{ invalid: errors.largeur }" :aria-invalid="!!errors.largeur" :aria-describedby="errors.largeur ? 's-largeur-e' : undefined" />
        <span v-if="errors.largeur" id="s-largeur-e" class="field-error">{{ errors.largeur }}</span>
      </div>
      <div class="field">
        <label for="s-longueur">Longueur (mm)</label>
        <input id="s-longueur" v-model="draft.longueur" class="input mono" inputmode="numeric" :class="{ invalid: errors.longueur }" :aria-invalid="!!errors.longueur" :aria-describedby="errors.longueur ? 's-longueur-e' : undefined" />
        <span v-if="errors.longueur" id="s-longueur-e" class="field-error">{{ errors.longueur }}</span>
      </div>
      <div class="field">
        <label for="s-quantite">Quantité en stock</label>
        <input id="s-quantite" v-model="draft.quantite" class="input mono" inputmode="numeric" :class="{ invalid: errors.quantite }" :aria-invalid="!!errors.quantite" />
        <span v-if="errors.quantite" class="field-error">{{ errors.quantite }}</span>
      </div>
      <div class="field">
        <label for="s-seuil">Alerte stock bas (0 = aucune)</label>
        <input id="s-seuil" v-model="draft.seuil" class="input mono" inputmode="numeric" />
        <span v-if="errors.seuil" class="field-error">{{ errors.seuil }}</span>
      </div>
      <div class="field wide">
        <label for="s-note">Note (rack, palette, fournisseur…)</label>
        <input id="s-note" v-model="draft.note" class="input" maxlength="300" autocomplete="off" />
      </div>
      <label class="check"><input v-model="draft.chute" type="checkbox" /><span>C’est une chute (morceau récupéré d’une feuille entamée)</span></label>
      <p class="actions"><button class="btn primary" type="submit" :disabled="adding"><AppIcon name="plus" :size="16" /> Ajouter au stock</button></p>
    </form>
  </section>

  <section class="card" aria-labelledby="liste">
    <h2 id="liste" class="sr-only">Feuilles en stock</h2>
    <div v-if="matieres.length > 1" class="chips" role="group" aria-label="Matière">
      <button type="button" class="chip" :aria-pressed="!filtre" @click="filtre = ''">Toutes</button>
      <button v-for="m in matieres" :key="m.id" type="button" class="chip" :aria-pressed="filtre === m.id" @click="filtre = m.id">{{ m.label }}</button>
    </div>
    <div v-if="!loading && !feuilles.length" class="empty">
      <AppIcon name="layers" :size="32" class="muted" />
      <p><b>Aucune feuille en stock pour l’instant.</b></p>
      <p class="muted">Ajoutez vos feuilles ci-dessus : l’atelier saura quelle feuille prendre pour chaque commande.</p>
    </div>
    <div v-else class="table-wrap">
      <table class="table" :aria-busy="loading">
        <caption class="sr-only">Feuilles en stock</caption>
        <thead>
          <tr>
            <th>Matière</th>
            <th>Coloris</th>
            <th>Format</th>
            <th class="n">En stock</th>
            <th class="hide-sm n">Alerte</th>
            <th class="hide-sm">Note</th>
            <th><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          <template v-for="f in visibles" :key="f.id">
            <tr>
              <td>{{ f.matiere }} <span class="sub">{{ fmt(f.epaisseur) }} mm</span></td>
              <td>
                <span v-if="f.coloris" class="with-swatch"><span class="swatch" :style="{ background: f.hex ?? undefined }" aria-hidden="true" /><span>{{ f.coloris }}<span class="sub">{{ f.reference }}</span></span></span>
                <span v-else class="muted">Brut</span>
              </td>
              <td class="mono fmt">{{ fmt(f.largeur) }} × {{ fmt(f.longueur) }} mm <span v-if="f.chute" class="pill accent">Chute</span></td>
              <td class="n"><b class="mono">{{ f.quantite }}</b> <span v-if="f.bas" class="pill warn">Stock bas</span></td>
              <td class="hide-sm n"><input class="input compact seuil" inputmode="numeric" :aria-label="`Alerte stock bas de ${f.libelle}`" :value="f.seuil" @change="onSeuil(f, $event)" /></td>
              <td class="hide-sm"><input class="input compact note" :aria-label="`Note de ${f.libelle}`" :value="f.note" maxlength="300" @change="onNote(f, $event)" /></td>
              <td>
                <span class="row-actions">
                  <button class="btn small" type="button" :aria-expanded="open === f.id && move.mode === 'entree'" :aria-label="`Entrée de feuilles : ${f.libelle}`" @click="ouvrir(f, 'entree')">Entrée</button>
                  <button class="btn small" type="button" :aria-expanded="open === f.id && move.mode === 'sortie'" :aria-label="`Sortie de feuilles : ${f.libelle}`" @click="ouvrir(f, 'sortie')">Sortie</button>
                  <button class="btn small" type="button" :aria-expanded="open === f.id && move.mode === 'inventaire'" :aria-label="`Inventaire : ${f.libelle}`" @click="ouvrir(f, 'inventaire')">Compter</button>
                  <button v-if="!f.quantite" class="btn small danger" type="button" :aria-label="`Supprimer la référence ${f.libelle}`" @click="supprimer(f)"><AppIcon name="trash" :size="14" /></button>
                </span>
              </td>
            </tr>
            <tr v-if="open === f.id" class="mouvement">
              <td colspan="7">
                <form class="move" novalidate @submit.prevent="appliquer(f)">
                  <div class="field">
                    <label :for="`m-${f.id}`">{{ move.mode === 'entree' ? 'Feuilles reçues' : move.mode === 'sortie' ? 'Feuilles sorties' : 'Quantité comptée' }}</label>
                    <input :id="`m-${f.id}`" v-model="move.valeur" class="input mono" inputmode="numeric" :aria-invalid="!!move.erreur" :aria-describedby="move.erreur ? `m-${f.id}-e` : undefined" />
                  </div>
                  <div v-if="move.mode !== 'inventaire'" class="field">
                    <label :for="`mm-${f.id}`">Motif</label>
                    <select :id="`mm-${f.id}`" v-model="move.motif" class="input"><option v-for="m in motifs" :key="m" :value="m">{{ MOTIFS[m] }}</option></select>
                  </div>
                  <div class="field grow">
                    <label :for="`mn-${f.id}`">Note (n° de commande, fournisseur…)</label>
                    <input :id="`mn-${f.id}`" v-model="move.note" class="input" maxlength="300" autocomplete="off" />
                  </div>
                  <button class="btn primary" type="submit" :disabled="move.busy">Valider</button>
                  <button class="btn" type="button" @click="open = null">Annuler</button>
                  <span v-if="move.erreur" :id="`m-${f.id}-e`" class="field-error full" role="alert">{{ move.erreur }}</span>
                </form>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </section>

  <section v-if="mouvements.length" class="card hist" aria-labelledby="hist">
    <h2 id="hist"><button class="fold" type="button" aria-controls="hist-liste" :aria-expanded="histOuvert" @click="histOuvert = !histOuvert"><AppIcon :name="histOuvert ? 'chevron-up' : 'chevron-down'" :size="16" /> Derniers mouvements <span class="muted">({{ mouvements.length }})</span></button></h2>
    <ul v-if="histOuvert" id="hist-liste">
      <li v-for="m in mouvements" :key="m.id">
        <b class="mono delta" :class="m.delta > 0 ? 'plus' : 'moins'">{{ m.delta > 0 ? '+' : '−' }}{{ Math.abs(m.delta) }}</b>
        <span>{{ m.libelle }}<span class="sub">{{ MOTIFS[m.motif] }}<template v-if="m.note"> · {{ m.note }}</template> · reste {{ m.apres }}</span></span>
        <span class="muted when">{{ jour(m.at) }} {{ heure(m.at) }}<template v-if="m.par"> · {{ m.par }}</template></span>
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
.chips {
  padding: 12px 16px 0;
}
.with-swatch {
  display: inline-flex;
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
.row-actions {
  display: flex;
  gap: 6px;
  flex-wrap: nowrap;
  justify-content: flex-end;
}
.row-actions .btn {
  white-space: nowrap;
}
.fmt {
  white-space: nowrap;
}
.seuil {
  width: 76px;
}
.note {
  min-width: 150px;
  width: 100%;
}
.hist .sub {
  display: block;
}
.mouvement td {
  background: var(--surface-2);
}
.move {
  display: flex;
  gap: 12px;
  align-items: end;
  flex-wrap: wrap;
}
.move .grow {
  flex: 1 1 220px;
}
.move .full {
  flex-basis: 100%;
}
.empty {
  padding: 36px 20px;
  display: grid;
  justify-items: center;
  gap: 8px;
  text-align: center;
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
/* Téléphone : chaque feuille devient une carte, avec ses boutons à portée de pouce (sans défilement latéral) */
@media (max-width: 700px) {
  .table thead {
    display: none;
  }
  .table,
  .table tbody {
    display: block;
    min-width: 0;
    width: 100%;
  }
  .table tbody tr {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 6px 12px;
    align-items: center;
    padding: 12px 14px;
    border-bottom: 1px solid var(--line);
  }
  .table tbody td {
    display: block;
    padding: 0;
    border: 0;
    text-align: left;
  }
  /* Alerte et note restent masquées sur téléphone : elles se règlent sur un écran plus large */
  .table tbody td.hide-sm {
    display: none;
  }
  .table tbody td:nth-child(3) {
    grid-column: 1;
  }
  .table tbody td:nth-child(4) {
    grid-column: 2;
    grid-row: 1 / span 3;
    text-align: right;
  }
  .table tbody td:last-child {
    grid-column: 1 / -1;
  }
  .row-actions {
    justify-content: flex-start;
    flex-wrap: wrap;
  }
  .mouvement td {
    grid-column: 1 / -1;
  }
  .mouvement {
    display: block !important;
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
