<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { api, ApiError } from '@/api'
import { eur, QUANTITES, qtyRule, suggestedQty, toMoneyField, UNITES, type Accessory, type PieceModel, type QuantiteAuto, type Unite } from '@/lib/catalog'
import AppIcon from '@/components/AppIcon.vue'

const emit = defineEmits<{ count: [n: number] }>()

const items = ref<Accessory[]>([])
// Modèles de pièces : rechargés à chaque ouverture du formulaire (ils se gèrent dans l'onglet voisin)
const models = ref<PieceModel[]>([])
const showInactive = ref(false)
const loadError = ref('')
const notice = ref('')

async function load() {
  try {
    const [a, m] = await Promise.all([api<{ accessories: Accessory[] }>('/catalog/accessories'), api<{ models: PieceModel[] }>('/catalog/models')])
    items.value = a.accessories
    models.value = m.models
    emit('count', items.value.filter((a) => a.actif).length)
  } catch (e) {
    loadError.value = e instanceof ApiError ? e.message : 'Chargement impossible.'
  }
}
onMounted(load)

const visible = computed(() => items.value.filter((a) => showInactive.value || a.actif))
const inactiveCount = computed(() => items.value.filter((a) => !a.actif).length)

const editing = ref<'new' | string | null>(null)
const form = reactive({ nom: '', prix: '', unite: 'piece' as Unite, modeles: [] as string[], quantiteAuto: 'aucune' as QuantiteAuto, quantiteFixe: '1' })
const error = ref<{ field?: string; msg: string } | null>(null)
const saving = ref(false)

async function refreshModels() {
  try {
    models.value = (await api<{ models: PieceModel[] }>('/catalog/models')).models
  } catch {
    // On garde la liste déjà chargée
  }
}
// Proposés : les modèles actifs, plus ceux déjà cochés même s'ils ont été désactivés depuis
const choices = computed(() => models.value.filter((m) => m.actif || form.modeles.includes(m.id)))

function openNew() {
  refreshModels()
  Object.assign(form, { nom: '', prix: '', unite: 'piece', modeles: [], quantiteAuto: 'aucune', quantiteFixe: '1' })
  error.value = null
  notice.value = ''
  editing.value = 'new'
}
function openEdit(a: Accessory) {
  refreshModels()
  Object.assign(form, {
    nom: a.nom,
    prix: toMoneyField(a.prix),
    unite: a.unite,
    modeles: [...a.modeles],
    quantiteAuto: a.quantiteAuto,
    quantiteFixe: String(a.quantiteFixe || 1),
  })
  error.value = null
  notice.value = ''
  editing.value = a.id
}

// Exemple concret sous la règle choisie, pour une ligne de 4 longueurs
const example = computed(() => {
  if (form.quantiteAuto === 'aucune') return 'La quantité sera saisie à la main sur chaque ligne.'
  const q = suggestedQty({ quantiteAuto: form.quantiteAuto, quantiteFixe: Number(form.quantiteFixe) || 0 }, 4)
  return `Pour une ligne de 4 pièces, ${q} ${form.unite === 'paire' ? (q > 1 ? 'paires proposées' : 'paire proposée') : q > 1 ? 'proposés' : 'proposé'}, modifiable ensuite.`
})

async function save() {
  error.value = null
  saving.value = true
  try {
    const path = editing.value === 'new' ? '/catalog/accessories' : `/catalog/accessories/${editing.value}`
    const body = { ...form, modeles: [...form.modeles], quantiteFixe: form.quantiteAuto === 'fixe' ? form.quantiteFixe : 0 }
    const { accessory } = await api<{ accessory: Accessory }>(path, { method: editing.value === 'new' ? 'POST' : 'PATCH', body })
    notice.value = `${accessory.nom} ${editing.value === 'new' ? 'ajouté' : 'enregistré'}.`
    editing.value = null
    await load()
  } catch (e) {
    error.value = e instanceof ApiError ? { msg: e.message, field: e.field } : { msg: 'L’enregistrement a échoué.' }
  } finally {
    saving.value = false
  }
}

async function toggle(a: Accessory) {
  notice.value = ''
  try {
    await api(`/catalog/accessories/${a.id}`, { method: 'PATCH', body: { actif: !a.actif } })
    notice.value = a.actif ? `${a.nom} désactivé : il ne sera plus proposé dans les nouveaux devis.` : `${a.nom} réactivé.`
    await load()
  } catch (e) {
    loadError.value = e instanceof ApiError ? e.message : 'Modification impossible.'
  }
}

const err = (f: string) => (error.value?.field === f ? error.value.msg : '')
const modelesLabel = (a: Accessory) => a.modeles.map((id) => models.value.find((m) => m.id === id)?.nom ?? 'modèle supprimé').join(', ')
</script>

<template>
  <div class="panel cat-panel">
    <div class="toolbar">
      <label v-if="inactiveCount" class="check">
        <input id="accessories-inactive" v-model="showInactive" type="checkbox" />
        Afficher les désactivés ({{ inactiveCount }})
      </label>
      <span v-else />
      <button v-if="editing === null" class="btn primary" type="button" @click="openNew"><AppIcon name="plus" />Ajouter un accessoire</button>
    </div>

    <p v-if="loadError" class="alert bad" role="alert">{{ loadError }}</p>
    <p v-if="notice" class="alert ok" role="status">{{ notice }}</p>

    <form v-if="editing !== null" class="card edit" novalidate aria-label="Formulaire d’accessoire" @submit.prevent="save">
      <h3>{{ editing === 'new' ? 'Nouvel accessoire' : 'Modifier l’accessoire' }}</h3>
      <p v-if="error && !error.field" class="alert bad" role="alert">{{ error.msg }}</p>
      <div class="grid">
        <div class="field">
          <label for="a-nom">Accessoire</label>
          <input id="a-nom" v-model="form.nom" class="input" placeholder="Bouchon de couvertine" autocomplete="off" :aria-invalid="!!err('nom') || undefined" />
          <span v-if="err('nom')" class="field-error">{{ err('nom') }}</span>
        </div>
        <div class="field">
          <label for="a-prix">Prix (HT)</label>
          <span class="unit"><input id="a-prix" v-model="form.prix" class="input mono" inputmode="decimal" placeholder="0,00" :aria-invalid="!!err('prix') || undefined" /><span>€</span></span>
          <span v-if="err('prix')" class="field-error">{{ err('prix') }}</span>
        </div>
        <div class="field">
          <label for="a-unite">Vendu à</label>
          <select id="a-unite" v-model="form.unite" class="input" :aria-invalid="!!err('unite') || undefined">
            <option v-for="(label, id) in UNITES" :key="id" :value="id">{{ label }}</option>
          </select>
          <span v-if="err('unite')" class="field-error">{{ err('unite') }}</span>
        </div>
      </div>

      <fieldset class="field models" :class="{ invalid: !!err('modeles') }" :aria-describedby="err('modeles') ? 'a-modeles-error' : undefined">
        <legend>Proposé pour</legend>
        <div class="chips">
          <label v-for="m in choices" :key="m.id" class="chip">
            <input v-model="form.modeles" type="checkbox" :value="m.id" />
            {{ m.nom }}<template v-if="!m.actif"> (désactivé)</template>
          </label>
        </div>
        <span v-if="err('modeles')" id="a-modeles-error" class="field-error">{{ err('modeles') }}</span>
      </fieldset>

      <div class="grid">
        <div class="field">
          <label for="a-quantite">Quantité proposée</label>
          <select id="a-quantite" v-model="form.quantiteAuto" class="input" :aria-invalid="!!err('quantiteAuto') || undefined">
            <option v-for="(label, id) in QUANTITES" :key="id" :value="id">{{ label }}</option>
          </select>
          <span v-if="err('quantiteAuto')" class="field-error">{{ err('quantiteAuto') }}</span>
        </div>
        <div v-if="form.quantiteAuto === 'fixe'" class="field">
          <label for="a-fixe">Nombre par ligne</label>
          <input id="a-fixe" v-model="form.quantiteFixe" class="input mono" inputmode="numeric" :aria-invalid="!!err('quantiteFixe') || undefined" />
          <span v-if="err('quantiteFixe')" class="field-error">{{ err('quantiteFixe') }}</span>
        </div>
      </div>
      <p class="hint muted">{{ example }} Par exemple : 2 bouchons par couvertine, une éclisse entre deux longueurs, une paire d’embouts par bavette.</p>
      <div class="actions">
        <button class="btn primary" type="submit" :disabled="saving">{{ saving ? 'Enregistrement…' : 'Enregistrer' }}</button>
        <button class="btn" type="button" @click="editing = null">Annuler</button>
      </div>
    </form>

    <div class="table-wrap">
      <table class="table fits-sm">
        <thead>
          <tr>
            <th>Accessoire</th>
            <th class="n">Prix HT</th>
            <th class="hide-sm">Quantité proposée</th>
            <th class="hide-sm">Statut</th>
            <th class="n"><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in visible" :key="a.id" :class="{ off: !a.actif }">
            <td>
              <b>{{ a.nom }}</b>
              <span class="sub">{{ modelesLabel(a) }}<template v-if="!a.actif"> · désactivé</template></span>
            </td>
            <td class="n">
              <span class="mono">{{ eur(a.prix) }}</span>
              <span class="sub">{{ UNITES[a.unite] }}</span>
            </td>
            <td class="hide-sm">{{ qtyRule(a) }}</td>
            <td class="hide-sm">
              <span class="pill" :class="a.actif ? 'ok' : 'neutral'">{{ a.actif ? 'Actif' : 'Désactivé' }}</span>
            </td>
            <td class="n actions-cell">
              <button class="btn small" type="button" :aria-label="`Modifier ${a.nom}`" @click="openEdit(a)"><AppIcon name="pencil" :size="14" /><span class="hide-sm">Modifier</span></button>
              <button class="btn small" type="button" @click="toggle(a)">{{ a.actif ? 'Désactiver' : 'Activer' }}</button>
            </td>
          </tr>
          <tr v-if="!visible.length && !loadError">
            <td colspan="5" class="muted">Aucun accessoire. Ajoutez bouchons, éclisses ou angles pour les proposer avec les pièces.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style>
@import './panel.css';
</style>

<style scoped>
.models {
  border: 0;
  padding: 0;
  margin: 0;
  min-width: 0;
}
.models legend {
  padding: 0;
  margin-bottom: 6px;
  font-size: 0.86rem;
  font-weight: 600;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface);
  font-weight: 500;
  cursor: pointer;
}
.chip:has(input:checked) {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.chip:has(input:focus-visible) {
  box-shadow: 0 0 0 3px var(--accent-soft);
  border-color: var(--accent);
}
.chip input {
  accent-color: var(--accent);
  margin: 0;
}
.models.invalid .chip {
  border-color: var(--bad);
}
@media (pointer: coarse) {
  .chip {
    min-height: 44px;
  }
}
</style>
