import type { Section } from '../db/schema.js'

// Droits d'un compte = ce que donnent ses sections (cumulables) + l'administration si la case est cochée.
// Pour restreindre un accès plus tard, on ajoute une permission ici et on la vérifie sur la route avec requirePerm().
const SECTION_PERMISSIONS = {
  // Commandes, devis et factures, clients
  ventes: ['clients.manage', 'clients.read', 'orders.manage', 'billing.manage'],
  // Commandes à fabriquer, sans les clients ni les prix, et stock de feuilles
  atelier: ['orders.production', 'stock.manage'],
  // Tarifs et catalogue, modèles de documents, boutique, site vitrine, fiches salariés, plan graphique de l'atelier (lecture)
  direction: ['catalog.manage', 'documents.manage', 'products.manage', 'site.manage', 'employees.manage', 'plan.read'],
} as const satisfies Record<Section, readonly string[]>

// Comptes de connexion, journal d'activité (les fiches salariés viennent aussi de la section Direction)
const ADMIN_PERMISSIONS = ['users.manage', 'employees.manage', 'audit.read'] as const

export type Permission = (typeof SECTION_PERMISSIONS)[Section][number] | (typeof ADMIN_PERMISSIONS)[number]

export interface Access {
  sections: readonly Section[]
  admin: boolean
}

export const permissionsOf = (a: Access): readonly Permission[] => [...new Set<Permission>([...a.sections.flatMap((s) => SECTION_PERMISSIONS[s]), ...(a.admin ? ADMIN_PERMISSIONS : [])])]
export const can = (a: Access, perm: Permission) => permissionsOf(a).includes(perm)
