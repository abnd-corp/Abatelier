import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api } from '@/api'

export type Role = 'direction' | 'rh' | 'atelier'
export type Permission = 'users.manage' | 'employees.manage' | 'audit.read' | 'catalog.manage' | 'documents.manage' | 'clients.manage' | 'clients.read' | 'orders.manage' | 'orders.production' | 'billing.manage'

export interface User {
  id: string
  identifiant: string
  nom: string
  role: Role
  mustChangePassword: boolean
  permissions: Permission[]
}

export const ROLE_LABELS: Record<Role, string> = { direction: 'Direction', rh: 'RH', atelier: 'Atelier' }

/** Rôles proposés dans les listes de choix, du moins au plus étendu. */
export const ROLE_OPTIONS: { value: Role; label: string; description: string }[] = [
  { value: 'atelier', label: 'Atelier', description: 'commandes à fabriquer, sans les clients ni les prix' },
  { value: 'rh', label: 'RH', description: 'salariés, journal, clients en lecture' },
  { value: 'direction', label: 'Direction', description: 'tout, dont les comptes, tarifs, clients et commandes' },
]

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const loaded = ref(false)
  const isLoggedIn = computed(() => user.value !== null)
  const can = (perm: Permission) => user.value?.permissions.includes(perm) ?? false

  /** Vérifie une seule fois au chargement de l'app si une session existe déjà. */
  async function ensureLoaded() {
    if (loaded.value) return
    try {
      user.value = (await api<{ user: User | null }>('/auth/session')).user
    } catch (e) {
      console.error(e)
      user.value = null
    }
    loaded.value = true
  }

  async function login(identifiant: string, password: string, remember: boolean) {
    user.value = (await api<{ user: User }>('/auth/login', { method: 'POST', body: { identifiant, password, remember } })).user
    loaded.value = true
  }

  async function changePassword(current: string, next: string) {
    const res = await api<{ user: User; closedSessions: number }>('/auth/password', { method: 'POST', body: { current, next } })
    user.value = res.user
    return res.closedSessions
  }

  async function logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => {})
    user.value = null
  }

  /** Session expirée côté serveur : on oublie l'utilisateur sans appeler l'API. */
  function forget() {
    user.value = null
  }

  return { user, loaded, isLoggedIn, can, ensureLoaded, login, changePassword, logout, forget }
})
