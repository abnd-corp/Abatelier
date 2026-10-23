<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter, type RouteLocationRaw } from 'vue-router'
import { useAuthStore, type Permission } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import BrandMark from './BrandMark.vue'
import AppIcon from './AppIcon.vue'
import UserAvatar from './UserAvatar.vue'

type Icon = InstanceType<typeof AppIcon>['$props']['name']
interface Item {
  to: RouteLocationRaw
  name: string
  label: string
  icon: Icon
  perm?: Permission
}

// Menu de gauche. Une section n'apparaît que si l'utilisateur a accès à au moins un de ses liens.
// Les futures parties (commandes, devis, tarifs…) viendront s'ajouter ici.
const SECTIONS: { title?: string; items: Item[] }[] = [
  { items: [{ to: { name: 'dashboard' }, name: 'dashboard', label: 'Tableau de bord', icon: 'home' }] },
  {
    title: 'Ventes',
    items: [
      { to: { name: 'orders' }, name: 'orders', label: 'Commandes', icon: 'box', perm: 'orders.manage' },
      { to: { name: 'billing' }, name: 'billing', label: 'Devis et factures', icon: 'receipt', perm: 'billing.manage' },
      { to: { name: 'clients' }, name: 'clients', label: 'Clients', icon: 'users', perm: 'clients.read' },
    ],
  },
  {
    title: 'Atelier',
    items: [
      { to: { name: 'production' }, name: 'production', label: 'Fabrication', icon: 'layers', perm: 'orders.production' },
      { to: { name: 'stock' }, name: 'stock', label: 'Stock de feuilles', icon: 'inbox', perm: 'stock.manage' },
    ],
  },
  {
    title: 'Direction',
    items: [
      { to: { name: 'catalog' }, name: 'catalog', label: 'Tarifs et catalogue', icon: 'tag', perm: 'catalog.manage' },
      { to: { name: 'documents' }, name: 'documents', label: 'Modèles de documents', icon: 'file', perm: 'documents.manage' },
      { to: { name: 'products' }, name: 'products', label: 'Boutique', icon: 'inbox', perm: 'products.manage' },
      { to: { name: 'site-admin' }, name: 'site-admin', label: 'Site vitrine', icon: 'globe', perm: 'site.manage' },
    ],
  },
  {
    title: 'Équipe',
    items: [
      { to: { name: 'employees' }, name: 'employees', label: 'Salariés', icon: 'id', perm: 'employees.manage' },
      { to: { name: 'users' }, name: 'users', label: 'Comptes', icon: 'key', perm: 'users.manage' },
    ],
  },
  {
    title: 'Administration',
    items: [{ to: { name: 'audit' }, name: 'audit', label: 'Journal d’activité', icon: 'list', perm: 'audit.read' }],
  },
]

const auth = useAuthStore()
const ui = useUiStore()
const route = useRoute()
const router = useRouter()

const sections = computed(() => {
  if (auth.user?.mustChangePassword) return []
  return SECTIONS.map((s) => ({ ...s, items: s.items.filter((i) => !i.perm || auth.can(i.perm)) })).filter((s) => s.items.length)
})

// Lien actif : la route elle-même ou une de ses sous-pages (ex. une fiche salarié → « Salariés »)
const activeName = computed(() => (route.meta.menu as string | undefined) ?? (route.name as string))

// Menu réduit (icônes seules) : mémorisé dans le navigateur
const KEY = 'aps-menu-reduit'
// Sans choix enregistré, le menu démarre réduit sur les petits écrans d'ordinateur et les tablettes en paysage
const read = () => {
  let saved: string | null = null
  try {
    saved = localStorage.getItem(KEY)
  } catch {
    // stockage indisponible : on se base sur la largeur
  }
  if (saved !== null) return saved === '1'
  return typeof window !== 'undefined' && window.matchMedia?.('(max-width: 1200px)').matches === true
}
const collapsed = ref(read())
watch(collapsed, (v) => {
  try {
    localStorage.setItem(KEY, v ? '1' : '0')
  } catch {
    // stockage indisponible (navigation privée) : on garde le choix pour cette visite
  }
})

// Tiroir sur mobile
const drawer = ref(false)
watch(
  () => route.fullPath,
  () => (drawer.value = false),
)

const crumbs = computed(() => {
  const list: { label: string; to?: RouteLocationRaw }[] = []
  const meta = route.meta
  if (meta.section) list.push({ label: meta.section as string })
  if (meta.parent) list.push(meta.parent as { label: string; to: RouteLocationRaw })
  const last = ui.crumb?.for === route.fullPath ? ui.crumb.label : (meta.title as string | undefined)
  if (last) list.push({ label: last })
  return list
})

async function logout() {
  await auth.logout()
  await router.replace({ name: 'login' })
}
</script>

<template>
  <div class="shell" :class="{ collapsed, 'drawer-open': drawer }">
    <aside id="menu" class="sidebar" aria-label="Menu">
      <RouterLink :to="{ name: 'dashboard' }" class="brand" title="Alu Pliage Service">
        <BrandMark class="mark" />
        <span class="label brand-name">Alu Pliage<br />Service</span>
      </RouterLink>

      <nav class="nav" aria-label="Navigation principale">
        <div v-for="(s, i) in sections" :key="i" class="section">
          <p v-if="s.title" class="section-title label">{{ s.title }}</p>
          <RouterLink
            v-for="item in s.items"
            :key="item.name"
            :to="item.to"
            class="item"
            :class="{ active: activeName === item.name }"
            :aria-current="activeName === item.name ? 'page' : undefined"
            :title="collapsed ? item.label : undefined"
          >
            <AppIcon :name="item.icon" :size="19" />
            <span class="label">{{ item.label }}</span>
          </RouterLink>
        </div>
      </nav>

      <div class="foot">
        <RouterLink
          :to="{ name: 'account' }"
          class="item me"
          :class="{ active: activeName === 'account' }"
          :aria-label="`Mon compte : ${auth.user?.nom}`"
          :title="collapsed ? 'Mon compte' : undefined"
        >
          <UserAvatar :name="auth.user?.nom ?? '?'" :size="26" />
          <span class="label me-text">
            <b>{{ auth.user?.nom }}</b>
            <small class="muted">Mon compte</small>
          </span>
        </RouterLink>
        <RouterLink :to="{ name: 'site-home' }" class="item" :title="collapsed ? 'Voir le site' : undefined" target="_blank" rel="noopener">
          <AppIcon name="globe" :size="19" />
          <span class="label">Voir le site</span>
        </RouterLink>
        <button class="item" type="button" aria-label="Se déconnecter" :title="collapsed ? 'Se déconnecter' : undefined" @click="logout">
          <AppIcon name="logout" :size="19" />
          <span class="label">Se déconnecter</span>
        </button>
        <button class="item collapse-btn" type="button" :aria-expanded="!collapsed" aria-controls="menu" :title="collapsed ? 'Agrandir le menu' : undefined" @click="collapsed = !collapsed">
          <AppIcon :name="collapsed ? 'chevrons-right' : 'chevrons-left'" :size="19" />
          <span class="label">{{ collapsed ? 'Agrandir le menu' : 'Réduire le menu' }}</span>
        </button>
      </div>
    </aside>

    <div v-if="drawer" class="scrim" aria-hidden="true" @click="drawer = false" />

    <div class="main-col">
      <header class="topbar">
        <button class="burger" type="button" aria-label="Ouvrir le menu" aria-controls="menu" :aria-expanded="drawer" @click="drawer = !drawer">
          <AppIcon :name="drawer ? 'x' : 'menu'" :size="22" />
        </button>
        <nav class="crumbs" aria-label="Fil d’Ariane">
          <ol>
            <li v-for="(c, i) in crumbs" :key="i">
              <RouterLink v-if="c.to && i < crumbs.length - 1" :to="c.to">{{ c.label }}</RouterLink>
              <span v-else :aria-current="i === crumbs.length - 1 ? 'page' : undefined">{{ c.label }}</span>
            </li>
          </ol>
        </nav>
      </header>
      <main class="content">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<style scoped>
.shell {
  --sb-w: 248px;
  display: grid;
  grid-template-columns: var(--sb-w) minmax(0, 1fr);
  min-height: 100vh;
  min-height: 100dvh;
}
.shell.collapsed {
  --sb-w: 64px;
}

/* Menu de gauche */
.sidebar {
  position: sticky;
  top: 0;
  height: 100vh;
  height: 100dvh;
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--surface);
  border-right: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  padding: calc(10px + env(safe-area-inset-top)) 10px calc(10px + env(safe-area-inset-bottom));
  gap: 6px;
  z-index: 20;
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 6px 14px;
  color: inherit;
  text-decoration: none;
  border-bottom: 1px solid var(--line);
  margin-bottom: 6px;
}
.mark {
  width: 32px;
  height: 32px;
  flex: none;
}
.brand-name {
  font-family: var(--f-display);
  font-stretch: 75%;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: 1rem;
  font-weight: 700;
  line-height: 1.05;
}
.nav {
  display: grid;
  gap: 14px;
  flex: 1;
  align-content: start;
}
.section {
  display: grid;
  gap: 2px;
}
.section-title {
  font-family: var(--f-mono);
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--muted);
  padding: 4px 10px;
}
.item {
  display: flex;
  align-items: center;
  gap: 11px;
  min-height: 38px;
  padding: 7px 10px;
  border-radius: 8px;
  color: var(--muted);
  text-decoration: none;
  font-weight: 600;
  font-size: 0.9rem;
  border: 0;
  background: none;
  width: 100%;
  text-align: left;
  white-space: nowrap;
  position: relative;
}
.item:hover {
  background: var(--surface-2);
  color: var(--ink);
}
.item.active {
  background: var(--accent-soft);
  color: var(--ink);
}
.item.active::before {
  content: '';
  position: absolute;
  left: -10px;
  top: 6px;
  bottom: 6px;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: var(--accent);
}
.item.active :deep(.icon) {
  color: var(--accent);
}
.foot {
  display: grid;
  gap: 2px;
  border-top: 1px solid var(--line);
  padding-top: 8px;
}
.me-text {
  display: grid;
  line-height: 1.2;
  min-width: 0;
}
.me-text b {
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
}
.me-text small {
  font-weight: 500;
  font-size: 0.76rem;
}
.collapsed .label {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}
.collapsed .item {
  justify-content: center;
  padding-inline: 0;
}
.collapsed .brand {
  justify-content: center;
}

/* Colonne principale */
.main-col {
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.topbar {
  position: sticky;
  top: 0;
  z-index: 10;
  min-height: 52px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: env(safe-area-inset-top) max(20px, env(safe-area-inset-right)) 0 max(20px, env(safe-area-inset-left));
  background: var(--surface);
  border-bottom: 1px solid var(--line);
}
.burger {
  display: none;
  border: 0;
  background: none;
  width: 40px;
  height: 40px;
  border-radius: 8px;
  place-items: center;
  margin-left: -8px;
}
.burger:hover {
  background: var(--surface-2);
}
.crumbs ol {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  font-size: 0.88rem;
  color: var(--muted);
}
.crumbs li + li::before {
  content: '/';
  margin-right: 4px;
  color: var(--line);
}
.crumbs a {
  color: var(--muted);
  text-decoration: none;
}
.crumbs a:hover {
  color: var(--accent);
  text-decoration: underline;
}
.crumbs [aria-current='page'] {
  color: var(--ink);
  font-weight: 600;
}
.content {
  display: grid;
  /* minmax(0, 1fr) : un tableau large défile dans sa carte au lieu d'élargir la page */
  grid-template-columns: minmax(0, 1fr);
  gap: 20px;
  align-content: start;
  padding: 24px max(24px, env(safe-area-inset-right)) 64px max(24px, env(safe-area-inset-left));
  max-width: 1280px;
  width: 100%;
}

/* Mobile : le menu devient un tiroir */
@media (max-width: 900px) {
  .shell,
  .shell.collapsed {
    grid-template-columns: minmax(0, 1fr);
  }
  .sidebar {
    position: fixed;
    inset: 0 auto 0 0;
    width: min(280px, 85vw);
    transform: translateX(-100%);
    transition: transform 0.2s ease;
  }
  .drawer-open .sidebar {
    transform: none;
    box-shadow: 0 0 40px rgb(0 0 0 / 0.25);
  }
  .collapsed .label {
    position: static;
    width: auto;
    height: auto;
    clip-path: none;
  }
  .collapsed .item {
    justify-content: flex-start;
    padding-inline: 10px;
  }
  .collapse-btn {
    display: none;
  }
  .scrim {
    position: fixed;
    inset: 0;
    background: rgb(0 0 0 / 0.4);
    z-index: 15;
  }
  .burger {
    display: grid;
  }
  .content {
    padding: 18px max(16px, env(safe-area-inset-right)) 48px max(16px, env(safe-area-inset-left));
  }
}
@media (prefers-reduced-motion: reduce) {
  .sidebar {
    transition: none;
  }
}
/* Écrans tactiles : cibles d'au moins 44 px */
@media (pointer: coarse) {
  .item {
    min-height: 44px;
  }
  .burger {
    width: 44px;
    height: 44px;
  }
}
</style>
