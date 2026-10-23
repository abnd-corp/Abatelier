<template>
  <div class="s-wrap nf">
    <span class="eyebrow">Erreur 404</span>
    <h1>Cette page n’existe pas</h1>
    <p class="muted">Elle a peut-être été déplacée. Retournez à l’accueil ou contactez-nous.</p>
    <p>
      <RouterLink :to="{ name: 'site-home' }" class="s-btn primary">Retour à l’accueil</RouterLink>
      <RouterLink :to="{ name: 'site-contact' }" class="s-btn">Nous contacter</RouterLink>
    </p>
  </div>
</template>

<style scoped>
.nf {
  padding: 80px 0;
  display: grid;
  gap: 12px;
  justify-items: start;
}
h1 {
  text-transform: none;
}
p:last-child {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
</style>
