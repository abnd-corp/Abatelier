<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api, ApiError } from '@/api'
import AppIcon from '@/components/AppIcon.vue'
import { resizePhoto } from '@/lib/image'
import { photoUrl, type Emplacement } from '@/lib/site'
import { EMPLACEMENTS, type PhotoAdmin } from '@/lib/site-admin'

const photos = ref<PhotoAdmin[]>([])
const loading = ref(true)
const error = ref('')
const info = ref('')
const uploading = ref(false)
const place = ref<Emplacement>('realisation')
const alt = ref('')
const input = ref<HTMLInputElement | null>(null)
const confirmDelete = ref<string | null>(null)

async function load() {
  try {
    photos.value = (await api<{ photos: PhotoAdmin[] }>('/site/photos')).photos
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Chargement impossible.'
  } finally {
    loading.value = false
  }
}
onMounted(load)

const groups = computed(() => EMPLACEMENTS.map((e) => ({ ...e, items: photos.value.filter((p) => p.emplacement === e.value) })))

async function upload() {
  error.value = ''
  info.value = ''
  const files = [...(input.value?.files ?? [])]
  if (!files.length) {
    error.value = 'Choisissez une ou plusieurs photos.'
    return
  }
  uploading.value = true
  let done = 0
  try {
    for (const f of files) {
      const blob = await resizePhoto(f)
      await api(`/site/photos?emplacement=${place.value}&alt=${encodeURIComponent(alt.value)}`, { method: 'POST', raw: blob })
      done++
    }
    info.value = `${done} photo${done > 1 ? 's' : ''} ajoutée${done > 1 ? 's' : ''}.`
    alt.value = ''
    if (input.value) input.value.value = ''
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Envoi impossible.'
  } finally {
    uploading.value = false
    await load()
  }
}

async function saveAlt(p: PhotoAdmin, ev: Event) {
  const value = (ev.target as HTMLInputElement).value.trim()
  if (value === p.alt) return
  error.value = ''
  try {
    await api(`/site/photos/${p.id}`, { method: 'PATCH', body: { alt: value } })
    p.alt = value
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Enregistrement impossible.'
  }
}
async function moveTo(p: PhotoAdmin, emplacement: Emplacement) {
  error.value = ''
  try {
    await api(`/site/photos/${p.id}`, { method: 'PATCH', body: { emplacement } })
    await load()
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Action impossible.'
  }
}
async function shift(p: PhotoAdmin, sens: 'haut' | 'bas') {
  error.value = ''
  try {
    await api(`/site/photos/${p.id}/deplacer`, { method: 'POST', body: { sens } })
    await load()
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Action impossible.'
  }
}
async function remove(p: PhotoAdmin) {
  error.value = ''
  try {
    await api(`/site/photos/${p.id}`, { method: 'DELETE' })
    confirmDelete.value = null
    await load()
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Suppression impossible.'
  }
}
</script>

<template>
  <div class="pane">
    <p v-if="error" class="alert bad" role="alert">{{ error }}</p>
    <p v-if="info" class="alert ok" role="status"><AppIcon name="check" :size="16" />{{ info }}</p>

    <form class="card up" @submit.prevent="upload">
      <h2>Ajouter des photos</h2>
      <div class="row">
        <div class="field">
          <label for="p-place">Où l’afficher ?</label>
          <select id="p-place" v-model="place" class="input">
            <option v-for="e in EMPLACEMENTS" :key="e.value" :value="e.value">{{ e.label }}</option>
          </select>
          <span class="muted hint">{{ EMPLACEMENTS.find((e) => e.value === place)?.aide }}</span>
        </div>
        <div class="field">
          <label for="p-alt">Description (pour les malvoyants et Google)</label>
          <input id="p-alt" v-model="alt" class="input" maxlength="160" placeholder="Ex. : Couvertine gris anthracite sur un mur de clôture" />
        </div>
      </div>
      <div class="field">
        <label for="p-file">Photos</label>
        <input id="p-file" ref="input" type="file" class="input" accept="image/jpeg,image/png" multiple />
        <span class="muted hint">JPEG ou PNG. Les photos sont réduites automatiquement (1600 px) avant l’envoi.</span>
      </div>
      <p>
        <button class="btn primary" type="submit" :disabled="uploading"><AppIcon name="upload" :size="16" />{{ uploading ? 'Envoi…' : 'Envoyer' }}</button>
      </p>
    </form>

    <p v-if="loading" class="muted" aria-busy="true">Chargement…</p>
    <section v-for="g in groups" :key="g.value" class="card group" :aria-labelledby="`g-${g.value}`">
      <h2 :id="`g-${g.value}`">
        {{ g.label }} <span class="pill neutral">{{ g.items.length }}</span>
      </h2>
      <p v-if="!g.items.length" class="muted">Aucune photo.</p>
      <ul class="grid">
        <li v-for="(p, i) in g.items" :key="p.id" class="ph">
          <img :src="photoUrl(p.id)" :alt="p.alt" loading="lazy" :width="p.largeur" :height="p.hauteur" />
          <label class="sr-only" :for="`alt-${p.id}`">Description de la photo</label>
          <input :id="`alt-${p.id}`" class="input compact" :value="p.alt" maxlength="160" placeholder="Description" @change="saveAlt(p, $event)" />
          <div class="tools">
            <button type="button" class="btn small" :disabled="i === 0" :aria-label="'Monter la photo ' + (i + 1)" @click="shift(p, 'haut')"><AppIcon name="arrow-up" :size="14" /></button>
            <button type="button" class="btn small" :disabled="i === g.items.length - 1" :aria-label="'Descendre la photo ' + (i + 1)" @click="shift(p, 'bas')">
              <AppIcon name="arrow-down" :size="14" />
            </button>
            <select class="input compact" :aria-label="'Déplacer la photo ' + (i + 1) + ' vers'" :value="p.emplacement" @change="moveTo(p, ($event.target as HTMLSelectElement).value as Emplacement)">
              <option v-for="e in EMPLACEMENTS" :key="e.value" :value="e.value">{{ e.label }}</option>
            </select>
            <button v-if="confirmDelete !== p.id" type="button" class="btn small danger" :aria-label="'Supprimer la photo ' + (i + 1)" @click="confirmDelete = p.id">
              <AppIcon name="trash" :size="14" />
            </button>
            <template v-else>
              <button type="button" class="btn small danger" @click="remove(p)">Supprimer</button>
              <button type="button" class="btn small" @click="confirmDelete = null">Non</button>
            </template>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.pane {
  display: grid;
  gap: 16px;
}
.up,
.group {
  padding: 18px;
  display: grid;
  gap: 14px;
}
.row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.hint {
  font-size: 0.82rem;
}
h2 {
  text-transform: none;
  font-size: 1.1rem;
  display: flex;
  gap: 8px;
  align-items: center;
}
.grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}
.ph {
  display: grid;
  gap: 8px;
  align-content: start;
}
/* « height: auto » : sans lui, l'attribut height de la photo l'emporte sur le rapport 4/3 */
.ph img {
  width: 100%;
  height: auto;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  border-radius: 8px;
  border: 1px solid var(--line);
  background: var(--surface-2);
}
.tools {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
}
.tools select {
  flex: 1;
  min-width: 0;
}
@media (max-width: 640px) {
  .row {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
