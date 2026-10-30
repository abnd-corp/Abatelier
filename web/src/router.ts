import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore, type Permission } from '@/stores/auth'
import { useEspaceStore } from '@/stores/espace'
import { retourEspace } from '@/lib/espace'
import { applySeo } from '@/lib/seo'
import { HOME } from '@/lib/redirect'

declare module 'vue-router' {
  interface RouteMeta {
    public?: boolean
    // Page du site vitrine (visiteurs) : indexable, sans appel à la session
    site?: boolean
    description?: string
    noindex?: boolean
    // Espace client : « connecte » demande un compte client connecté, « invite » (connexion, inscription) renvoie vers l'espace s'il l'est déjà
    espace?: 'connecte' | 'invite'
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
        {
          path: '',
          name: 'site-home',
          component: () => import('@/views/site/HomeView.vue'),
          meta: {
            public: true,
            site: true,
            title: 'Pliage d’aluminium sur mesure à Fraisses (42)',
            description: 'Alu Pliage Service, pliage de tôle aluminium sur mesure à Fraisses, près de Saint-Étienne : couvertines, bavettes, bandeaux. Devis gratuit.',
          },
        },
        {
          path: 'pliage-aluminium',
          name: 'site-pliage',
          component: () => import('@/views/site/PliageView.vue'),
          meta: {
            public: true,
            site: true,
            title: 'Pliage aluminium sur mesure',
            description: 'Couvertines, bavettes d’appui de fenêtre, bandeaux et pièces sur mesure, en aluminium ou en acier, jusqu’à 3 mètres. Atelier à Fraisses (42).',
          },
        },
        {
          path: 'configurateur',
          name: 'site-configurateur',
          component: () => import('@/views/site/ConfiguratorView.vue'),
          meta: {
            public: true,
            site: true,
            title: 'Configurateur de pliage',
            description: 'Dessinez votre pièce de pliage aluminium (couvertine, bavette, bandeau), choisissez la matière et le coloris, et voyez le prix en direct. Devis gratuit.',
          },
        },
        {
          path: 'contact',
          name: 'site-contact',
          component: () => import('@/views/site/ContactView.vue'),
          meta: {
            public: true,
            site: true,
            title: 'Contact et devis',
            description: 'Une question sur vos pièces de pliage aluminium ? Écrivez à Alu Pliage Service, Fraisses (42), ou appelez l’atelier.',
          },
        },
        legal('mentions-legales', 'site-mentions', 'legal.mentions', 'Mentions légales'),
        legal('politique-de-confidentialite', 'site-confidentialite', 'legal.confidentialite', 'Politique de confidentialité'),
        legal('conditions-generales-de-vente', 'site-cgv', 'legal.cgv', 'Conditions générales de vente'),
        legal('cookies', 'site-cookies', 'legal.cookies', 'Cookies'),
        // Boutique : les produits en ligne, le panier et le paiement
        {
          path: 'boutique',
          name: 'site-boutique',
          component: () => import('@/views/site/BoutiqueView.vue'),
          meta: {
            public: true,
            site: true,
            title: 'Boutique',
            description: 'Couvertines, bavettes, bandeaux et accessoires en aluminium aux tailles standard, à commander en ligne. Atelier à Fraisses (42).',
          },
        },
        {
          path: 'boutique/commande/:id',
          name: 'site-paiement-retour',
          component: () => import('@/views/site/PaiementRetourView.vue'),
          props: true,
          meta: { public: true, site: true, noindex: true, title: 'Votre commande' },
        },
        {
          path: 'boutique/:id',
          name: 'site-produit',
          component: () => import('@/views/site/BoutiqueProduitView.vue'),
          props: true,
          meta: { public: true, site: true, title: 'Produit de la boutique' },
        },
        { path: 'panier', name: 'site-panier', component: () => import('@/views/site/PanierView.vue'), meta: { public: true, site: true, noindex: true, title: 'Mon panier' } },
        {
          path: 'paiement-simulation/:id',
          name: 'site-paiement-simulation',
          component: () => import('@/views/site/PaiementSimulationView.vue'),
          props: true,
          meta: { public: true, site: true, noindex: true, title: 'Paiement de démonstration' },
        },
        // Espace client : privé, jamais indexé. La session n'est vérifiée que sur ces pages.
        {
          path: 'espace',
          name: 'espace',
          component: () => import('@/views/site/EspaceHomeView.vue'),
          meta: { public: true, site: true, noindex: true, espace: 'connecte', title: 'Mon espace client' },
        },
        {
          path: 'espace/connexion',
          name: 'espace-connexion',
          component: () => import('@/views/site/EspaceAuthView.vue'),
          props: { mode: 'connexion' },
          meta: { public: true, site: true, noindex: true, espace: 'invite', title: 'Connexion à mon espace client' },
        },
        {
          path: 'espace/mot-de-passe-oublie',
          name: 'espace-mot-de-passe-oublie',
          component: () => import('@/views/site/EspaceMotDePasseOublieView.vue'),
          meta: { public: true, site: true, noindex: true, title: 'Mot de passe oublié' },
        },
        {
          path: 'espace/nouveau-mot-de-passe',
          name: 'espace-nouveau-mot-de-passe',
          component: () => import('@/views/site/EspaceNouveauMotDePasseView.vue'),
          meta: { public: true, site: true, noindex: true, title: 'Choisir mon mot de passe' },
        },
        {
          path: 'espace/inscription',
          name: 'espace-inscription',
          component: () => import('@/views/site/EspaceAuthView.vue'),
          props: { mode: 'inscription' },
          meta: { public: true, site: true, noindex: true, espace: 'invite', title: 'Créer mon espace client' },
        },
        {
          path: 'espace/google-inscription',
          name: 'espace-google-inscription',
          component: () => import('@/views/site/EspaceGoogleInscriptionView.vue'),
          meta: { public: true, site: true, noindex: true, espace: 'invite', title: 'Presque terminé' },
        },
        {
          path: 'espace/profil',
          name: 'espace-profil',
          component: () => import('@/views/site/EspaceProfilView.vue'),
          meta: { public: true, site: true, noindex: true, espace: 'connecte', title: 'Mes informations' },
        },
        {
          path: 'espace/commandes/:id',
          name: 'espace-commande',
          component: () => import('@/views/site/EspaceOrderView.vue'),
          props: true,
          meta: { public: true, site: true, noindex: true, espace: 'connecte', title: 'Ma commande' },
        },
        { path: ':pathMatch(.*)*', name: 'site-404', component: () => import('@/views/site/NotFoundView.vue'), meta: { public: true, site: true, noindex: true, title: 'Page introuvable' } },
      ],
    },
    // Atelier (équipe)
    { path: '/connexion', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { public: true, title: 'Connexion' } },
    // Le plan graphique (direction) occupe toute la page : ni menu ni fil d'ariane, seulement un bouton pour revenir
    {
      path: '/plan-atelier',
      name: 'plan-atelier',
      component: () => import('@/views/PlanAtelierView.vue'),
      meta: { perm: 'plan.read', title: 'Plan de l’atelier' },
    },
    // L'écran de l'atelier est une page à part, sans connexion (écran au mur) : le tableau des commandes, en grand et en lecture seule.
    // L'API ne répond que depuis le réseau interne.
    {
      path: '/ecran-atelier',
      name: 'ecran-atelier',
      component: () => import('@/views/EcranAtelierView.vue'),
      meta: { public: true, title: 'Écran de l’atelier' },
    },
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
          path: 'reception',
          name: 'reception',
          component: () => import('@/views/ReceptionView.vue'),
          meta: { perm: 'stock.manage', section: 'Atelier', title: 'Réception de marchandise' },
        },
        {
          path: 'stock',
          name: 'stock',
          component: () => import('@/views/StockView.vue'),
          meta: { perm: 'stock.manage', section: 'Atelier', title: 'Stock de feuilles' },
        },
        {
          path: 'produits',
          name: 'products',
          component: () => import('@/views/ProductsView.vue'),
          meta: { perm: 'products.manage', section: 'Direction', title: 'Boutique' },
        },
        {
          path: 'produits/:id',
          name: 'product',
          component: () => import('@/views/ProductView.vue'),
          props: true,
          meta: { perm: 'products.manage', section: 'Direction', parent: { label: 'Boutique', to: { name: 'products' } }, title: 'Fiche produit', menu: 'products' },
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
          path: 'fabrication/:id/suivi',
          name: 'production-suivi',
          component: () => import('@/views/ProductionSuiviView.vue'),
          meta: { perm: 'orders.production', section: 'Atelier', parent: productionParent, title: 'Suivi pas à pas', menu: 'production' },
        },
        {
          path: 'catalogue',
          name: 'catalog',
          component: () => import('@/views/CatalogView.vue'),
          meta: { perm: 'catalog.manage', section: 'Direction', title: 'Tarifs et catalogue' },
        },
        {
          path: 'materiaux',
          name: 'materiaux',
          component: () => import('@/views/MateriauxView.vue'),
          meta: { perm: 'catalog.manage', section: 'Direction', title: 'Matériaux' },
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
  // Espace client : seules ses pages vérifient la session du client (autre cookie que l'atelier)
  if (to.meta.espace) {
    const espace = useEspaceStore()
    await espace.ensureLoaded()
    if (to.meta.espace === 'connecte' && !espace.isLoggedIn) return { name: 'espace-connexion', query: { redirect: to.fullPath } }
    if (to.meta.espace === 'invite' && espace.isLoggedIn) return retourEspace(to.query.redirect)
    return
  }
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
