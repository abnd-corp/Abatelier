import type { Role } from '../db/schema.js'

// Droits par rôle. Pour restreindre un accès plus tard, on ajoute une permission
// ici et on la vérifie sur la route avec requirePerm().
const PERMISSIONS = {
  admin: ['users.manage', 'employees.manage', 'audit.read'],
  atelier: [],
} as const satisfies Record<Role, readonly string[]>

export type Permission = (typeof PERMISSIONS)['admin'][number]

export const permissionsOf = (role: Role): readonly Permission[] => PERMISSIONS[role]
export const can = (role: Role, perm: Permission) => permissionsOf(role).includes(perm)
