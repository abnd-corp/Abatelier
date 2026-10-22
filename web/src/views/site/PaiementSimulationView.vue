<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, ApiError } from '@/api'
import { eur } from '@/lib/catalog'
import type { PaiementStatut } from '@/lib/boutique'

// Page de paiement de DÉMONSTRATION : remplace celle du prestataire en développement et dans les tests.
// Aucune carte n'est demandée, aucun argent ne bouge. Elle n'existe pas avec un vrai prestataire.
const props = defineProps<{ id: string }>()
const router = useRouter()
const p = ref<PaiementStatut | null>(null)
const error = ref('')
const busy = ref(false)

onMounted(async () => {
  try {
    p.value = await api<PaiementStatut>(`/espace/boutique/paiements/${props.id}`)
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 401)) error.value = e instanceof ApiError ? e.message : 'Paiement introuvable.'
  }
})

async function issue(issue: 'paye' | 'echec') {
  busy.value = true
  error.value = ''
  try {
    await api(`/espace/boutique/paiements/${props.id}/simulation`, { method: 'POST', body: { issue } })
    await router.push({ name: 'site-paiement-retour', params: { id: props.id } })
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Action impossible.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="s-wrap page">
    <section class="card box" aria-labelledby="titre">
      <span class="eyebrow">Démonstration</span>
      <h1 id="titre">Paiement de démonstration</h1>
      <p class="alert warn" role="note">Page d’essai : aucune carte n’est demandée et aucun argent ne bouge. Avec le vrai prestataire, vous seriez sur sa page sécurisée.</p>
      <p v-if="error" class="alert bad" role="alert">{{ error }}</p>
      <p v-if="!p && !error" class="muted" aria-busy="true">Chargement…</p>
      <template v-else-if="p && !p.simulation">
        <p class="muted">Ce paiement ne se règle pas ici.</p>
      </template>
      <template v-else-if="p">
        <p class="montant">
          À payer : <b>{{ eur(p.montantTtc) }}</b> TTC
        </p>
        <p v-if="p.statut !== 'attente'" class="muted">Ce paiement est déjà réglé ou abandonné.</p>
        <p v-else class="actions">
          <button class="s-btn primary big" type="button" :disabled="busy" @click="issue('paye')">Simuler un paiement réussi</button>
          <button class="s-btn" type="button" :disabled="busy" @click="issue('echec')">Simuler un échec</button>
        </p>
      </template>
    </section>
  </div>
</template>

<style scoped>
.page {
  padding-top: 40px;
  padding-bottom: 48px;
}
.box {
  max-width: 560px;
  margin: 0 auto;
  padding: 26px;
  display: grid;
  gap: 14px;
}
.box h1,
.box p {
  margin: 0;
}
h1 {
  text-transform: none;
}
.alert.warn {
  background: var(--warn-soft);
  color: var(--warn);
}
.montant b {
  font-size: 1.4rem;
}
.actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
@media (max-width: 520px) {
  .actions .s-btn {
    width: 100%;
  }
}
</style>
