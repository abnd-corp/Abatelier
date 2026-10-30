<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { api, ApiError } from '@/api'
import AppIcon from '@/components/AppIcon.vue'

interface Closure {
  id: string
  debut: string
  fin: string
  motif: string
}

const emit = defineEmits<{ count: [n: number] }>()

const items = ref<Closure[]>([])
const today = ref('')
const showPast = ref(false)
const loadError = ref('')
const notice = ref('')

async function load() {
  try {
    const r = await api<{ closures: Closure[]; today: string }>('/catalog/closures')
    items.value = r.closures
    today.value = r.today
    emit('count', items.value.filter((c) => c.fin >= today.value).length)
  } catch (e) {
    loadError.value = e instanceof ApiError ? e.message : 'Chargement impossible.'
  }
}
onMounted(load)

const passed = (c: Closure) => c.fin < today.value
const visible = computed(() => items.value.filter((c) => showPast.value || !passed(c)))
const pastCount = computed(() => items.value.filter(passed).length)

const jour = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })
const periode = (c: Closure) => (c.debut === c.fin ? jour(c.debut) : `${jour(c.debut)} → ${jour(c.fin)}`)

const editing = ref<'new' | string | null>(null)
const form = reactive({ debut: '', fin: '', motif: '' })
const error = ref<{ field?: string; msg: string } | null>(null)
const saving = ref(false)

function openNew() {
  Object.assign(form, { debut: '', fin: '', motif: '' })
  error.value = null
  notice.value = ''
  editing.value = 'new'
}
function openEdit(c: Closure) {
  Object.assign(form, { debut: c.debut, fin: c.fin, motif: c.motif })
  error.value = null
  notice.value = ''
  editing.value = c.id
}

async function save() {
  error.value = null
  saving.value = true
  try {
    const isNew = editing.value === 'new'
    // Un seul jour : le dernier jour est le premier
    const body = { debut: form.debut, fin: form.fin || form.debut, motif: form.motif }
    await api(isNew ? '/catalog/closures' : `/catalog/closures/${editing.value}`, { method: isNew ? 'POST' : 'PATCH', body })
    notice.value = isNew ? 'Fermeture ajoutée : le site l’annonce et les délais la sautent.' : 'Fermeture enregistrée.'
    editing.value = null
    await load()
  } catch (e) {
    error.value = e instanceof ApiError ? { msg: e.message, field: e.field } : { msg: 'L’enregistrement a échoué.' }
  } finally {
    saving.value = false
  }
}

async function remove(c: Closure) {
  notice.value = ''
  try {
    await api(`/catalog/closures/${c.id}`, { method: 'DELETE' })
    notice.value = 'Fermeture supprimée.'
    await load()
  } catch (e) {
    loadError.value = e instanceof ApiError ? e.message : 'Suppression impossible.'
  }
}

const err = (f: string) => (error.value?.field === f ? error.value.msg : '')
</script>

<template>
  <div class="panel cat-panel">
    <div class="toolbar">
      <label v-if="pastCount" class="check">
        <input id="closures-past" v-model="showPast" type="checkbox" />
        Afficher les fermetures passées ({{ pastCount }})
      </label>
      <span v-else />
      <button v-if="editing === null" class="btn primary" type="button" @click="openNew"><AppIcon name="plus" />Ajouter une fermeture</button>
    </div>

    <p v-if="loadError" class="alert bad" role="alert">{{ loadError }}</p>
    <p v-if="notice" class="alert ok" role="status">{{ notice }}</p>

    <form v-if="editing !== null" class="card edit" novalidate aria-label="Formulaire de fermeture" @submit.prevent="save">
      <h3>{{ editing === 'new' ? 'Nouvelle fermeture' : 'Modifier la fermeture' }}</h3>
      <p v-if="error && !error.field" class="alert bad" role="alert">{{ error.msg }}</p>
      <div class="grid">
        <div class="field">
          <label for="f-debut">Premier jour</label>
          <input id="f-debut" v-model="form.debut" type="date" class="input" :aria-invalid="!!err('debut') || undefined" />
          <span v-if="err('debut')" class="field-error">{{ err('debut') }}</span>
        </div>
        <div class="field">
          <label for="f-fin">Dernier jour</label>
          <input id="f-fin" v-model="form.fin" type="date" class="input" :min="form.debut || undefined" :aria-invalid="!!err('fin') || undefined" />
          <span v-if="err('fin')" class="field-error">{{ err('fin') }}</span>
        </div>
        <div class="field">
          <label for="f-motif">Motif</label>
          <input id="f-motif" v-model="form.motif" class="input" maxlength="120" placeholder="Congés d’été" autocomplete="off" :aria-invalid="!!err('motif') || undefined" />
          <span v-if="err('motif')" class="field-error">{{ err('motif') }}</span>
        </div>
      </div>
      <p class="hint muted">Pour un seul jour, laissez le dernier jour vide. Le site annonce la fermeture et les délais de fabrication ne comptent pas ces jours.</p>
      <div class="actions">
        <button class="btn primary" type="submit" :disabled="saving">{{ saving ? 'Enregistrement…' : 'Enregistrer' }}</button>
        <button class="btn" type="button" @click="editing = null">Annuler</button>
      </div>
    </form>

    <div class="table-wrap">
      <table class="table fits-sm">
        <thead>
          <tr>
            <th>Période</th>
            <th>Motif</th>
            <th class="n"><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in visible" :key="c.id" :class="{ off: passed(c) }">
            <td>{{ periode(c) }}<span v-if="passed(c)" class="sub"> · passée</span></td>
            <td>{{ c.motif }}</td>
            <td class="n actions-cell">
              <template v-if="!passed(c)">
                <button class="btn small" type="button" :aria-label="`Modifier la fermeture ${c.motif}`" @click="openEdit(c)">
                  <AppIcon name="pencil" :size="14" /><span class="hide-sm">Modifier</span>
                </button>
                <button class="btn small" type="button" :aria-label="`Supprimer la fermeture ${c.motif}`" @click="remove(c)">
                  <AppIcon name="trash" :size="14" /><span class="hide-sm">Supprimer</span>
                </button>
              </template>
            </td>
          </tr>
          <tr v-if="!visible.length && !loadError">
            <td colspan="3" class="muted">Aucune fermeture à venir. Ajoutez les congés ou les jours fériés pour que les délais annoncés les sautent.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style>
@import './panel.css';
</style>
