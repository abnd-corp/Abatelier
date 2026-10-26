import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api } from '@/api'

export type Section = 'ventes' | 'atelier' | 'direction'
export type Permission =
  | 'users.manage'
  | 'employees.manage'
  | 'audit.read'
  | 'catalog.manage'
  | 'documents.manage'
  | 'clients.manage'
  | 'clients.read'
  | 'orders.manage'
  | 'orders.production'
  | 'billing.manage'
  | 'site.manage'
  | 'products.manage'
  | 'stock.manage'

export interface User {
  id: string
  identifiant: string
  nom: string
  sections: Section[]
  admin: boolean
  mustChangePassword: boolean
  permissions: Permission[]
}

/** Les sections qu'on coche pour un compte : elles se cumulent, et reprennent les rubriques du menu. */
export const SECTION_OPTIONS: { value: Section; label: string; description: string }[] = [
  { value: 'ventes', label: 'Ventes', description: 'commandes, devis et factures, clients' },
  { value: 'atelier', label: 'Atelier', description: 'fabrication et stock de feuilles, sans les clients ni les prix' },
  { value: 'direction', label: 'Direction', description: 'tarifs et catalogue, modèles de documents, boutique, site vitrine' },
]
export const ADMIN_OPTION = { label: 'Administration', description: 'comptes de connexion, fiches salariés, journal d’activité' }

export interface Access {
  sections: Section[]
  admin: boolean
}

/** « Ventes · Atelier · Administration », ou « Aucun accès ». */
export const accessLabels = (a: Access): string[] => [...SECTION_OPTIONS.filter((o) => a.sections.includes(o.value)).map((o) => o.label), ...(a.admin ? [ADMIN_OPTION.label] : [])]
export const accessLabel = (a: Access) => accessLabels(a).join(' · ') || 'Aucun accès'

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
