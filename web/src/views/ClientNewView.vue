<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, ApiError } from '@/api'
import { emptyClient, hasIdentity, MANUAL_ORIGINES, ORIGINE_LABELS, type ClientOrigine } from '@/lib/clients'
import ClientForm from '@/components/ClientForm.vue'

const router = useRouter()
const fields = reactive(emptyClient())
const origine = ref<ClientOrigine>('atelier')
const error = ref<{ field?: string; msg: string; clientId?: string } | null>(null)
const saving = ref(false)

async function save() {
  error.value = null
  saving.value = true
  try {
    const res = await api<{ id: string }>('/clients', { method: 'POST', body: { ...fields, origine: origine.value } })
    await router.push({ name: 'client', params: { id: res.id } })
  } catch (e) {
    error.value = e instanceof ApiError ? { msg: e.message, field: e.field, clientId: e.data?.clientId as string | undefined } : { msg: 'L’enregistrement a échoué. Réessayez.' }
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="page-head">
    <div>
      <span class="eyebrow">Ventes</span>
      <h1>Nouveau client</h1>
    </div>
  </div>

  <form class="layout" novalidate @submit.prevent="save">
    <p v-if="error" class="alert bad" role="alert">
      {{ error.msg }}
      <RouterLink v-if="error.clientId" :to="{ name: 'client', params: { id: error.clientId } }">Ouvrir sa fiche</RouterLink>
    </p>

    <ClientForm v-model="fields" :error="error">
      <fieldset class="card group">
        <legend>Origine</legend>
        <div class="field">
          <label for="c-origine">Premier contact</label>
          <select id="c-origine" v-model="origine" class="input">
            <option v-for="o in MANUAL_ORIGINES" :key="o" :value="o">{{ ORIGINE_LABELS[o] }}</option>
          </select>
        </div>
      </fieldset>
    </ClientForm>

    <div class="actions">
      <button class="btn primary" type="submit" :disabled="saving || !hasIdentity(fields)">
        {{ saving ? 'Enregistrement…' : 'Enregistrer le client' }}
      </button>
      <RouterLink class="btn" :to="{ name: 'clients' }">Annuler</RouterLink>
    </div>
  </form>
</template>

<style scoped>
.layout {
  display: grid;
  gap: 16px;
  max-width: 860px;
}
.group {
  margin: 0;
  padding: 18px 20px 20px;
  display: grid;
  gap: 14px;
  min-width: 0;
}
.alert a {
  color: inherit;
  font-weight: 650;
  margin-left: auto;
  white-space: nowrap;
}
.actions {
  display: flex;
  gap: 8px;
  position: sticky;
  bottom: 0;
  padding: 12px 0 calc(12px + env(safe-area-inset-bottom));
  background: linear-gradient(transparent, var(--bg) 30%);
}
</style>
