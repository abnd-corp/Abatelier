<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import EspaceAuthForm from '@/components/site/EspaceAuthForm.vue'
import EspaceAvantages from '@/components/site/EspaceAvantages.vue'
import { retourEspace } from '@/lib/espace'

// Pages « Connexion » et « Créer mon espace client » (un seul écran, deux formulaires)
const props = defineProps<{ mode: 'inscription' | 'connexion' }>()
const route = useRoute()
const router = useRouter()
const inscription = computed(() => props.mode === 'inscription')
const expired = computed(() => route.query.expire === '1')
// On garde la page où revenir quand on passe d'un formulaire à l'autre
const other = computed(() => ({ name: inscription.value ? 'espace-connexion' : 'espace-inscription', query: route.query.redirect ? { redirect: String(route.query.redirect) } : {} }))
const MESSAGES: Record<string, string> = {
  echec: 'La connexion avec Google n’a pas abouti. Réessayez, ou utilisez votre adresse e-mail.',
  desactive: 'Cet espace client est désactivé. Contactez l’atelier.',
  indisponible: 'La connexion avec Google n’est pas disponible pour le moment.',
}
const googleMessage = computed(() => MESSAGES[String(route.query.google ?? '')] ?? '')
const done = () => router.replace(retourEspace(route.query.redirect))
</script>

<template>
  <div class="s-wrap page wide">
    <section class="card box" :aria-labelledby="'titre-espace'">
      <span class="eyebrow">Espace client</span>
      <h1 id="titre-espace">{{ inscription ? 'Créer mon espace client' : 'Me connecter' }}</h1>
      <p class="muted">
        {{ inscription ? 'Gratuit, en une minute. Vous retrouvez vos devis, suivez vos commandes et téléchargez vos factures.' : 'Retrouvez vos devis, le suivi de vos commandes et vos factures.' }}
      </p>
      <p v-if="expired" class="alert bad" role="alert">Votre session a expiré. Reconnectez-vous.</p>
      <p v-if="googleMessage" class="alert bad" role="alert">{{ googleMessage }}</p>
      <EspaceAuthForm :mode="mode" :submit-text="inscription ? 'Créer mon espace' : 'Me connecter'" id-prefix="auth" :after="done" avec-google />
      <p class="switch">
        <template v-if="inscription">Déjà un espace client ? <RouterLink :to="other">Me connecter</RouterLink></template>
        <template v-else>Pas encore d’espace client ? <RouterLink :to="other">Créer mon espace</RouterLink></template>
      </p>
    </section>
    <EspaceAvantages id-prefix="auth-av" />
  </div>
</template>

<style scoped>
.page {
  padding-top: 40px;
  padding-bottom: 40px;
}
/* Connexion et création : le formulaire à gauche, « Pourquoi un espace client ? » à droite (dessous sur téléphone) */
.page.wide {
  display: grid;
  grid-template-columns: minmax(0, 520px) minmax(0, 1fr);
  gap: 24px;
  align-items: stretch;
  justify-content: center;
}
.box {
  max-width: 520px;
  margin: 0 auto;
  width: 100%;
  padding: 28px;
  display: grid;
  gap: 14px;
}
h1 {
  margin: 0;
  text-transform: none;
  font-size: clamp(1.6rem, 4vw, 2.1rem);
}
.switch {
  margin: 0;
  text-align: center;
}
@media (max-width: 900px) {
  .page.wide {
    grid-template-columns: minmax(0, 1fr);
  }
  /* Une seule colonne : « Pourquoi un espace client ? » a la largeur du formulaire */
  .page.wide > .av {
    width: 100%;
    max-width: 520px;
    margin: 0 auto;
  }
}
@media (max-width: 520px) {
  .box {
    padding: 20px;
  }
}
</style>
