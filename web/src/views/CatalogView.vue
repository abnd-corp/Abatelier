<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import MaterialsPanel from '@/components/catalog/MaterialsPanel.vue'
import ColorsPanel from '@/components/catalog/ColorsPanel.vue'
import AccessoriesPanel from '@/components/catalog/AccessoriesPanel.vue'
import SettingsPanel from '@/components/catalog/SettingsPanel.vue'
import AppIcon from '@/components/AppIcon.vue'

type Tab = 'matieres' | 'coloris' | 'accessoires' | 'faconnage'
const route = useRoute()
const router = useRouter()

// L'onglet ouvert est gardé dans l'adresse (?onglet=coloris) pour pouvoir le partager ou y revenir
const TAB_IDS: Tab[] = ['matieres', 'coloris', 'accessoires', 'faconnage']
const tab = ref<Tab>(TAB_IDS.find((t) => t === route.query.onglet) ?? 'matieres')
watch(tab, (t) => {
  router.replace({ query: t === 'matieres' ? {} : { onglet: t } })
  nextTick(showTab)
})

// Sur téléphone, la barre d'onglets défile : on garde l'onglet ouvert visible
const showTab = () => document.getElementById(`tab-${tab.value}`)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
onMounted(showTab)

const counts = ref<Record<Tab, number | null>>({ matieres: null, coloris: null, accessoires: null, faconnage: null })

// « more » : fin du libellé masquée sur téléphone pour que les onglets tiennent sur une ligne
const TABS: { id: Tab; label: string; more?: string; icon: 'layers' | 'palette' | 'box' | 'sliders' }[] = [
  { id: 'matieres', label: 'Matières', icon: 'layers' },
  { id: 'coloris', label: 'Coloris', icon: 'palette' },
  { id: 'accessoires', label: 'Accessoires', icon: 'box' },
  { id: 'faconnage', label: 'Façonnage', more: ' et conditions', icon: 'sliders' },
]

// Navigation au clavier entre les onglets (flèches gauche et droite)
function onKey(e: KeyboardEvent) {
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
  const i = TABS.findIndex((t) => t.id === tab.value)
  const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length]!
  tab.value = next.id
  document.getElementById(`tab-${next.id}`)?.focus()
}
</script>

<template>
  <div class="page-head">
    <div>
      <span class="eyebrow">Direction</span>
      <h1>Tarifs et catalogue</h1>
      <p class="muted intro">Prix HT utilisés pour chiffrer les devis et, plus tard, le configurateur du site.</p>
    </div>
  </div>

  <div class="tabs" role="tablist" aria-label="Catalogue" @keydown="onKey">
    <button
      v-for="t in TABS"
      :id="`tab-${t.id}`"
      :key="t.id"
      class="tab"
      type="button"
      role="tab"
      :aria-selected="tab === t.id"
      :aria-controls="`panel-${t.id}`"
      :tabindex="tab === t.id ? 0 : -1"
      @click="tab = t.id"
    >
      <AppIcon :name="t.icon" :size="17" />{{ t.label }}<span v-if="t.more" class="more">{{ t.more }}</span><span v-if="counts[t.id] !== null" class="count">{{ counts[t.id] }}</span>
    </button>
  </div>

  <section v-show="tab === 'matieres'" id="panel-matieres" role="tabpanel" aria-labelledby="tab-matieres">
    <MaterialsPanel @count="counts.matieres = $event" />
  </section>
  <section v-show="tab === 'coloris'" id="panel-coloris" role="tabpanel" aria-labelledby="tab-coloris">
    <ColorsPanel @count="counts.coloris = $event" />
  </section>
  <section v-show="tab === 'accessoires'" id="panel-accessoires" role="tabpanel" aria-labelledby="tab-accessoires">
    <AccessoriesPanel @count="counts.accessoires = $event" />
  </section>
  <section v-show="tab === 'faconnage'" id="panel-faconnage" role="tabpanel" aria-labelledby="tab-faconnage">
    <SettingsPanel />
  </section>
</template>

<style scoped>
.intro {
  margin-top: 6px;
  font-size: 0.9rem;
}
.tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--line);
  overflow-x: auto;
  scrollbar-width: none;
}
.tab {
  white-space: nowrap;
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 0;
  background: none;
  padding: 10px 14px;
  font-weight: 600;
  color: var(--muted);
  border-bottom: 3px solid transparent;
  margin-bottom: -1px;
}
.tab:hover {
  color: var(--ink);
}
.tab[aria-selected='true'] {
  color: var(--ink);
  border-bottom-color: var(--accent);
}
.count {
  font-family: var(--f-mono);
  font-size: 0.75rem;
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 0 7px;
}
@media (pointer: coarse) {
  .tab {
    min-height: 44px;
  }
}
.more {
  margin-left: -4px;
}
@media (max-width: 640px) {
  .more {
    display: none;
  }
  /* Les quatre onglets tiennent sur la largeur d'un téléphone : sans icônes ni compteurs */
  .tabs {
    gap: 0;
  }
  .tab {
    padding-inline: 9px;
  }
  .tab > .icon,
  .count {
    display: none;
  }
}
</style>
