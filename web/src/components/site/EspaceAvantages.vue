<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue'

// Ce que gagne un client à ouvrir son espace. L'usage des données est dans la politique de confidentialité, pas ici.
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
    </section>
  </aside>
</template>

<style scoped>
.av {
  display: grid;
  gap: 18px;
  align-content: start;
}
/* À côté du formulaire : une carte blanche comme la sienne, dont les cartes de raison s'étirent jusqu'en bas */
.av:not(.compact) {
  padding: 28px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
  grid-template-rows: minmax(0, 1fr);
}
.av:not(.compact) > section {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-height: 0;
}
.av:not(.compact) .gains {
  /* Les cartes s'étirent jusqu'en bas du formulaire, sans devenir démesurées quand il est long */
  grid-auto-rows: minmax(0, 190px);
  align-content: start;
}
h3 {
  margin: 0 0 14px;
  font-size: clamp(1.5rem, 3vw, 2rem);
  line-height: 1.15;
  text-transform: none;
}
.gains {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  /* Quadrillage 2 × 2 : une carte par raison */
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
/* Une carte par raison, aux couleurs du site */
.gains li {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
  align-content: start;
  justify-items: start;
  padding: 16px 18px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--accent) 28%, transparent);
  border-left: 4px solid var(--accent);
  background: var(--accent-soft);
}
.gains svg {
  box-sizing: content-box;
  padding: 8px;
  border-radius: 50%;
  background: var(--accent);
  color: var(--on-accent);
}
.gains span {
  color: var(--ink);
}
.gains b {
  color: var(--accent);
}
.compact h3 {
  font-size: 1.15rem;
  margin-bottom: 10px;
}
@media (max-width: 520px) {
  .av:not(.compact) {
    padding: 20px;
  }
}
@media (max-width: 420px) {
  .gains {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
