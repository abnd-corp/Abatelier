import type { Role } from '../db/schema.js'

// Droits par rôle. Pour restreindre un accès plus tard, on ajoute une permission
// ici et on la vérifie sur la route avec requirePerm().
const PERMISSIONS = {
  direction: [
    'users.manage',
    'employees.manage',
    'audit.read',
    'catalog.manage',
    'documents.manage',
    'clients.manage',
    'clients.read',
    'orders.manage',
    'orders.production',
    'billing.manage',
    'site.manage',
    'products.manage',
    'stock.manage',
  ],
  // La RH gère les fiches salariés, mais pas les comptes de connexion ; elle consulte les clients
  rh: ['employees.manage', 'audit.read', 'clients.read'],
  // L'atelier voit les commandes à fabriquer, sans les clients ni les prix, et tient le stock de feuilles
  atelier: ['orders.production', 'stock.manage'],
} as const satisfies Record<Role, readonly string[]>

export type Permission = (typeof PERMISSIONS)['direction'][number]

export const permissionsOf = (role: Role): readonly Permission[] => PERMISSIONS[role]
export const can = (role: Role, perm: Permission) => permissionsOf(role).includes(perm)
