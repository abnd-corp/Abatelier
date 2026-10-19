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
      // Corps JSON lu en objet ; un fichier envoyé tel quel (logo) est gardé comme il est
      const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body
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
      { path: '/utilisateurs', name: 'users', component: page('users'), meta: { section: 'Équipe', title: 'Comptes' } },
      { path: '/journal', name: 'audit', component: page('audit') },
      { path: '/catalogue', name: 'catalog', component: page('catalog'), meta: { section: 'Direction', title: 'Tarifs et catalogue' } },
      { path: '/modeles-documents', name: 'documents', component: page('documents'), meta: { section: 'Direction', title: 'Modèles de documents' } },
      { path: '/clients', name: 'clients', component: page('clients'), meta: { section: 'Ventes', title: 'Clients' } },
      { path: '/clients/nouveau', name: 'client-new', component: page('client-new'), meta: { menu: 'clients' } },
      {
        path: '/clients/:id',
        name: 'client',
        component: page('client'),
        meta: { section: 'Ventes', parent: { label: 'Clients', to: { name: 'clients' } }, title: 'Fiche client', menu: 'clients' },
      },
      { path: '/commandes', name: 'orders', component: page('orders'), meta: { section: 'Ventes', title: 'Commandes' } },
      { path: '/commandes/nouvelle', name: 'order-new', component: page('order-new'), meta: { menu: 'orders' } },
      { path: '/commandes/:id', name: 'order', component: page('order'), meta: { menu: 'orders' } },
      { path: '/fabrication', name: 'production', component: page('production'), meta: { section: 'Atelier', title: 'Fabrication' } },
      { path: '/fabrication/:id', name: 'production-order', component: page('production-order'), meta: { menu: 'production' } },
      { path: '/salaries', name: 'employees', component: page('employees'), meta: { section: 'Équipe', title: 'Salariés' } },
      { path: '/salaries/nouveau', name: 'employee-new', component: page('employee-new'), meta: { menu: 'employees' } },
      {
        path: '/salaries/:id',
        name: 'employee',
        component: page('employee'),
        meta: { section: 'Équipe', parent: { label: 'Salariés', to: { name: 'employees' } }, title: 'Fiche salarié', menu: 'employees' },
      },
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
  role: 'direction',
  mustChangePassword: false,
  permissions: ['users.manage', 'employees.manage', 'audit.read', 'catalog.manage', 'documents.manage', 'clients.manage', 'clients.read', 'orders.manage', 'orders.production'],
}

export const ATELIER: User = {
  id: '22222222-2222-4222-8222-222222222222',
  identifiant: 'paul',
  nom: 'Paul Martin',
  role: 'atelier',
  mustChangePassword: false,
  permissions: ['orders.production'],
}

export const RH: User = {
  id: '33333333-3333-4333-8333-333333333333',
  identifiant: 'rh',
  nom: 'Claire Petit',
  role: 'rh',
  mustChangePassword: false,
  permissions: ['employees.manage', 'audit.read', 'clients.read'],
}
