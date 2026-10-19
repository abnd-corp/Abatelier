<script setup lang="ts">
import { ref } from 'vue'
import AppIcon from './AppIcon.vue'

defineProps<{ nom: string; identifiant: string; password: string }>()
const emit = defineEmits<{ done: [] }>()
const copied = ref(false)

async function copy(password: string) {
  try {
    await navigator.clipboard.writeText(password)
    copied.value = true
  } catch {
    copied.value = false
  }
}
</script>

<template>
  <section class="card temp" role="status">
    <div>
      <h2>Mot de passe temporaire de {{ nom }}</h2>
      <p class="muted">
        Transmettez-le à la personne avec son identifiant <b class="mono">{{ identifiant }}</b>. Elle devra le changer à sa première
        connexion. Il ne sera plus affiché ensuite.
      </p>
    </div>
    <div class="temp-pw">
      <code class="mono">{{ password }}</code>
      <button class="btn" type="button" @click="copy(password)"><AppIcon :name="copied ? 'check' : 'copy'" />{{ copied ? 'Copié' : 'Copier' }}</button>
      <button class="btn" type="button" @click="emit('done')">J’ai noté</button>
    </div>
  </section>
</template>

<style scoped>
.temp {
  padding: 20px;
  display: grid;
  gap: 12px;
  border-color: var(--accent);
}
.temp-pw {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.temp-pw code {
  font-size: 1.25rem;
  font-weight: 600;
  background: var(--surface-2);
  border: 1px solid var(--line);
  padding: 8px 14px;
  border-radius: 8px;
  letter-spacing: 0.04em;
  user-select: all;
}
</style>
