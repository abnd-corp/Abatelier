<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { api, ApiError } from '@/api'
import AppIcon from '@/components/AppIcon.vue'
import type { Champ } from '@/lib/site-admin'

// Les textes du site que la direction modifie. Les pages légales n'en font pas partie : elles suivent les versions de l'application.
const champs = ref<Champ[]>([])
const draft = reactive<Record<string, string>>({})
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const errorField = ref('')
const saved = ref(false)

function fill(list: Champ[]) {
  champs.value = list
  for (const c of list) draft[c.key] = c.valeur
}
async function load() {
  try {
    fill((await api<{ champs: Champ[] }>('/site/content')).champs)
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Chargement impossible.'
  } finally {
    loading.value = false
  }
}
onMounted(load)

/** Hauteur de la zone de texte : celle du contenu, entre 3 et 18 lignes. */
const rowsFor = (text = '') => Math.min(18, Math.max(3, text.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / 70)), 0) + 1))

const groupes = computed(() => {
  const map = new Map<string, Champ[]>()
  for (const c of champs.value) map.set(c.groupe, [...(map.get(c.groupe) ?? []), c])
  return [...map]
})
const changed = computed(() => champs.value.filter((c) => draft[c.key] !== c.valeur))
// Textes qui attendent une information (hébergeur, médiateur…) : on les signale pour qu'ils ne partent pas en ligne ainsi

async function save() {
  error.value = ''
  errorField.value = ''
  saved.value = false
  saving.value = true
  try {
    const valeurs = Object.fromEntries(changed.value.map((c) => [c.key, draft[c.key]!]))
    fill((await api<{ champs: Champ[] }>('/site/content', { method: 'PATCH', body: { valeurs } })).champs)
    saved.value = true
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Enregistrement impossible.'
    if (e instanceof ApiError && e.field) errorField.value = e.field
  } finally {
    saving.value = false
  }
}
async function reset(c: Champ) {
  error.value = ''
  saved.value = false
  try {
    fill((await api<{ champs: Champ[] }>('/site/content/reset', { method: 'POST', body: { key: c.key } })).champs)
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Action impossible.'
  }
}
</script>

<template>
  <form class="pane" @submit.prevent="save">
    <p v-if="error" class="alert bad" role="alert">{{ error }}</p>
    <p v-if="saved" class="alert ok" role="status"><AppIcon name="check" :size="16" /><span>Textes enregistrés : ils sont déjà en ligne.</span></p>
    <p v-if="loading" class="muted" aria-busy="true">Chargement…</p>

    <fieldset v-for="[groupe, list] in groupes" :key="groupe" class="card group">
      <legend>{{ groupe }}</legend>
      <div v-for="c in list" :key="c.key" class="field">
        <div class="lab">
          <label :for="`f-${c.key}`">{{ c.label }}</label>
          <button v-if="c.modifie && draft[c.key] === c.valeur" type="button" class="link" @click="reset(c)">Rétablir le texte d’origine</button>
        </div>
        <textarea v-if="c.long" :id="`f-${c.key}`" v-model="draft[c.key]" class="input" :class="{ invalid: errorField === c.key }" :rows="rowsFor(draft[c.key])" :maxlength="c.max + 200" />
        <input v-else :id="`f-${c.key}`" v-model="draft[c.key]" class="input" :class="{ invalid: errorField === c.key }" />
        <span class="count muted" :class="{ over: (draft[c.key]?.length ?? 0) > c.max }">{{ draft[c.key]?.length ?? 0 }} / {{ c.max }}</span>
      </div>
    </fieldset>

    <div class="bar">
      <button class="btn primary" type="submit" :disabled="saving || !changed.length">{{ saving ? 'Enregistrement…' : 'Enregistrer' }}</button>
      <span v-if="changed.length" class="muted">{{ changed.length }} texte{{ changed.length > 1 ? 's' : '' }} modifié{{ changed.length > 1 ? 's' : '' }}</span>
      <RouterLink class="btn" :to="{ name: 'site-home' }" target="_blank" rel="noopener">Voir le site</RouterLink>
    </div>
  </form>
</template>

<style scoped>
.pane {
  display: grid;
  gap: 16px;
}
.group {
  display: grid;
  gap: 16px;
  padding: 18px;
  margin: 0;
}
.lab {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  align-items: baseline;
}
.link {
  border: 0;
  background: none;
  color: var(--accent);
  text-decoration: underline;
  padding: 0;
  font-size: 0.82rem;
}
textarea.input {
  resize: vertical;
  line-height: 1.5;
}
.hint {
  font-size: 0.86rem;
}
.count {
  font-size: 0.78rem;
  text-align: right;
}
.count.over {
  color: var(--bad);
}
.bar {
  position: sticky;
  bottom: 0;
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  padding: 12px 0;
  background: linear-gradient(transparent, var(--bg) 30%);
}
</style>
