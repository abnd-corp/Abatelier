import { count } from 'drizzle-orm'
import { db } from './db/index.js'
import { SECTIONS, users } from './db/schema.js'
import { hashPassword } from './auth/password.js'
import { env } from './env.js'

/** Crée le premier compte admin à partir des variables ADMIN_*, uniquement si aucun utilisateur n'existe. */
export async function seedAdmin(log: { info: (msg: string) => void; warn: (msg: string) => void }) {
  const [row] = await db.select({ n: count() }).from(users)
  if (row && row.n > 0) return

  if (!env.ADMIN_IDENTIFIANT || !env.ADMIN_PASSWORD) {
    log.warn('Aucun utilisateur en base : définissez ADMIN_IDENTIFIANT et ADMIN_PASSWORD (ou ADMIN_PASSWORD_FILE) pour créer le premier compte.')
    return
  }
  await db.insert(users).values({
    identifiant: env.ADMIN_IDENTIFIANT.trim().toLowerCase(),
    nom: env.ADMIN_NOM,
    passwordHash: await hashPassword(env.ADMIN_PASSWORD),
    sections: [...SECTIONS],
    admin: true,
  })
  log.info(`Compte admin « ${env.ADMIN_IDENTIFIANT} » créé.`)
}
