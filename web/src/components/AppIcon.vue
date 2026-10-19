<script setup lang="ts">
// Icônes au trait, 24×24, couleur héritée du texte
const PATHS = {
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  'eye-off':
    'M3 3l18 18 M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1 M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6 M9.9 9.9a3 3 0 0 0 4.2 4.2',
  home: 'M3 10.5 12 3l9 7.5 M5 9v11h5v-6h4v6h5V9',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M4 21a8 8 0 0 1 16 0',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M2 21a7 7 0 0 1 14 0 M16 3.5a4 4 0 0 1 0 7.5 M18 14.5a7 7 0 0 1 4 6.5',
  list: 'M8 6h13 M8 12h13 M8 18h13 M3.5 6h.01 M3.5 12h.01 M3.5 18h.01',
  logout: 'M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4 M10 17l5-5-5-5 M15 12H3',
  copy: 'M9 9h11v11H9z M5 15H4V4h11v1',
  check: 'M4 12.5 9 17.5 20 6.5',
  plus: 'M12 5v14 M5 12h14',
  device: 'M4 5h16v11H4z M2 19h20 M9 16v3 M15 16v3',
  shield: 'M12 3 4 6v6c0 5 3.4 8.3 8 9 4.6-.7 8-4 8-9V6l-8-3Z M9 12l2 2 4-4',
  menu: 'M4 6h16 M4 12h16 M4 18h16',
  id: 'M3 5h18v14H3z M8 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z M5 16a3 3 0 0 1 6 0 M14 9h4 M14 13h4',
  key: 'M7.5 16.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M11.5 12.5H21 M18 12.5v3 M15 12.5v2',
  'chevrons-left': 'M11 17l-5-5 5-5 M18 17l-5-5 5-5',
  'chevrons-right': 'M13 17l5-5-5-5 M6 17l5-5-5-5',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2',
  mail: 'M3 6h18v12H3z M3 7l9 6 9-6',
  'arrow-left': 'M19 12H5 M11 18l-6-6 6-6',
  pencil: 'M4 20h4L19 9l-4-4L4 16v4Z M14 6l4 4',
  x: 'M6 6l12 12 M18 6 6 18',
  'user-plus': 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M2 21a7 7 0 0 1 14 0 M19 8v6 M16 11h6',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z M20 20l-4-4',
  calendar: 'M4 5h16v15H4z M4 10h16 M8 3v4 M16 3v4',
  tag: 'M3 12V4h8l10 10-8 8L3 12Z M7.5 8.5h.01',
  sliders: 'M4 6h10 M18 6h2 M4 12h4 M12 12h8 M4 18h12 M20 18h0 M16 4v4 M10 10v4 M18 16v4',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13 M10 11v6 M14 11v6',
  layers: 'M12 3 2 8l10 5 10-5-10-5Z M2 13l10 5 10-5 M2 17.5l10 5 10-5',
  palette: 'M12 21a9 9 0 1 1 9-9c0 2-1.6 3-3.5 3H16a2 2 0 0 0-1.6 3.2A1.7 1.7 0 0 1 12 21Z M7.5 11h.01 M10 7h.01 M14.5 7h.01 M17 11h.01',
  box: 'M3 7.5 12 3l9 4.5v9L12 21l-9-4.5v-9Z M3 7.5l9 4.5 9-4.5 M12 12v9',
} as const

defineProps<{ name: keyof typeof PATHS; size?: number }>()
</script>

<template>
  <svg
    :width="size ?? 18"
    :height="size ?? 18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    class="icon"
  >
    <path :d="PATHS[name]" />
  </svg>
</template>

<style scoped>
.icon {
  flex: none;
  display: block;
}
</style>
