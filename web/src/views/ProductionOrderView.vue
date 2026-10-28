<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { api, ApiError } from '@/api'
import { dateTime } from '@/lib/format'
import { sheetUrl, shortDay, statutOf, stepAction, type OrderEvent, type OrderStatut } from '@/lib/orders'
import { useUiStore } from '@/stores/ui'
import AppIcon from '@/components/AppIcon.vue'
import OrderLineCard from '@/components/orders/OrderLineCard.vue'
import type { LigneFeuilles } from '@/lib/stock'

// Fiche de fabrication : les pièces à plier. Du client, seulement son nom ; ni coordonnées ni prix
interface Detail {
  order: {
    id: string
    numero: string
    client: string
    prisPar: string | null
    prisParMoi: boolean
    kind: 'sur_mesure' | 'boutique'
    statut: OrderStatut
    statutLabel: string
    livraisonMode: 'retrait' | 'livraison'
    datePrevue: string | null
    next: OrderStatut | null
  }
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
// Feuilles conseillées d'après le stock : un plus, l'absence de réponse ne bloque rien
const feuilles = ref<LigneFeuilles[]>([])

async function load() {
  try {
    detail.value = await api<Detail>(`/production/${id.value}`)
    ui.crumb = { for: route.fullPath, label: detail.value.order.numero }
    document.title = `${detail.value.order.numero} · Fabrication · Atelier · Alu Pliage Service`
    api<{ lignes: LigneFeuilles[] }>(`/production/${id.value}/feuilles`)
      .then((r) => (feuilles.value = r.lignes.filter((l) => l.besoin)))
      .catch(() => {})
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
      <h1>{{ detail.order.client }}</h1>
      <span class="numero mono">{{ detail.order.numero }}</span>
      <span class="pill" :class="statutOf(detail.order.statut).tone">{{ detail.order.statutLabel }}</span>
      <span v-if="detail.order.kind === 'boutique'" class="pill accent">Boutique</span>
    </div>
    <p class="meta">
      <span
        ><AppIcon name="calendar" :size="16" /> Prévue le <b>{{ shortDay(detail.order.datePrevue) }}</b></span
      >
      <span><AppIcon name="layers" :size="16" /> {{ total }} pièce{{ total > 1 ? 's' : '' }}</span>
      <span v-if="detail.order.prisPar"
        ><AppIcon name="user" :size="16" /> Pris en charge par <b>{{ detail.order.prisPar }}</b></span
      >
      <span
        ><AppIcon :name="detail.order.livraisonMode === 'retrait' ? 'home' : 'truck'" :size="16" />
        {{ detail.order.livraisonMode === 'retrait' ? 'Retrait à l’atelier' : 'Livraison sur chantier' }}</span
      >
    </p>
    <div class="actions">
      <button v-if="detail.order.next" class="btn primary" type="button" :disabled="busy" @click="advance">{{ stepAction(detail.order.next, detail.order.livraisonMode) }}</button>
      <a class="btn" :href="sheetUrl(detail.order.id)" target="_blank" rel="noopener"><AppIcon name="printer" :size="16" />Imprimer la fiche</a>
    </div>

    <div class="pieces">
      <OrderLineCard v-for="(l, i) in detail.lignes" :key="l.id" :index="i" :line="l" />
    </div>

    <section v-if="feuilles.length" class="card block" aria-labelledby="feuilles">
      <h2 id="feuilles">Feuilles à prendre</h2>
      <p class="muted hint">
        Conseil d’après le stock de l’atelier : les chutes d’abord, puis la feuille qui perd le moins. À vous de confirmer sur place ; le stock se met à jour dans « Stock de feuilles ».
      </p>
      <ul class="conseils">
        <li v-for="(l, i) in feuilles" :key="l.ligneId">
          <h3>
            Pièce {{ i + 1 }}<template v-if="l.repere"> · {{ l.repere }}</template>
            <span class="muted"
              >{{ l.modeleLabel }} · développé {{ l.besoin!.developpe.toLocaleString('fr-FR') }} mm × {{ l.besoin!.longueur.toLocaleString('fr-FR') }} mm · {{ l.besoin!.quantite }} pièce{{
                l.besoin!.quantite > 1 ? 's' : ''
              }}</span
            >
          </h3>
          <template v-if="l.conseils.length">
            <p class="best">
              Prendre <b>{{ l.conseils[0]!.feuilles }} feuille{{ l.conseils[0]!.feuilles > 1 ? 's' : '' }}</b> : {{ l.conseils[0]!.libelle }}
              <span class="pill accent">{{ l.conseils[0]!.parFeuille }} pièce{{ l.conseils[0]!.parFeuille > 1 ? 's' : '' }} par feuille</span>
              <span class="pill" :class="l.conseils[0]!.perte > 40 ? 'warn' : 'ok'">{{ l.conseils[0]!.perte.toLocaleString('fr-FR') }} % de perte</span>
              <span v-if="l.conseils[0]!.chute" class="pill neutral">Chute</span>
              <span v-if="l.conseils[0]!.feuilles > l.conseils[0]!.enStock" class="pill bad">Il n’y en a que {{ l.conseils[0]!.enStock }} en stock</span>
            </p>
            <p v-if="l.conseils.length > 1" class="muted alt">
              Sinon :
              <template v-for="(c, j) in l.conseils.slice(1)" :key="c.sheetId"
                >{{ j ? ' · ' : '' }}{{ c.feuilles }} × {{ c.libelle }} ({{ c.perte.toLocaleString('fr-FR') }} % de perte, {{ c.enStock }} en stock)</template
              >
            </p>
          </template>
          <p v-else class="alert warn" role="status">{{ l.raison }}</p>
        </li>
      </ul>
    </section>

    <section class="card block">
      <h2>Historique</h2>
      <ol class="events">
        <li v-for="(e, i) in detail.events" :key="i">
          <b>{{ statutOf(e.statut).label }}</b>
          <span class="muted"
            >{{ dateTime(e.at) }}<template v-if="e.nom"> · {{ e.nom }}</template></span
          >
        </li>
      </ol>
    </section>
  </template>
</template>

<style scoped>
.conseils {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  display: grid;
  gap: 14px;
}
.conseils h3 {
  margin: 0 0 4px;
  font-size: 0.98rem;
  text-transform: none;
}
.conseils p {
  margin: 4px 0;
}
.best {
  display: flex;
  gap: 6px 10px;
  flex-wrap: wrap;
  align-items: center;
}
.alt {
  font-size: 0.86rem;
}
.alert.warn {
  background: var(--warn-soft);
  color: var(--warn);
}
.hint {
  font-size: 0.86rem;
}
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
.identity .numero {
  color: var(--muted);
  font-size: 1rem;
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
