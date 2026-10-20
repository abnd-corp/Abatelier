<script setup lang="ts">
import { ref } from 'vue'
import { apiBlob, ApiError } from '@/api'
import AppIcon from '@/components/AppIcon.vue'

// Export CSV pour le comptable : factures et avoirs émis, ou paiements encaissés, sur une période
const iso = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(d)
const now = new Date()

const type = ref<'ventes' | 'encaissements'>('ventes')
const du = ref(`${iso(now).slice(0, 4)}-01-01`)
const au = ref(iso(now))
const busy = ref(false)
const error = ref('')
const done = ref('')

/** Raccourcis : le mois précédent, le trimestre en cours, l'année en cours. */
function preset(kind: 'mois' | 'trimestre' | 'annee') {
  const y = now.getFullYear()
  const m = now.getMonth()
  const day = (d: Date) => iso(d)
  if (kind === 'mois') [du.value, au.value] = [day(new Date(y, m - 1, 1)), day(new Date(y, m, 0))]
  else if (kind === 'trimestre') [du.value, au.value] = [day(new Date(y, Math.floor(m / 3) * 3, 1)), iso(now)]
  else [du.value, au.value] = [`${y}-01-01`, iso(now)]
}

async function download() {
  error.value = ''
  done.value = ''
  busy.value = true
  try {
    const blob = await apiBlob(`/billing/export?${new URLSearchParams({ type: type.value, du: du.value, au: au.value })}`)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${type.value}-${du.value}_${au.value}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    done.value = 'Fichier téléchargé : ouvrez-le avec Excel ou LibreOffice, ou envoyez-le à votre comptable.'
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Export impossible.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <details class="card export">
    <summary><AppIcon name="download" :size="16" />Exporter pour le comptable</summary>
    <form class="body" @submit.prevent="download">
      <div class="field">
        <label for="exp-type">Contenu</label>
        <select id="exp-type" v-model="type" class="input">
          <option value="ventes">Factures et avoirs émis (ventes)</option>
          <option value="encaissements">Paiements encaissés</option>
        </select>
      </div>
      <div class="field">
        <label for="exp-du">Du</label>
        <input id="exp-du" v-model="du" type="date" class="input" required />
      </div>
      <div class="field">
        <label for="exp-au">Au</label>
        <input id="exp-au" v-model="au" type="date" class="input" required />
      </div>
      <div class="actions">
        <button class="btn primary" type="submit" :disabled="busy || !du || !au"><AppIcon name="download" :size="16" />{{ busy ? 'Préparation…' : 'Télécharger le CSV' }}</button>
      </div>
      <div class="presets" role="group" aria-label="Périodes rapides">
        <button type="button" class="chip" @click="preset('mois')">Mois précédent</button>
        <button type="button" class="chip" @click="preset('trimestre')">Trimestre en cours</button>
        <button type="button" class="chip" @click="preset('annee')">Année en cours</button>
      </div>
      <p v-if="error" class="alert bad wide" role="alert">{{ error }}</p>
      <p v-if="done" class="alert ok wide" role="status">{{ done }}</p>
    </form>
  </details>
</template>

<style scoped>
.export summary {
  cursor: pointer;
  padding: 12px 16px;
  font-weight: 600;
  display: flex;
  gap: 8px;
  align-items: center;
}
.body {
  display: grid;
  grid-template-columns: minmax(0, 2fr) repeat(2, minmax(0, 1fr)) auto;
  gap: 12px 16px;
  align-items: end;
  padding: 4px 16px 16px;
}
.presets {
  grid-column: 1 / -1;
}
.presets,
.actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.wide {
  grid-column: 1 / -1;
}
@media (max-width: 760px) {
  .body {
    grid-template-columns: minmax(0, 1fr);
  }
  .actions .btn {
    width: 100%;
  }
}
</style>
