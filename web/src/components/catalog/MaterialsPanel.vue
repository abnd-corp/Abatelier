<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { api, ApiError } from '@/api'
import { eur, mm, toField, type Material } from '@/lib/catalog'
import AppIcon from '@/components/AppIcon.vue'

const emit = defineEmits<{ count: [n: number] }>()

const items = ref<Material[]>([])
const showInactive = ref(false)
const loadError = ref('')
const notice = ref('')

async function load() {
  try {
    items.value = (await api<{ materials: Material[] }>('/catalog/materials')).materials
    emit('count', items.value.filter((m) => m.actif).length)
  } catch (e) {
    loadError.value = e instanceof ApiError ? e.message : 'Chargement impossible.'
  }
}
onMounted(load)

const visible = computed(() => items.value.filter((m) => showInactive.value || m.actif))
const inactiveCount = computed(() => items.value.filter((m) => !m.actif).length)

// Formulaire d'ajout et de modification (les nombres se saisissent à la française : « 62,50 »)
const editing = ref<'new' | string | null>(null)
const form = reactive({ nom: '', epaisseur: '', prixM2: '', retourMin: '' })
const error = ref<{ field?: string; msg: string } | null>(null)
const saving = ref(false)

function openNew() {
  Object.assign(form, { nom: 'Aluminium', epaisseur: '', prixM2: '', retourMin: '10' })
  error.value = null
  notice.value = ''
  editing.value = 'new'
}
function openEdit(m: Material) {
  Object.assign(form, { nom: m.nom, epaisseur: toField(m.epaisseur), prixM2: toField(m.prixM2), retourMin: String(m.retourMin) })
  error.value = null
  notice.value = ''
  editing.value = m.id
}

async function save() {
  error.value = null
  saving.value = true
  try {
    if (editing.value === 'new') {
      const { material } = await api<{ material: Material }>('/catalog/materials', { method: 'POST', body: { ...form } })
      notice.value = `${material.nom} ${mm(material.epaisseur)} ajouté.`
    } else {
      const { material } = await api<{ material: Material }>(`/catalog/materials/${editing.value}`, { method: 'PATCH', body: { ...form } })
      notice.value = `${material.nom} ${mm(material.epaisseur)} enregistré.`
    }
    editing.value = null
    await load()
  } catch (e) {
    error.value = e instanceof ApiError ? { msg: e.message, field: e.field } : { msg: 'L’enregistrement a échoué.' }
  } finally {
    saving.value = false
  }
}

async function toggle(m: Material) {
  notice.value = ''
  try {
    await api(`/catalog/materials/${m.id}`, { method: 'PATCH', body: { actif: !m.actif } })
    notice.value = m.actif
      ? `${m.nom} ${mm(m.epaisseur)} désactivé : il ne sera plus proposé dans les nouveaux devis.`
      : `${m.nom} ${mm(m.epaisseur)} réactivé.`
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
        <input id="materials-inactive" v-model="showInactive" type="checkbox" />
        Afficher les désactivées ({{ inactiveCount }})
      </label>
      <span v-else />
      <button v-if="editing === null" class="btn primary" type="button" @click="openNew"><AppIcon name="plus" />Ajouter une matière</button>
    </div>

    <p v-if="loadError" class="alert bad" role="alert">{{ loadError }}</p>
    <p v-if="notice" class="alert ok" role="status">{{ notice }}</p>

    <form v-if="editing !== null" class="card edit" novalidate aria-label="Formulaire de matière" @submit.prevent="save">
      <h3>{{ editing === 'new' ? 'Nouvelle matière' : 'Modifier la matière' }}</h3>
      <p v-if="error && !error.field" class="alert bad" role="alert">{{ error.msg }}</p>
      <div class="grid">
        <div class="field">
          <label for="m-nom">Matière</label>
          <input id="m-nom" v-model="form.nom" class="input" list="m-noms" autocomplete="off" :aria-invalid="!!err('nom') || undefined" />
          <datalist id="m-noms"><option value="Aluminium" /><option value="Acier galvanisé" /><option value="Inox" /></datalist>
          <span v-if="err('nom')" class="field-error">{{ err('nom') }}</span>
        </div>
        <div class="field">
          <label for="m-epaisseur">Épaisseur</label>
          <span class="unit"><input id="m-epaisseur" v-model="form.epaisseur" class="input mono" inputmode="decimal" placeholder="1,5" :aria-invalid="!!err('epaisseur') || undefined" /><span>mm</span></span>
          <span v-if="err('epaisseur')" class="field-error">{{ err('epaisseur') }}</span>
        </div>
        <div class="field">
          <label for="m-prix">Prix au m² (HT)</label>
          <span class="unit"><input id="m-prix" v-model="form.prixM2" class="input mono" inputmode="decimal" placeholder="62,00" :aria-invalid="!!err('prixM2') || undefined" /><span>€</span></span>
          <span v-if="err('prixM2')" class="field-error">{{ err('prixM2') }}</span>
        </div>
        <div class="field">
          <label for="m-retour">Retour minimum</label>
          <span class="unit"><input id="m-retour" v-model="form.retourMin" class="input mono" inputmode="numeric" placeholder="10" :aria-invalid="!!err('retourMin') || undefined" /><span>mm</span></span>
          <span v-if="err('retourMin')" class="field-error">{{ err('retourMin') }}</span>
        </div>
      </div>
      <p class="hint muted">Le prix s’applique au m² de développé (largeur dépliée × longueur). Le retour minimum est le plus petit pli faisable dans cette épaisseur.</p>
      <div class="actions">
        <button class="btn primary" type="submit" :disabled="saving">{{ saving ? 'Enregistrement…' : 'Enregistrer' }}</button>
        <button class="btn" type="button" @click="editing = null">Annuler</button>
      </div>
    </form>

    <div class="table-wrap">
      <table class="table fits-sm">
        <thead>
          <tr>
            <th>Matière</th>
            <th class="n">Prix au m²</th>
            <th class="n hide-sm">Retour min.</th>
            <th class="hide-sm">Statut</th>
            <th class="n"><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="m in visible" :key="m.id" :class="{ off: !m.actif }">
            <td>
              <b>{{ m.nom }}</b> <span class="mono">{{ mm(m.epaisseur) }}</span>
              <span v-if="!m.actif" class="sub">Désactivée</span>
            </td>
            <td class="n mono">{{ eur(m.prixM2) }}</td>
            <td class="n mono hide-sm">{{ m.retourMin }} mm</td>
            <td class="hide-sm">
              <span class="pill" :class="m.actif ? 'ok' : 'neutral'">{{ m.actif ? 'Active' : 'Désactivée' }}</span>
            </td>
            <td class="n actions-cell">
              <button class="btn small" type="button" :aria-label="`Modifier ${m.nom} ${mm(m.epaisseur)}`" @click="openEdit(m)"><AppIcon name="pencil" :size="14" /><span class="hide-sm">Modifier</span></button>
              <button class="btn small" type="button" @click="toggle(m)">{{ m.actif ? 'Désactiver' : 'Activer' }}</button>
            </td>
          </tr>
          <tr v-if="!visible.length && !loadError">
            <td colspan="5" class="muted">Aucune matière. Ajoutez la première pour pouvoir chiffrer des pièces.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style>
@import './panel.css';
</style>
