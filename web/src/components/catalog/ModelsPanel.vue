<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { api, ApiError } from '@/api'
import type { PieceModel } from '@/lib/catalog'
import { angleText, developpe, isPince, letter, PINCE } from '@/lib/orders'
import AppIcon from '@/components/AppIcon.vue'
import ProfileSketch from '@/components/orders/ProfileSketch.vue'

// Modèles de pièces proposés à la saisie des commandes : une forme de départ, ajustée ensuite pièce par pièce
const emit = defineEmits<{ count: [n: number] }>()

const items = ref<PieceModel[]>([])
const showInactive = ref(false)
const loadError = ref('')
const notice = ref('')

async function load() {
  try {
    items.value = (await api<{ models: PieceModel[] }>('/catalog/models')).models
    emit('count', items.value.filter((m) => m.actif).length)
  } catch (e) {
    loadError.value = e instanceof ApiError ? e.message : 'Chargement impossible.'
  }
}
onMounted(load)

const visible = computed(() => items.value.filter((m) => showInactive.value || m.actif))
const inactiveCount = computed(() => items.value.filter((m) => !m.actif).length)

const editing = ref<'new' | string | null>(null)
const form = reactive({ nom: '', cotes: [] as number[], angles: [] as number[], noms: [] as string[], cap: 0, longueur: 2000, quantite: 1 })
const error = ref<{ field?: string; msg: string } | null>(null)
const saving = ref(false)

function openNew() {
  Object.assign(form, { nom: '', cotes: [60, 120], angles: [90], noms: ['', ''], cap: 0, longueur: 2000, quantite: 1 })
  error.value = null
  notice.value = ''
  editing.value = 'new'
}
function openEdit(m: PieceModel) {
  Object.assign(form, { nom: m.nom, cotes: [...m.cotes], angles: [...m.angles], noms: m.cotes.map((_, i) => m.noms[i] ?? ''), cap: m.cap, longueur: m.longueur, quantite: m.quantite })
  error.value = null
  notice.value = ''
  editing.value = m.id
}

function addPli() {
  form.angles.push(90)
  form.cotes.push(20)
  form.noms.push('')
}
function removePli() {
  if (form.cotes.length < 2) return
  form.cotes.pop()
  form.angles.pop()
  form.noms.pop()
}
// Angle saisi : la valeur, le sens étant gardé par le bouton ↑ / ↓. 0 = pince, enregistrée ±PINCE.
function setAngle(j: number, raw: string) {
  const sign = form.angles[j]! < 0 ? -1 : 1
  const v = Number(raw)
  form.angles[j] = raw.trim() !== '' && v === 0 ? sign * PINCE : (v || 0) * sign
}
// Faire tourner le dessin par quarts de tour… ou de 15° pour un réglage fin, entre −180° et 180°
function rotate(by: number) {
  let c = form.cap + by
  if (c > 180) c -= 360
  if (c < -180) c += 360
  form.cap = c
}

async function save() {
  error.value = null
  saving.value = true
  try {
    const path = editing.value === 'new' ? '/catalog/models' : `/catalog/models/${editing.value}`
    const { model } = await api<{ model: PieceModel }>(path, { method: editing.value === 'new' ? 'POST' : 'PATCH', body: { ...form } })
    notice.value = `${model.nom} ${editing.value === 'new' ? 'ajouté' : 'enregistré'}.`
    editing.value = null
    await load()
  } catch (e) {
    error.value = e instanceof ApiError ? { msg: e.message, field: e.field } : { msg: 'L’enregistrement a échoué.' }
  } finally {
    saving.value = false
  }
}

async function toggle(m: PieceModel) {
  notice.value = ''
  try {
    await api(`/catalog/models/${m.id}`, { method: 'PATCH', body: { actif: !m.actif } })
    notice.value = m.actif ? `${m.nom} désactivé : il ne sera plus proposé dans les nouvelles commandes.` : `${m.nom} réactivé.`
    await load()
  } catch (e) {
    loadError.value = e instanceof ApiError ? e.message : 'Modification impossible.'
  }
}

const err = (f: string) => (error.value?.field === f ? error.value.msg : '')
// Erreur sur la forme (cotes, angles, noms), affichée près du dessin
const shapeErr = computed(() => (error.value?.field && /^(cotes|angles|noms)/.test(error.value.field) ? error.value.msg : ''))
const bad = (f: string) => error.value?.field === f || undefined
const summary = (m: Pick<PieceModel, 'cotes' | 'angles'>) => {
  const plis = m.angles.length
  return `${plis} pli${plis > 1 ? 's' : ''} · développé ${developpe(m.cotes).toLocaleString('fr-FR')} mm`
}
</script>

<template>
  <div class="panel cat-panel">
    <div class="toolbar">
      <label v-if="inactiveCount" class="check">
        <input id="models-inactive" v-model="showInactive" type="checkbox" />
        Afficher les désactivés ({{ inactiveCount }})
      </label>
      <span v-else />
      <button v-if="editing === null" class="btn primary" type="button" @click="openNew"><AppIcon name="plus" />Ajouter un modèle</button>
    </div>

    <p v-if="loadError" class="alert bad" role="alert">{{ loadError }}</p>
    <p v-if="notice" class="alert ok" role="status">{{ notice }}</p>

    <form v-if="editing !== null" class="card edit" novalidate aria-label="Formulaire de modèle" @submit.prevent="save">
      <h3>{{ editing === 'new' ? 'Nouveau modèle' : 'Modifier le modèle' }}</h3>
      <p v-if="error && !error.field" class="alert bad" role="alert">{{ error.msg }}</p>
      <div class="grid">
        <div class="field">
          <label for="m-nom">Modèle</label>
          <input id="m-nom" v-model="form.nom" class="input" placeholder="Faîtière, solin, habillage de tableau…" autocomplete="off" :aria-invalid="bad('nom')" />
          <span v-if="err('nom')" class="field-error">{{ err('nom') }}</span>
        </div>
        <div class="field">
          <label for="m-longueur">Longueur proposée</label>
          <span class="unit"><input id="m-longueur" v-model.number="form.longueur" class="input mono" type="number" inputmode="numeric" :aria-invalid="bad('longueur')" /><span>mm</span></span>
          <span v-if="err('longueur')" class="field-error">{{ err('longueur') }}</span>
        </div>
        <div class="field">
          <label for="m-quantite">Quantité proposée</label>
          <span class="unit"><input id="m-quantite" v-model.number="form.quantite" class="input mono" type="number" inputmode="numeric" :aria-invalid="bad('quantite')" /><span>pièces</span></span>
          <span v-if="err('quantite')" class="field-error">{{ err('quantite') }}</span>
        </div>
      </div>

      <div class="shape">
        <div class="view">
          <div class="preview">
            <ProfileSketch :cotes="form.cotes" :angles="form.angles" :cap="form.cap" :label="`Forme du modèle ${form.nom}`.trim()" />
          </div>
          <div class="rotate" role="group" aria-label="Orientation du dessin">
            <button class="btn small icon" type="button" aria-label="Tourner le dessin de 15° à gauche" title="−15°" @click="rotate(-15)">↺</button>
            <span class="unit tiny">
              <input id="m-cap" v-model.number="form.cap" class="input mono" type="number" inputmode="numeric" min="-180" max="180" aria-label="Orientation du dessin" :aria-invalid="bad('cap')" /><span>°</span>
            </span>
            <button class="btn small icon" type="button" aria-label="Tourner le dessin de 15° à droite" title="+15°" @click="rotate(15)">↻</button>
          </div>
          <p class="hint muted">Orientation du dessin seulement : la pièce ne change pas.</p>
          <span v-if="err('cap')" class="field-error">{{ err('cap') }}</span>
        </div>

        <fieldset class="cotes">
          <legend>Forme de départ</legend>
          <p v-if="shapeErr" class="alert bad" role="alert">{{ shapeErr }}</p>
          <template v-for="(_, j) in form.cotes" :key="j">
            <div class="cote">
              <b class="letter" aria-hidden="true">{{ letter(j) }}</b>
              <input
                :id="`m-nom${j}`"
                v-model="form.noms[j]"
                class="input"
                maxlength="30"
                placeholder="Nom (facultatif)"
                :aria-label="`Nom de la cote ${letter(j)}`"
                :aria-invalid="bad(`noms.${j}`)"
              />
              <span class="unit">
                <input :id="`m-cote${j}`" v-model.number="form.cotes[j]" class="input mono" type="number" inputmode="numeric" min="1" :aria-label="`Cote ${letter(j)}`" :aria-invalid="bad(`cotes.${j}`) || bad('cotes')" /><span>mm</span>
              </span>
            </div>
            <div v-if="j < form.angles.length" class="pli">
              <label :for="`m-angle${j}`">Pli {{ j + 1 }}</label>
              <span class="unit">
                <input
                  :id="`m-angle${j}`"
                  class="input mono"
                  type="number"
                  inputmode="numeric"
                  min="0"
                  max="179"
                  :value="isPince(form.angles[j]!) ? 0 : Math.abs(form.angles[j]!)"
                  :aria-invalid="bad(`angles.${j}`) || bad('angles')"
                  @input="setAngle(j, ($event.target as HTMLInputElement).value)"
                /><span>{{ isPince(form.angles[j]!) ? '° pince' : '°' }}</span>
              </span>
              <button class="btn small sens" type="button" :aria-label="`Inverser le sens du pli ${j + 1}`" :title="form.angles[j]! < 0 ? 'Pli vers le bas' : 'Pli vers le haut'" @click="form.angles[j] = -form.angles[j]!">
                {{ form.angles[j]! < 0 ? '↓' : '↑' }}
              </button>
            </div>
          </template>
          <div class="pli-tools">
            <button class="btn small" type="button" :disabled="form.cotes.length >= 20" @click="addPli"><AppIcon name="plus" :size="14" />Ajouter un pli</button>
            <button class="btn small" type="button" :disabled="form.cotes.length < 2" @click="removePli">Retirer le dernier pli</button>
          </div>
          <p class="hint muted">Développé : <b class="mono">{{ developpe(form.cotes).toLocaleString('fr-FR') }} mm</b>. Le nom des cotes s’affiche à la saisie des commandes.</p>
        </fieldset>
      </div>

      <div class="actions">
        <button class="btn primary" type="submit" :disabled="saving">{{ saving ? 'Enregistrement…' : 'Enregistrer' }}</button>
        <button class="btn" type="button" @click="editing = null">Annuler</button>
      </div>
    </form>

    <ul class="models">
      <li v-for="m in visible" :key="m.id" class="card model" :class="{ off: !m.actif }">
        <div class="thumb"><ProfileSketch :cotes="m.cotes" :angles="m.angles" :cap="m.cap" :labels="false" :label="`Forme du modèle ${m.nom}`" /></div>
        <div class="info">
          <b>{{ m.nom }}</b>
          <span class="muted sub">{{ summary(m) }}<template v-if="!m.actif"> · désactivé</template></span>
          <span class="muted sub mono items"><span v-for="(c, i) in m.cotes" :key="i">{{ letter(i) }} {{ c }}</span></span>
          <span v-if="m.angles.length" class="muted sub mono items"><span v-for="(a, i) in m.angles" :key="i">{{ angleText(a) }} {{ a < 0 ? '↓' : '↑' }}</span></span>
        </div>
        <div class="row-actions">
          <button class="btn small" type="button" :aria-label="`Modifier ${m.nom}`" @click="openEdit(m)"><AppIcon name="pencil" :size="14" />Modifier</button>
          <button class="btn small" type="button" :aria-label="`${m.actif ? 'Désactiver' : 'Activer'} ${m.nom}`" @click="toggle(m)">{{ m.actif ? 'Désactiver' : 'Activer' }}</button>
        </div>
      </li>
      <li v-if="!visible.length && !loadError" class="muted empty">Aucun modèle. Ajoutez couvertines, bavettes ou bandeaux pour les proposer à la saisie des commandes.</li>
    </ul>
  </div>
</template>

<style>
@import './panel.css';
</style>

<style scoped>
.models {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 12px;
}
.model {
  padding: 14px;
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  gap: 6px 12px;
  align-items: start;
}
.model.off {
  opacity: 0.65;
}
.thumb {
  height: 72px;
  background: var(--surface-2);
  border-radius: 8px;
  padding: 6px;
}
.info {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.sub {
  font-size: 0.82rem;
}
/* Une cote ou un pli ne se coupe jamais en deux */
.items {
  display: flex;
  flex-wrap: wrap;
  gap: 0 10px;
}
.items > span {
  white-space: nowrap;
}
.row-actions {
  grid-column: 1 / -1;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.empty {
  padding: 12px 0;
}
.shape {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
  gap: 16px;
  align-items: start;
}
.view {
  display: grid;
  gap: 8px;
  min-width: 0;
}
.preview {
  aspect-ratio: 4 / 3;
  background: var(--surface-2);
  border-radius: 8px;
  padding: 8px;
}
.rotate {
  display: flex;
  align-items: center;
  gap: 6px;
}
.rotate .unit {
  width: 110px;
}
.cotes {
  border: 0;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
  min-width: 0;
}
.cotes legend {
  padding: 0;
  margin-bottom: 6px;
  font-size: 0.86rem;
  font-weight: 600;
}
.cote {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) 120px;
  gap: 8px;
  align-items: center;
}
.letter {
  color: var(--accent);
  font-family: var(--f-mono);
}
.pli {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 120px auto;
  gap: 8px;
  align-items: center;
  padding-left: 26px;
  border-left: 2px dashed var(--line);
  margin-left: 8px;
  font-size: 0.85rem;
  color: var(--muted);
}
.sens {
  min-width: 38px;
  font-size: 1rem;
}
.pli-tools {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 4px;
}
@media (max-width: 760px) {
  .shape {
    grid-template-columns: minmax(0, 1fr);
  }
  .preview {
    aspect-ratio: auto;
    height: 200px;
  }
}
@media (max-width: 420px) {
  .cote {
    grid-template-columns: 18px minmax(0, 1fr) 104px;
  }
  .pli {
    grid-template-columns: minmax(0, 1fr) 104px auto;
    padding-left: 12px;
  }
}
@media (pointer: coarse) {
  .sens,
  .rotate .btn {
    min-height: 44px;
    min-width: 44px;
  }
}
</style>
