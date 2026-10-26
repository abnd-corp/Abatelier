<script setup lang="ts">
import { ADMIN_OPTION, SECTION_OPTIONS, type Access, type Section } from '@/stores/auth'

// Les droits d'un compte : des sections cumulables, et l'administration à part
const props = defineProps<{ modelValue: Access; idPrefix: string; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [Access] }>()

function toggle(section: Section, on: boolean) {
  const sections = on ? [...props.modelValue.sections, section] : props.modelValue.sections.filter((s) => s !== section)
  emit('update:modelValue', { ...props.modelValue, sections })
}
</script>

<template>
  <fieldset class="access" :disabled="disabled">
    <legend>Droits</legend>
    <label v-for="o in SECTION_OPTIONS" :key="o.value" class="check">
      <input :id="`${idPrefix}-${o.value}`" type="checkbox" :checked="modelValue.sections.includes(o.value)" @change="toggle(o.value, ($event.target as HTMLInputElement).checked)" />
      <span
        ><b>{{ o.label }}</b> <span class="muted">: {{ o.description }}</span></span
      >
    </label>
    <label class="check admin">
      <input :id="`${idPrefix}-admin`" type="checkbox" :checked="modelValue.admin" @change="emit('update:modelValue', { ...modelValue, admin: ($event.target as HTMLInputElement).checked })" />
      <span
        ><b>{{ ADMIN_OPTION.label }}</b> <span class="muted">: {{ ADMIN_OPTION.description }}</span></span
      >
    </label>
  </fieldset>
</template>

<style scoped>
.access {
  display: grid;
  gap: 8px;
  border: 0;
  padding: 0;
  margin: 0;
  min-width: 0;
}
legend {
  font-weight: 600;
  font-size: 0.9rem;
  padding: 0;
  margin-bottom: 4px;
}
.check {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  min-height: 44px;
  padding: 6px 0;
}
.check input {
  margin-top: 4px;
  width: 18px;
  height: 18px;
  flex: none;
}
.admin {
  border-top: 1px solid var(--line);
  padding-top: 10px;
}
</style>
