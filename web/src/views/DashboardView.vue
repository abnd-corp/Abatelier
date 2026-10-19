<script setup lang="ts">
const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
</script>

<template>
  <div class="page-head">
    <div>
      <span class="eyebrow">{{ today }}</span>
      <h1>Tableau de bord</h1>
    </div>
  </div>
  <section class="card empty">
    <h2>Vous êtes connecté</h2>
    <p class="muted">Les commandes, le planning, les devis et les tarifs arriveront ici aux prochaines étapes.</p>
  </section>
</template>

<style scoped>
.empty {
  padding: 28px;
  display: grid;
  gap: 6px;
}
</style>
