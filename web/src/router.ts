import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore, type Permission } from '@/stores/auth'

declare module 'vue-router' {
  interface RouteMeta {
    public?: boolean
    perm?: Permission
    // Titre de la page (onglet et dernier élément du fil d'Ariane)
    title?: string
    // Section du menu, affichée en tête du fil d'Ariane
    section?: string
    // Page parente dans le fil d'Ariane
    parent?: { label: string; to: { name: string } }
    // Lien du menu à mettre en surbrillance (pour les sous-pages)
    menu?: string
  }
}

const employeesParent = { label: 'Salariés', to: { name: 'employees' } }
const clientsParent = { label: 'Clients', to: { name: 'clients' } }
const ordersParent = { label: 'Commandes', to: { name: 'orders' } }
const productionParent = { label: 'Fabrication', to: { name: 'production' } }

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/connexion', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { public: true, title: 'Connexion' } },
    {
      path: '/',
      component: () => import('@/components/AppLayout.vue'),
      children: [
        { path: '', name: 'dashboard', component: () => import('@/views/DashboardView.vue'), meta: { title: 'Tableau de bord' } },
        { path: 'mon-compte', name: 'account', component: () => import('@/views/AccountView.vue'), meta: { title: 'Mon compte' } },
        {
          path: 'salaries',
          name: 'employees',
          component: () => import('@/views/EmployeesView.vue'),
          meta: { perm: 'employees.manage', section: 'Équipe', title: 'Salariés' },
        },
        {
          path: 'salaries/nouveau',
          name: 'employee-new',
          component: () => import('@/views/EmployeeNewView.vue'),
          meta: { perm: 'employees.manage', section: 'Équipe', parent: employeesParent, title: 'Nouveau salarié', menu: 'employees' },
        },
        {
          path: 'salaries/:id',
          name: 'employee',
          component: () => import('@/views/EmployeeView.vue'),
          meta: { perm: 'employees.manage', section: 'Équipe', parent: employeesParent, title: 'Fiche salarié', menu: 'employees' },
        },
        {
          path: 'clients',
          name: 'clients',
          component: () => import('@/views/ClientsView.vue'),
          meta: { perm: 'clients.read', section: 'Ventes', title: 'Clients' },
        },
        {
          path: 'clients/nouveau',
          name: 'client-new',
          component: () => import('@/views/ClientNewView.vue'),
          meta: { perm: 'clients.manage', section: 'Ventes', parent: clientsParent, title: 'Nouveau client', menu: 'clients' },
        },
        {
          path: 'clients/:id',
          name: 'client',
          component: () => import('@/views/ClientView.vue'),
          meta: { perm: 'clients.read', section: 'Ventes', parent: clientsParent, title: 'Fiche client', menu: 'clients' },
        },
        {
          path: 'commandes',
          name: 'orders',
          component: () => import('@/views/OrdersView.vue'),
          meta: { perm: 'orders.manage', section: 'Ventes', title: 'Commandes' },
        },
        {
          path: 'commandes/nouvelle',
          name: 'order-new',
          component: () => import('@/views/OrderNewView.vue'),
          meta: { perm: 'orders.manage', section: 'Ventes', parent: ordersParent, title: 'Nouvelle commande', menu: 'orders' },
        },
        {
          path: 'commandes/:id',
          name: 'order',
          component: () => import('@/views/OrderView.vue'),
          meta: { perm: 'orders.manage', section: 'Ventes', parent: ordersParent, title: 'Commande', menu: 'orders' },
        },
        {
          path: 'fabrication',
          name: 'production',
          component: () => import('@/views/ProductionView.vue'),
          meta: { perm: 'orders.production', section: 'Atelier', title: 'Fabrication' },
        },
        {
          path: 'fabrication/:id',
          name: 'production-order',
          component: () => import('@/views/ProductionOrderView.vue'),
          meta: { perm: 'orders.production', section: 'Atelier', parent: productionParent, title: 'Fiche de fabrication', menu: 'production' },
        },
        {
          path: 'catalogue',
          name: 'catalog',
          component: () => import('@/views/CatalogView.vue'),
          meta: { perm: 'catalog.manage', section: 'Direction', title: 'Tarifs et catalogue' },
        },
        {
          path: 'modeles-documents',
          name: 'documents',
          component: () => import('@/views/DocumentsView.vue'),
          meta: { perm: 'documents.manage', section: 'Direction', title: 'Modèles de documents' },
        },
        {
          path: 'utilisateurs',
          name: 'users',
          component: () => import('@/views/UsersView.vue'),
          meta: { perm: 'users.manage', section: 'Équipe', title: 'Comptes' },
        },
        {
          path: 'journal',
          name: 'audit',
          component: () => import('@/views/AuditView.vue'),
          meta: { perm: 'audit.read', section: 'Administration', title: 'Journal d’activité' },
        },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  await auth.ensureLoaded()
  if (!to.meta.public && !auth.isLoggedIn) {
    return { name: 'login', query: to.fullPath !== '/' ? { redirect: to.fullPath } : {} }
  }
  if (to.name === 'login' && auth.isLoggedIn) return { name: 'dashboard' }
  // Mot de passe temporaire : seule la page « Mon compte » est accessible
  if (auth.user?.mustChangePassword && to.name !== 'account' && !to.meta.public) return { name: 'account' }
  if (to.meta.perm && !auth.can(to.meta.perm)) return { name: 'dashboard' }
})

router.afterEach((to) => {
  document.title = `${to.meta.title ? to.meta.title + ' · ' : ''}Atelier · Alu Pliage Service`
})
