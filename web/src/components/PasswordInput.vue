<script setup lang="ts">
import { ref } from 'vue'
import AppIcon from './AppIcon.vue'

defineProps<{ id: string; autocomplete: string; invalid?: boolean; describedby?: string }>()
const model = defineModel<string>({ required: true })
const visible = ref(false)
</script>

<template>
  <span class="pw">
    <input
      :id="id"
      v-model="model"
      class="input"
      :class="{ invalid }"
      :type="visible ? 'text' : 'password'"
      :autocomplete="autocomplete"
      :aria-invalid="invalid || undefined"
      :aria-describedby="describedby"
      autocapitalize="none"
      spellcheck="false"
    />
    <button
      type="button"
      class="eye"
      :aria-label="visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'"
      :title="visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'"
      :aria-pressed="visible"
      @click="visible = !visible"
    >
      <AppIcon :name="visible ? 'eye-off' : 'eye'" :size="20" />
    </button>
  </span>
</template>

<style scoped>
.pw {
  position: relative;
  display: block;
}
.pw .input {
  padding-right: 46px;
}
.eye {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 6px;
  background: none;
  color: var(--muted);
}
.eye:hover,
.eye[aria-pressed='true'] {
  color: var(--accent);
}
</style>
