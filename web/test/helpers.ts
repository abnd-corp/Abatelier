import { h } from 'vue'
import { vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import type { User } from '@/stores/auth'

type Reply = [status: number, data?: unknown]
type Handler = Reply | ((body: any) => Reply)

export interface ApiCall {
  method: string
  path: string
  body: any
}

/** Remplace fetch : chaque « MÉTHODE /chemin » renvoie la réponse donnée. Retourne la liste des appels. */
export function mockApi(routes: Record<string, Handler>) {
  const calls: ApiCall[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET'
      const path = String(input).replace(/^\/api/, '')
      const body = init.body ? JSON.parse(init.body as string) : undefined
      calls.push({ method, path, body })
      const handler = routes[`${method} ${path}`] ?? routes[`${method} ${path.split('?')[0]}`]
      if (!handler) return new Response(JSON.stringify({ error: `Appel non simulé : ${method} ${path}` }), { status: 500 })
      const [status, data] = typeof handler === 'function' ? handler(body) : handler
      return new Response(status === 204 ? null : JSON.stringify(data ?? {}), { status, headers: { 'Content-Type': 'application/json' } })
    }),
  )
  return calls
}

const page = (name: string) => ({ name, render: () => h('div', { 'data-page': name }) })

/** Routeur minimal : mêmes noms de routes que l'application, pages factices. */
export function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/connexion', name: 'login', component: page('login'), meta: { public: true } },
      { path: '/', name: 'dashboard', component: page('dashboard') },
      { path: '/mon-compte', name: 'account', component: page('account') },
      { path: '/utilisateurs', name: 'users', component: page('users') },
      { path: '/journal', name: 'audit', component: page('audit') },
    ],
  })
}

export function freshPinia() {
  const pinia = createPinia()
  setActivePinia(pinia)
  return pinia
}

export const ADMIN: User = {
  id: '11111111-1111-4111-8111-111111111111',
  identifiant: 'chef',
  nom: 'Le Chef',
  role: 'admin',
  mustChangePassword: false,
  permissions: ['users.manage', 'audit.read'],
}

export const ATELIER: User = {
  id: '22222222-2222-4222-8222-222222222222',
  identifiant: 'paul',
  nom: 'Paul Martin',
  role: 'atelier',
  mustChangePassword: false,
  permissions: [],
}
