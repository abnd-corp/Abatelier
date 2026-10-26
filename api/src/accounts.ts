import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from './db/index.js'
import { SECTIONS, users, type Section } from './db/schema.js'
import { hashPassword } from './auth/password.js'
import { generateTempPassword } from './auth/password-policy.js'

export const identifiantSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,40}$/, 'L’identifiant fait 3 à 40 caractères : lettres sans accent, chiffres, point, tiret ou tiret bas.')

/** Droits demandés pour un compte : au moins une section, ou l'administration. Sections sans doublon, dans l'ordre du menu. */
const sectionsList = z.array(z.enum(SECTIONS, { error: 'Section inconnue.' })).transform((l) => SECTIONS.filter((s) => l.includes(s)))
export const accessShape = {
  sections: sectionsList.default([]),
  admin: z.boolean().default(false),
}
/** Pour une modification : chaque champ est facultatif, et absent veut dire « inchangé ». */
export const accessChanges = { sections: sectionsList.optional(), admin: z.boolean().optional() }
export const accessOk = (a: { sections: unknown[]; admin: boolean }) => a.sections.length > 0 || a.admin
export const ACCESS_ERROR = 'Cochez au moins une section ou l’administration.'
export const accessSchema = z.object(accessShape).refine(accessOk, { message: ACCESS_ERROR, path: ['sections'] })

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export class IdentifiantTaken extends Error {
  constructor(public identifiant: string) {
    super(`L’identifiant « ${identifiant} » est déjà utilisé.`)
  }
}

/**
 * Crée un compte avec un mot de passe temporaire, à changer à la première connexion.
 * Le mot de passe n'est renvoyé qu'ici : il n'est stocké que sous forme de hash.
 */
export async function createAccount(tx: Tx | typeof db, a: { identifiant: string; nom: string; sections: Section[]; admin: boolean }) {
  const [exists] = await tx.select({ id: users.id }).from(users).where(eq(users.identifiant, a.identifiant))
  if (exists) throw new IdentifiantTaken(a.identifiant)
  const tempPassword = generateTempPassword()
  const [created] = await tx
    .insert(users)
    .values({ ...a, passwordHash: await hashPassword(tempPassword), mustChangePassword: true })
    .returning({ id: users.id })
  return { id: created!.id, tempPassword }
}
