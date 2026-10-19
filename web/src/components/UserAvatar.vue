<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ name: string; size?: number }>()

const initials = computed(() =>
  props.name
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join(''),
)

// Teinte stable dérivée du nom : la même personne a toujours la même couleur
const hue = computed(() => {
  let h = 0
  for (const c of props.name) h = (h * 31 + c.charCodeAt(0)) % 360
  return h
})
</script>

<template>
  <span class="avatar" :style="{ '--av-h': hue, '--av-size': `${size ?? 32}px` }" aria-hidden="true">{{ initials }}</span>
</template>

<style scoped>
.avatar {
  width: var(--av-size);
  height: var(--av-size);
  flex: none;
  border-radius: 50%;
  display: inline-grid;
  place-items: center;
  font-weight: 700;
  font-size: calc(var(--av-size) * 0.38);
  letter-spacing: 0.02em;
  background: hsl(var(--av-h) 55% 88%);
  color: hsl(var(--av-h) 45% 28%);
}
@media (prefers-color-scheme: dark) {
  .avatar {
    background: hsl(var(--av-h) 30% 28%);
    color: hsl(var(--av-h) 60% 86%);
  }
}
</style>
