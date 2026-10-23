<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue'

// Emplacement d'une photo pas encore envoyée : le logo du profil et un libellé qui dit quoi faire
withDefaults(defineProps<{ size?: number }>(), { size: 48 })
</script>

<template>
  <span class="ph" aria-hidden="true">
    <AppIcon name="profile" :size="size" />
    <span class="ph-label">Insérez une photo</span>
  </span>
</template>

<style scoped>
.ph {
  display: grid;
  justify-items: center;
  align-content: center;
  gap: 8px;
  width: 100%;
  height: 100%;
  color: var(--accent);
}
.ph-label {
  font-size: 0.82rem;
  font-weight: 500;
  color: var(--muted);
}
</style>
