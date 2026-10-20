<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, ApiError } from '@/api'
import AppIcon from '@/components/AppIcon.vue'
import { eur } from '@/lib/catalog'
import { jour, nomCompte, statutDocument, type EspaceOrderSummary } from '@/lib/espace'
import { statutOf } from '@/lib/orders'
import { useEspaceStore } from '@/stores/espace'

// Accueil de l'espace client : les commandes (avec leur devis) et leur étape
const espace = useEspaceStore()
const router = useRouter()
const commandes = ref<EspaceOrderSummary[] | null>(null)
const error = ref('')

onMounted(async () => {
  try {
    commandes.value = (await api<{ commandes: EspaceOrderSummary[] }>('/espace/commandes')).commandes
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 401)) error.value = e instanceof ApiError ? e.message : 'Impossible de charger vos commandes. Réessayez.'
  }
})

const aValider = computed(() => (commandes.value ?? []).filter((c) => c.devis && (c.devis.statut === 'emis' || c.devis.statut === 'envoye') && c.statut !== 'annulee').length)

async function logout() {
  await espace.deconnecter()
  await router.replace({ name: 'site-home' })
}
</script>

<template>
  <div class="s-wrap page">
    <header class="top">
      <div>
        <span class="eyebrow">Espace client</span>
        <h1>Bonjour {{ espace.compte ? nomCompte(espace.compte) : '' }}</h1>
        <p class="muted">Vos devis, vos commandes et leur avancement.</p>
      </div>
      <div class="actions">
        <RouterLink :to="{ name: 'site-configurateur' }" class="s-btn primary"><AppIcon name="plus" :size="16" /> Nouveau devis</RouterLink>
        <button class="s-btn" type="button" @click="logout">Me déconnecter</button>
      </div>
    </header>

    <p v-if="error" class="alert bad" role="alert">{{ error }}</p>
    <p v-else-if="!commandes" class="muted" aria-busy="true">Chargement…</p>
    <template v-else>
      <p v-if="aValider" class="alert ok" role="status">
        {{ aValider === 1 ? 'Un devis attend' : `${aValider} devis attendent` }} votre réponse.
      </p>
      <section v-if="!commandes.length" class="card empty">
        <h2>Pas encore de commande</h2>
        <p class="muted">Composez vos pièces dans le configurateur : le devis apparaît ici tout de suite, avec le suivi de la commande.</p>
        <p><RouterLink :to="{ name: 'site-configurateur' }" class="s-btn primary">Ouvrir le configurateur</RouterLink></p>
      </section>
      <ul v-else class="list" aria-label="Vos commandes">
        <li v-for="c in commandes" :key="c.id" class="card row">
          <div class="main">
            <RouterLink :to="{ name: 'espace-commande', params: { id: c.id } }" class="num">{{ c.numero }}</RouterLink>
            <span class="muted">{{ c.kind === 'boutique' ? 'commandée' : 'demandée' }} le {{ jour(c.createdAt) }}</span>
          </div>
          <div class="pills">
            <span class="pill" :class="statutOf(c.statut).tone">{{ c.statutLabel }}</span>
            <span v-if="c.kind === 'boutique'" class="pill accent">Boutique</span>
            <span v-if="c.devis" class="pill" :class="statutDocument('devis', c.devis.statut).tone">{{ statutDocument('devis', c.devis.statut).label }}</span>
            <span v-if="c.facture" class="pill" :class="statutDocument('facture', c.facture.statut).tone">{{ statutDocument('facture', c.facture.statut).label }}</span>
          </div>
          <div class="amount">
            <b>{{ eur(c.ttc) }}</b> <span class="muted">TTC</span>
            <span v-if="c.datePrevue && c.statut !== 'livree' && c.statut !== 'annulee'" class="muted"> · prévue le {{ jour(c.datePrevue) }}</span>
          </div>
          <RouterLink :to="{ name: 'espace-commande', params: { id: c.id } }" class="s-btn">Voir</RouterLink>
        </li>
      </ul>
    </template>
  </div>
</template>

<style scoped>
.page {
  padding-top: 36px;
  padding-bottom: 40px;
  display: grid;
  gap: 18px;
}
.top {
  display: flex;
  justify-content: space-between;
  gap: 16px 24px;
  flex-wrap: wrap;
  align-items: flex-end;
}
h1 {
  margin: 6px 0 4px;
  text-transform: none;
  font-size: clamp(1.7rem, 4vw, 2.4rem);
}
.top p {
  margin: 0;
}
.actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.empty {
  padding: 24px;
  display: grid;
  gap: 8px;
  justify-items: start;
}
.empty h2,
.empty p {
  margin: 0;
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 12px;
}
.row {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1.4fr) minmax(0, 1.2fr) auto;
  gap: 12px 18px;
  align-items: center;
  padding: 16px 18px;
}
.main {
  display: grid;
  gap: 2px;
}
.num {
  font-weight: 700;
  font-size: 1.05rem;
  text-decoration: none;
}
.pills {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
@media (max-width: 860px) {
  .row {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .pills,
  .amount {
    grid-column: 1 / -1;
  }
}
@media (max-width: 520px) {
  .actions .s-btn {
    flex: 1 1 100%;
  }
}
</style>
