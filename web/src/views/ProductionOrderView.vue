<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { api, ApiError } from '@/api'
import { dateTime } from '@/lib/format'
import { sheetUrl, shortDay, statutOf, STEP_ACTIONS, type OrderEvent, type OrderStatut } from '@/lib/orders'
import { useUiStore } from '@/stores/ui'
import AppIcon from '@/components/AppIcon.vue'
import OrderLineCard from '@/components/orders/OrderLineCard.vue'

// Fiche de fabrication : les pièces à plier, sans rien sur le client ni sur les prix
interface Detail {
  order: { id: string; numero: string; kind: 'sur_mesure' | 'boutique'; statut: OrderStatut; statutLabel: string; livraisonMode: 'retrait' | 'livraison'; datePrevue: string | null; next: OrderStatut | null }
  lignes: {
    id: string
    repere: string | null
    modeleLabel: string
    cap: number
    materialLabel: string
    colorLabel: string
    colorHex: string
    cotes: number[]
    angles: number[]
    longueur: number
    quantite: number
    accessoires: { nom: string; unite: 'piece' | 'paire'; quantite: number }[]
  }[]
  events: OrderEvent[]
}

const route = useRoute()
const ui = useUiStore()
const detail = ref<Detail | null>(null)
const error = ref('')
const notice = ref('')
const busy = ref(false)
const id = computed(() => route.params.id as string)

async function load() {
  try {
    detail.value = await api<Detail>(`/production/${id.value}`)
    ui.crumb = { for: route.fullPath, label: detail.value.order.numero }
    document.title = `${detail.value.order.numero} · Fabrication · Atelier · Alu Pliage Service`
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Chargement impossible.'
  }
}
onMounted(load)

async function advance() {
  const next = detail.value?.order.next
  if (!next) return
  busy.value = true
  error.value = ''
  try {
    await api(`/production/${id.value}/status`, { method: 'POST', body: { statut: next } })
    notice.value = `Commande passée à l’étape « ${statutOf(next).label} ».`
    if (next === 'livree') detail.value = null
    else await load()
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'L’action a échoué.'
  } finally {
    busy.value = false
  }
}
const total = computed(() => detail.value?.lignes.reduce((s, l) => s + l.quantite, 0) ?? 0)
</script>

<template>
  <RouterLink :to="{ name: 'production' }" class="back"><AppIcon name="arrow-left" :size="16" />Fabrication</RouterLink>
  <p v-if="notice" class="alert ok" role="status">{{ notice }}</p>
  <p v-if="error" class="alert bad" role="alert">{{ error }}</p>

  <template v-if="detail">
    <div class="identity">
      <h1 class="mono">{{ detail.order.numero }}</h1>
      <span class="pill" :class="statutOf(detail.order.statut).tone">{{ detail.order.statutLabel }}</span>
      <span v-if="detail.order.kind === 'boutique'" class="pill accent">Boutique</span>
    </div>
    <p class="meta">
      <span><AppIcon name="calendar" :size="16" /> Prévue le <b>{{ shortDay(detail.order.datePrevue) }}</b></span>
      <span><AppIcon name="layers" :size="16" /> {{ total }} pièce{{ total > 1 ? 's' : '' }}</span>
      <span><AppIcon :name="detail.order.livraisonMode === 'retrait' ? 'home' : 'truck'" :size="16" /> {{ detail.order.livraisonMode === 'retrait' ? 'Retrait à l’atelier' : 'Livraison sur chantier' }}</span>
    </p>
    <div class="actions">
      <button v-if="detail.order.next" class="btn primary" type="button" :disabled="busy" @click="advance">{{ STEP_ACTIONS[detail.order.next] }}</button>
      <a class="btn" :href="sheetUrl(detail.order.id)" target="_blank" rel="noopener"><AppIcon name="printer" :size="16" />Imprimer la fiche</a>
    </div>

    <div class="pieces">
      <OrderLineCard v-for="(l, i) in detail.lignes" :key="l.id" :index="i" :line="l" />
    </div>

    <section class="card block">
      <h2>Historique</h2>
      <ol class="events">
        <li v-for="(e, i) in detail.events" :key="i">
          <b>{{ statutOf(e.statut).label }}</b> <span class="muted">{{ dateTime(e.at) }}<template v-if="e.nom"> · {{ e.nom }}</template></span>
        </li>
      </ol>
    </section>
  </template>
</template>

<style scoped>
.back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--muted);
  text-decoration: none;
  font-size: 0.88rem;
  width: fit-content;
  margin-bottom: 12px;
}
.back:hover {
  color: var(--accent);
}
.identity {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}
.identity h1 {
  font-size: clamp(1.5rem, 3vw, 2rem);
}
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  color: var(--muted);
}
.meta span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.meta b {
  color: var(--ink);
}
.actions {
  margin: 4px 0 16px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.pieces {
  display: grid;
  gap: 12px;
  margin-bottom: 16px;
}
.block {
  padding: 18px 20px;
  display: grid;
  gap: 10px;
}
.events {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 6px;
  font-size: 0.9rem;
}
</style>
