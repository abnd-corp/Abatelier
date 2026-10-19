<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import BrandMark from './BrandMark.vue'
import AppIcon from './AppIcon.vue'

const auth = useAuthStore()
const router = useRouter()

const links = computed(() => {
  if (auth.user?.mustChangePassword) return []
  return [
    { to: { name: 'dashboard' }, label: 'Tableau de bord', icon: 'home' as const, show: true },
    { to: { name: 'users' }, label: 'Utilisateurs', icon: 'users' as const, show: auth.can('users.manage') },
    { to: { name: 'audit' }, label: 'Journal', icon: 'list' as const, show: auth.can('audit.read') },
  ].filter((l) => l.show)
})

async function logout() {
  await auth.logout()
  await router.replace({ name: 'login' })
}
</script>

<template>
  <header class="top">
    <div class="wrap bar">
      <RouterLink :to="{ name: 'dashboard' }" class="brand">
        <BrandMark class="mark" />
        <b>Pliage sur mesure</b>
      </RouterLink>
      <nav class="nav" aria-label="Navigation principale">
        <RouterLink v-for="l in links" :key="l.label" :to="l.to" class="nav-link" exact-active-class="active">
          <AppIcon :name="l.icon" />
          <span>{{ l.label }}</span>
        </RouterLink>
      </nav>
      <div class="me">
        <RouterLink :to="{ name: 'account' }" class="nav-link" exact-active-class="active" title="Mon compte">
          <AppIcon name="user" />
          <span class="me-name">{{ auth.user?.nom }}</span>
        </RouterLink>
        <button class="nav-link" type="button" title="Se déconnecter" aria-label="Se déconnecter" @click="logout">
          <AppIcon name="logout" />
        </button>
      </div>
    </div>
  </header>
  <main class="wrap main">
    <RouterView />
  </main>
</template>

<style scoped>
.top {
  position: sticky;
  top: 0;
  z-index: 5;
  background: var(--surface);
  border-bottom: 1px solid var(--line);
  padding-top: env(safe-area-inset-top);
}
.bar {
  display: flex;
  align-items: center;
  gap: 8px 20px;
  padding-block: 8px;
  flex-wrap: wrap;
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  color: inherit;
  text-decoration: none;
}
.mark {
  width: 32px;
  height: 32px;
}
.brand b {
  font-family: var(--f-display);
  font-stretch: 75%;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: 1.1rem;
  white-space: nowrap;
}
.nav {
  display: flex;
  gap: 2px;
  margin-right: auto;
  overflow-x: auto;
}
.me {
  display: flex;
  gap: 2px;
  align-items: center;
}
.nav-link {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 10px;
  border-radius: 8px;
  color: var(--muted);
  text-decoration: none;
  font-weight: 600;
  font-size: 0.9rem;
  border: 0;
  background: none;
  white-space: nowrap;
}
.nav-link:hover {
  background: var(--surface-2);
  color: var(--ink);
}
.nav-link.active {
  color: var(--ink);
  background: var(--accent-soft);
}
.main {
  display: grid;
  gap: 20px;
  padding-block: 28px 64px;
}
@media (max-width: 700px) {
  .nav {
    order: 3;
    width: 100%;
    margin-right: 0;
  }
  .me {
    margin-left: auto;
  }
  .me-name {
    display: none;
  }
}
</style>
