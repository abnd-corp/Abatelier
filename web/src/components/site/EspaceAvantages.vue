<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue'
import { site } from '@/lib/site'

// Ce que gagne un client à ouvrir son espace, et ce que devient ce qu'il nous confie. Ton posé : rien n'est obligatoire
// pour voir les prix, et le téléphone et la page Contact restent ouverts.
defineProps<{ compact?: boolean; idPrefix?: string }>()
</script>

<template>
  <aside class="av" :class="{ compact }" aria-label="Pourquoi créer un espace client">
    <section :aria-labelledby="`${idPrefix ?? 'av'}-pourquoi`">
      <h3 :id="`${idPrefix ?? 'av'}-pourquoi`">Pourquoi un espace client ?</h3>
      <ul class="gains">
        <li>
          <AppIcon name="file" :size="20" />
          <span><b>Votre devis tout de suite</b>, en PDF numéroté, sans attendre une réponse.</span>
        </li>
        <li>
          <AppIcon name="clock" :size="20" />
          <span><b>Le suivi de votre commande</b> : validée, en fabrication, prête, avec la date prévue.</span>
        </li>
        <li>
          <AppIcon name="check" :size="20" />
          <span><b>Acceptez en un clic</b> : l’atelier est prévenu et lance la suite.</span>
        </li>
        <li>
          <AppIcon name="receipt" :size="20" />
          <span><b>Tout au même endroit</b> : devis, commandes et factures, quand vous voulez.</span>
        </li>
      </ul>
      <p class="muted calm">Voir les prix ne demande aucun compte. Et vous pouvez toujours nous appeler ou <RouterLink :to="{ name: 'site-contact' }">nous envoyer votre plan</RouterLink> : on s’en occupe comme avant.</p>
    </section>

    <section class="data" :aria-labelledby="`${idPrefix ?? 'av'}-donnees`">
      <h3 :id="`${idPrefix ?? 'av'}-donnees`"><AppIcon name="shield" :size="18" /> Ce que nous faisons de vos données</h3>
      <dl>
        <dt>Ce que nous gardons</dt>
        <dd>Votre nom, votre adresse e-mail, votre téléphone si vous le donnez, et vos devis, commandes et factures.</dd>
        <dt>Pourquoi</dt>
        <dd>Uniquement pour établir vos devis, fabriquer vos pièces, les facturer et vous répondre. Les factures sont conservées 10 ans, comme la loi l’exige.</dd>
        <dt>Ce que nous ne faisons pas</dt>
        <dd>Pas de revente, pas de publicité, pas de cookie de suivi, pas d’e-mail commercial. Votre mot de passe est chiffré : nous ne pouvons pas le lire.</dd>
        <dt>Vos droits</dt>
        <dd>
          Voir, corriger ou supprimer vos données en nous écrivant<template v-if="site?.entreprise.email"> à <a :href="`mailto:${site.entreprise.email}`">{{ site.entreprise.email }}</a></template>.
          <RouterLink :to="{ name: 'site-confidentialite' }" target="_blank">Politique de confidentialité complète</RouterLink>
        </dd>
      </dl>
    </section>
  </aside>
</template>

<style scoped>
.av {
  display: grid;
  gap: 18px;
  padding: 20px 22px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
  align-content: start;
}
h3 {
  margin: 0 0 10px;
  font-size: 1.02rem;
  text-transform: none;
  display: flex;
  align-items: center;
  gap: 8px;
}
.gains {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 12px;
}
.gains li {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr);
  gap: 10px;
  align-items: start;
}
.gains svg {
  color: var(--accent);
  margin-top: 1px;
}
.calm {
  margin: 12px 0 0;
  font-size: 0.9rem;
}
.data {
  padding-top: 16px;
  border-top: 1px solid var(--line);
}
dl {
  margin: 0;
  display: grid;
  gap: 2px 0;
  font-size: 0.92rem;
}
dt {
  font-weight: 600;
  margin-top: 8px;
}
dt:first-child {
  margin-top: 0;
}
dd {
  margin: 0;
  color: var(--muted);
}
.compact {
  padding: 16px 18px;
}
.compact .gains {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 18px;
}
.compact dl {
  grid-template-columns: minmax(0, 11em) minmax(0, 1fr);
  gap: 6px 14px;
}
.compact dt {
  margin-top: 0;
}
@media (max-width: 720px) {
  .compact .gains,
  .compact dl {
    grid-template-columns: minmax(0, 1fr);
  }
  .compact dl {
    gap: 2px 0;
  }
  .compact dt {
    margin-top: 8px;
  }
}
</style>
