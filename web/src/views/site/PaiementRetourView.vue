<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { api, ApiError } from '@/api'
import AppIcon from '@/components/AppIcon.vue'
import { eur } from '@/lib/catalog'
import type { PaiementStatut } from '@/lib/boutique'
import { usePanierStore } from '@/stores/panier'

// Retour de la page de paiement. Le navigateur ne prouve rien : on attend que le prestataire ait confirmé le paiement
// (la commande n'existe qu'à ce moment), en demandant régulièrement où il en est.
const props = defineProps<{ id: string }>()
const panier = usePanierStore()
const p = ref<PaiementStatut | null>(null)
const error = ref('')
const waited = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
let tries = 0

async function poll() {
  try {
    p.value = await api<PaiementStatut>(`/espace/boutique/paiements/${props.id}`)
    if (p.value.statut === 'paye') {
      if (p.value.surMesure) {
        try {
          sessionStorage.removeItem('aps-configurateur')
        } catch {
          /* stockage indisponible */
        }
      } else panier.clear()
    }
    if (p.value.statut === 'attente') {
      if (++tries >= 20) waited.value = true
      else timer = setTimeout(poll, 1500)
    }
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 401)) error.value = e instanceof ApiError ? e.message : 'Impossible de vérifier le paiement. Réessayez.'
  }
}
onMounted(poll)
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <div class="s-wrap page">
    <section class="card box" aria-live="polite">
      <p v-if="error" class="alert bad" role="alert">{{ error }}</p>
      <p v-else-if="!p" class="muted" aria-busy="true">Vérification du paiement…</p>

      <template v-else-if="p.statut === 'paye' && p.commande">
        <AppIcon name="check" :size="36" class="ok" />
        <h1>Merci, votre commande est confirmée</h1>
        <p>Nous avons bien reçu votre paiement de <b>{{ eur(p.montantTtc) }}</b> pour la commande <b>{{ p.commande.numero }}</b>. Un e-mail de confirmation vous est envoyé.</p>
        <p class="muted">Nous vérifions que tout est réalisable. Si ce n’était pas le cas, nous vous préviendrions et vous rembourserions intégralement.</p>
        <p><RouterLink :to="{ name: 'espace-commande', params: { id: p.commande.id } }" class="s-btn primary">Suivre ma commande</RouterLink></p>
      </template>

      <template v-else-if="p.statut === 'echec'">
        <h1>Le paiement n’a pas abouti</h1>
        <p>Aucun montant n’a été débité et {{ p.surMesure ? 'votre configuration est conservée' : 'votre panier est conservé' }}. Vous pouvez réessayer.</p>
        <p v-if="p.surMesure"><RouterLink :to="{ name: 'site-configurateur' }" class="s-btn primary">Retourner au configurateur</RouterLink></p>
        <p v-else><RouterLink :to="{ name: 'site-panier' }" class="s-btn primary">Retourner au panier</RouterLink></p>
      </template>

      <template v-else-if="p.statut === 'rembourse'">
        <h1>Paiement remboursé</h1>
        <p>Ce paiement a été remboursé.</p>
        <p><RouterLink :to="{ name: 'espace' }" class="s-btn">Mon espace client</RouterLink></p>
      </template>

      <template v-else>
        <h1>Nous attendons la confirmation de votre banque</h1>
        <p v-if="!waited" class="muted" aria-busy="true">Cela prend en général quelques secondes…</p>
        <p v-else>La confirmation tarde. Si votre paiement a été accepté, votre commande apparaîtra dans votre espace client et vous recevrez un e-mail. Ne payez pas une seconde fois.</p>
        <p v-if="waited"><RouterLink :to="{ name: 'espace' }" class="s-btn primary">Mon espace client</RouterLink></p>
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
  max-width: 620px;
  margin: 0 auto;
  padding: 28px;
  display: grid;
  gap: 12px;
  justify-items: start;
}
.box h1,
.box p {
  margin: 0;
}
h1 {
  text-transform: none;
  font-size: clamp(1.5rem, 4vw, 2rem);
}
.ok {
  color: var(--ok);
}
</style>
