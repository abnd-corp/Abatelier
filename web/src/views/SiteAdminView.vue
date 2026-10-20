<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ContactRequests from '@/components/site-admin/ContactRequests.vue'
import ContentEditor from '@/components/site-admin/ContentEditor.vue'
import PhotoManager from '@/components/site-admin/PhotoManager.vue'
import AppIcon from '@/components/AppIcon.vue'

const TABS = [
  { id: 'demandes', label: 'Demandes reçues' },
  { id: 'textes', label: 'Textes' },
  { id: 'photos', label: 'Photos' },
] as const
type Tab = (typeof TABS)[number]['id']

const route = useRoute()
const router = useRouter()
const tab = ref<Tab>(TABS.find((t) => t.id === route.query.onglet)?.id ?? 'demandes')
const pending = ref(0)
function select(t: Tab) {
  tab.value = t
  router.replace({ query: t === 'demandes' ? {} : { onglet: t } })
}
</script>

<template>
  <div class="page-head">
    <div>
      <span class="eyebrow">Direction</span>
      <h1>Site vitrine</h1>
    </div>
    <RouterLink class="btn" :to="{ name: 'site-home' }" target="_blank" rel="noopener"><AppIcon name="globe" />Voir le site</RouterLink>
  </div>

  <div class="tabs" role="tablist" aria-label="Site vitrine">
    <button v-for="t in TABS" :id="`tab-${t.id}`" :key="t.id" type="button" role="tab" class="tab" :aria-selected="tab === t.id" :aria-controls="`panel-${t.id}`" @click="select(t.id)">
      {{ t.label }}<span v-if="t.id === 'demandes' && pending" class="badge" :aria-label="`${pending} à traiter`">{{ pending }}</span>
    </button>
  </div>

  <div :id="`panel-${tab}`" role="tabpanel" :aria-labelledby="`tab-${tab}`">
    <ContactRequests v-if="tab === 'demandes'" @count="pending = $event" />
    <ContentEditor v-else-if="tab === 'textes'" />
    <PhotoManager v-else />
  </div>
</template>

<style scoped>
.tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--line);
  overflow-x: auto;
}
.tab {
  border: 0;
  background: none;
  padding: 10px 16px;
  font-weight: 600;
  color: var(--muted);
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  white-space: nowrap;
  display: flex;
  gap: 8px;
  align-items: center;
}
.tab[aria-selected='true'] {
  color: var(--accent);
  border-bottom-color: var(--accent);
}
.badge {
  background: var(--accent);
  color: var(--on-accent);
  border-radius: 999px;
  min-width: 20px;
  padding: 0 6px;
  font-size: 0.74rem;
  text-align: center;
}
@media (pointer: coarse) {
  .tab {
    min-height: 44px;
  }
}
</style>
