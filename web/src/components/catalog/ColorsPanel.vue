<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { api, ApiError } from '@/api'
import { pct, toField, type Color } from '@/lib/catalog'
import AppIcon from '@/components/AppIcon.vue'

const emit = defineEmits<{ count: [n: number] }>()

const items = ref<Color[]>([])
const showInactive = ref(false)
const loadError = ref('')
const notice = ref('')

async function load() {
  try {
    items.value = (await api<{ colors: Color[] }>('/catalog/colors')).colors
    emit('count', items.value.filter((c) => c.actif).length)
  } catch (e) {
    loadError.value = e instanceof ApiError ? e.message : 'Chargement impossible.'
  }
}
onMounted(load)

const visible = computed(() => items.value.filter((c) => showInactive.value || c.actif))
const inactiveCount = computed(() => items.value.filter((c) => !c.actif).length)

const editing = ref<'new' | string | null>(null)
const form = reactive({ nom: '', reference: '', hex: '#7f7f7f', majoration: '0', delaiSup: '0' })
const error = ref<{ field?: string; msg: string } | null>(null)
const saving = ref(false)

function openNew() {
  Object.assign(form, { nom: '', reference: 'RAL ', hex: '#7f7f7f', majoration: '0', delaiSup: '0' })
  error.value = null
  notice.value = ''
  editing.value = 'new'
}
function openEdit(c: Color) {
  Object.assign(form, { nom: c.nom, reference: c.reference, hex: c.hex, majoration: toField(c.majoration), delaiSup: String(c.delaiSup) })
  error.value = null
  notice.value = ''
  editing.value = c.id
}

async function save() {
  error.value = null
  saving.value = true
  try {
    const path = editing.value === 'new' ? '/catalog/colors' : `/catalog/colors/${editing.value}`
    const { color } = await api<{ color: Color }>(path, { method: editing.value === 'new' ? 'POST' : 'PATCH', body: { ...form } })
    notice.value = `${color.reference} ${color.nom} ${editing.value === 'new' ? 'ajouté' : 'enregistré'}.`
    editing.value = null
    await load()
  } catch (e) {
    error.value = e instanceof ApiError ? { msg: e.message, field: e.field } : { msg: 'L’enregistrement a échoué.' }
  } finally {
    saving.value = false
  }
}

async function toggle(c: Color) {
  notice.value = ''
  try {
    await api(`/catalog/colors/${c.id}`, { method: 'PATCH', body: { actif: !c.actif } })
    notice.value = c.actif ? `${c.reference} désactivé : il ne sera plus proposé dans les nouveaux devis.` : `${c.reference} réactivé.`
    await load()
  } catch (e) {
    loadError.value = e instanceof ApiError ? e.message : 'Modification impossible.'
  }
}

const err = (f: string) => (error.value?.field === f ? error.value.msg : '')
</script>

<template>
  <div class="panel cat-panel">
    <div class="toolbar">
      <label v-if="inactiveCount" class="check">
        <input id="colors-inactive" v-model="showInactive" type="checkbox" />
        Afficher les désactivés ({{ inactiveCount }})
      </label>
      <span v-else />
      <button v-if="editing === null" class="btn primary" type="button" @click="openNew"><AppIcon name="plus" />Ajouter un coloris</button>
    </div>

    <p v-if="loadError" class="alert bad" role="alert">{{ loadError }}</p>
    <p v-if="notice" class="alert ok" role="status">{{ notice }}</p>

    <form v-if="editing !== null" class="card edit" novalidate aria-label="Formulaire de coloris" @submit.prevent="save">
      <h3>{{ editing === 'new' ? 'Nouveau coloris' : 'Modifier le coloris' }}</h3>
      <p v-if="error && !error.field" class="alert bad" role="alert">{{ error.msg }}</p>
      <div class="grid">
        <div class="field">
          <label for="c-reference">Référence</label>
          <input id="c-reference" v-model="form.reference" class="input" placeholder="RAL 7016" autocomplete="off" :aria-invalid="!!err('reference') || undefined" />
          <span v-if="err('reference')" class="field-error">{{ err('reference') }}</span>
        </div>
        <div class="field">
          <label for="c-nom">Nom</label>
          <input id="c-nom" v-model="form.nom" class="input" placeholder="Gris anthracite" autocomplete="off" :aria-invalid="!!err('nom') || undefined" />
          <span v-if="err('nom')" class="field-error">{{ err('nom') }}</span>
        </div>
        <div class="field">
          <label for="c-hex">Teinte</label>
          <span class="unit hex">
            <input id="c-hex-picker" v-model="form.hex" type="color" class="picker" aria-label="Choisir la teinte" />
            <input id="c-hex" v-model="form.hex" class="input mono" maxlength="7" :aria-invalid="!!err('hex') || undefined" />
          </span>
          <span v-if="err('hex')" class="field-error">{{ err('hex') }}</span>
        </div>
        <div class="field">
          <label for="c-majoration">Majoration</label>
          <span class="unit"><input id="c-majoration" v-model="form.majoration" class="input mono" inputmode="decimal" :aria-invalid="!!err('majoration') || undefined" /><span>%</span></span>
          <span v-if="err('majoration')" class="field-error">{{ err('majoration') }}</span>
        </div>
        <div class="field">
          <label for="c-delai">Délai supplémentaire</label>
          <span class="unit"><input id="c-delai" v-model="form.delaiSup" class="input mono" inputmode="numeric" :aria-invalid="!!err('delaiSup') || undefined" /><span>jours</span></span>
          <span v-if="err('delaiSup')" class="field-error">{{ err('delaiSup') }}</span>
        </div>
      </div>
      <p class="hint muted">La majoration s’applique au prix matière (ex. +12 % pour un noir sablé, −15 % pour du brut). Le délai s’ajoute au délai standard de fabrication.</p>
      <div class="actions">
        <button class="btn primary" type="submit" :disabled="saving">{{ saving ? 'Enregistrement…' : 'Enregistrer' }}</button>
        <button class="btn" type="button" @click="editing = null">Annuler</button>
      </div>
    </form>

    <div class="table-wrap">
      <table class="table fits-sm">
        <thead>
          <tr>
            <th>Coloris</th>
            <th class="n">Majoration</th>
            <th class="n hide-sm">Délai</th>
            <th class="hide-sm">Statut</th>
            <th class="n"><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in visible" :key="c.id" :class="{ off: !c.actif }">
            <td>
              <span class="color-row">
                <span class="swatch" :style="{ background: c.hex }" aria-hidden="true" />
                <span>
                  <b>{{ c.reference }}</b>
                  <span class="sub">{{ c.nom }}<template v-if="!c.actif"> · désactivé</template></span>
                </span>
              </span>
            </td>
            <td class="n mono">{{ pct(c.majoration) }}</td>
            <td class="n mono hide-sm">{{ c.delaiSup ? `+${c.delaiSup} j` : '—' }}</td>
            <td class="hide-sm">
              <span class="pill" :class="c.actif ? 'ok' : 'neutral'">{{ c.actif ? 'Actif' : 'Désactivé' }}</span>
            </td>
            <td class="n actions-cell">
              <button class="btn small" type="button" :aria-label="`Modifier ${c.reference}`" @click="openEdit(c)"><AppIcon name="pencil" :size="14" /><span class="hide-sm">Modifier</span></button>
              <button class="btn small" type="button" @click="toggle(c)">{{ c.actif ? 'Désactiver' : 'Réactiver' }}</button>
            </td>
          </tr>
          <tr v-if="!visible.length && !loadError">
            <td colspan="5" class="muted">Aucun coloris. Ajoutez le premier pour pouvoir chiffrer des pièces.</td>
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
.hex {
  padding-left: 6px;
}
.picker {
  width: 34px;
  height: 30px;
  border: 0;
  padding: 0;
  background: none;
  cursor: pointer;
  flex: none;
}
.hex .input {
  text-align: left;
}
</style>
