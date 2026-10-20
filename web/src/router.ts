import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore, type Permission } from '@/stores/auth'
import { applySeo } from '@/lib/seo'
import { HOME } from '@/lib/redirect'

declare module 'vue-router' {
  interface RouteMeta {
    public?: boolean
    // Page du site vitrine (visiteurs) : indexable, sans appel à la session
    site?: boolean
    description?: string
    noindex?: boolean
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
const billingParent = { label: 'Devis et factures', to: { name: 'billing' } }

const legal = (path: string, name: string, cle: string, titre: string) => ({
  path,
  name,
  component: () => import('@/views/site/LegalView.vue'),
  props: { cle, titre },
  meta: { public: true, site: true, title: titre, description: `${titre} d’Alu Pliage Service, pliage de tôle aluminium à Fraisses (42).` },
})

export const router = createRouter({
  history: createWebHistory(),
  scrollBehavior: (to, from, saved) => saved ?? (to.hash ? false : to.path === from.path ? false : { top: 0 }),
  routes: [
    // Site vitrine (visiteurs)
    {
      path: '/',
      component: () => import('@/components/site/PublicLayout.vue'),
      children: [
        { path: '', name: 'site-home', component: () => import('@/views/site/HomeView.vue'), meta: { public: true, site: true, title: 'Pliage d’aluminium sur mesure à Fraisses (42)', description: 'Alu Pliage Service, pliage de tôle aluminium sur mesure à Fraisses, près de Saint-Étienne : couvertines, bavettes, bandeaux. Devis gratuit.' } },
        { path: 'pliage-aluminium', name: 'site-pliage', component: () => import('@/views/site/PliageView.vue'), meta: { public: true, site: true, title: 'Pliage aluminium sur mesure', description: 'Couvertines, bavettes d’appui de fenêtre, bandeaux et pièces sur plan, en aluminium ou en acier, jusqu’à 3 mètres. Atelier à Fraisses (42).' } },
        { path: 'contact', name: 'site-contact', component: () => import('@/views/site/ContactView.vue'), meta: { public: true, site: true, title: 'Contact et devis', description: 'Demandez un devis gratuit pour vos pièces de pliage aluminium : envoyez votre plan à Alu Pliage Service, Fraisses (42).' } },
        legal('mentions-legales', 'site-mentions', 'legal.mentions', 'Mentions légales'),
        legal('politique-de-confidentialite', 'site-confidentialite', 'legal.confidentialite', 'Politique de confidentialité'),
        legal('conditions-generales-de-vente', 'site-cgv', 'legal.cgv', 'Conditions générales de vente'),
        legal('cookies', 'site-cookies', 'legal.cookies', 'Cookies'),
        { path: ':pathMatch(.*)*', name: 'site-404', component: () => import('@/views/site/NotFoundView.vue'), meta: { public: true, site: true, noindex: true, title: 'Page introuvable' } },
      ],
    },
    // Atelier (équipe)
    { path: '/connexion', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { public: true, title: 'Connexion' } },
    {
      path: '/',
      component: () => import('@/components/AppLayout.vue'),
      children: [
        { path: 'tableau-de-bord', name: 'dashboard', component: () => import('@/views/DashboardView.vue'), meta: { title: 'Tableau de bord' } },
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
          path: 'factures',
          name: 'billing',
          component: () => import('@/views/BillingView.vue'),
          meta: { perm: 'billing.manage', section: 'Ventes', title: 'Devis et factures' },
        },
        {
          path: 'factures/:id',
          name: 'billing-doc',
          component: () => import('@/views/BillingDocView.vue'),
          meta: { perm: 'billing.manage', section: 'Ventes', parent: billingParent, title: 'Document', menu: 'billing' },
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
          path: 'site-vitrine',
          name: 'site-admin',
          component: () => import('@/views/SiteAdminView.vue'),
          meta: { perm: 'site.manage', section: 'Direction', title: 'Site vitrine' },
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
  ],
})

router.beforeEach(async (to) => {
  // Visiteurs du site : aucun appel à la session, aucun cookie
  if (to.meta.site) return
  const auth = useAuthStore()
  await auth.ensureLoaded()
  if (!to.meta.public && !auth.isLoggedIn) {
    return { name: 'login', query: to.fullPath !== HOME ? { redirect: to.fullPath } : {} }
  }
  if (to.name === 'login' && auth.isLoggedIn) return { name: 'dashboard' }
  // Mot de passe temporaire : seule la page « Mon compte » est accessible
  if (auth.user?.mustChangePassword && to.name !== 'account' && !to.meta.public) return { name: 'account' }
  if (to.meta.perm && !auth.can(to.meta.perm)) return { name: 'dashboard' }
})

router.afterEach((to) => {
  if (to.meta.site) {
    document.title = to.name === 'site-home' ? `Alu Pliage Service · ${to.meta.title}` : `${to.meta.title} · Alu Pliage Service`
    applySeo({ site: !to.meta.noindex, description: to.meta.description, path: to.path })
  } else {
    document.title = `${to.meta.title ? to.meta.title + ' · ' : ''}Atelier · Alu Pliage Service`
    applySeo({ site: false, path: to.path })
  }
})
