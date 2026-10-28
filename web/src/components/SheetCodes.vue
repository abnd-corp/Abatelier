<script setup lang="ts">
import { ref } from 'vue'
import { api, ApiError } from '@/api'
import AppIcon from '@/components/AppIcon.vue'
import CodeField from '@/components/CodeField.vue'
import type { Feuille } from '@/lib/stock'

// Codes-barres d'une référence du stock : ceux du fournisseur, qui servent à la reconnaître à la réception.
// Une même référence peut en avoir plusieurs (paquet, palette…).
const props = defineProps<{ feuille: Pick<Feuille, 'id' | 'libelle' | 'codes'> }>()
const emit = defineEmits<{ changed: [] }>()

const code = ref('')
const error = ref('')
const busy = ref(false)

async function add() {
  error.value = ''
  busy.value = true
  try {
    await api('/stock/codes', { method: 'POST', body: { code: code.value, sheetId: props.feuille.id } })
    code.value = ''
    emit('changed')
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Association impossible.'
  } finally {
    busy.value = false
  }
}

async function remove(c: string) {
  error.value = ''
  busy.value = true
  try {
    await api(`/stock/codes/${encodeURIComponent(c)}`, { method: 'DELETE' })
    emit('changed')
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Suppression impossible.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="codes">
    <ul v-if="feuille.codes?.length" class="list">
      <li v-for="c in feuille.codes" :key="c">
        <span class="mono">{{ c }}</span>
        <button class="btn small danger" type="button" :disabled="busy" :aria-label="`Retirer le code ${c} de ${feuille.libelle}`" @click="remove(c)"><AppIcon name="x" :size="14" /></button>
      </li>
    </ul>
    <p v-else class="muted">Aucun code-barres : à la réception, ce code sera à associer.</p>
    <form class="add" novalidate @submit.prevent="add">
      <label :for="`code-${feuille.id}`">Ajouter un code-barres</label>
      <CodeField :id="`code-${feuille.id}`" v-model="code" :invalid="!!error" />
      <p v-if="error" class="alert bad" role="alert">{{ error }}</p>
      <button class="btn primary" type="submit" :disabled="busy || !code.trim()">Associer ce code</button>
    </form>
  </div>
</template>

<style scoped>
.codes {
  display: grid;
  gap: 10px;
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
}
.list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface-2);
}
.add {
  display: grid;
  gap: 8px;
}
</style>
