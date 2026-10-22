// Mot de passe oublié : « make mdp COMPTE=admin ».
// Remplace le mot de passe d'un compte de l'atelier par un mot de passe provisoire aléatoire, affiché une seule fois ;
// le compte devra en choisir un nouveau à sa première connexion. Les sessions ouvertes du compte sont coupées.
import { eq } from 'drizzle-orm'
import { db, pool } from './db/index.js'
import { users } from './db/schema.js'
import { hashPassword } from './auth/password.js'
import { generateTempPassword } from './auth/password-policy.js'
import { deleteUserSessions } from './auth/session.js'
import { auditSystem } from './audit.js'

const identifiant = (process.argv[2] ?? '').trim().toLowerCase()
if (!identifiant) {
  console.error('Usage : make mdp COMPTE=identifiant')
  process.exit(1)
}
const [u] = await db.select().from(users).where(eq(users.identifiant, identifiant))
if (!u) {
  console.error(`Aucun compte « ${identifiant} ». Comptes existants : ${(await db.select({ i: users.identifiant }).from(users)).map((x) => x.i).join(', ')}`)
  process.exit(1)
}
const mdp = generateTempPassword()
await db
  .update(users)
  .set({ passwordHash: await hashPassword(mdp), mustChangePassword: true, disabledAt: null, passwordChangedAt: new Date() })
  .where(eq(users.id, u.id))
await deleteUserSessions(u.id)
await auditSystem('user.password_reset', { targetType: 'user', targetId: u.id, details: { identifiant, via: 'make mdp' } })
console.log(`Compte « ${identifiant} » : mot de passe provisoire ${mdp}\nIl sera à changer à la prochaine connexion.`)
await pool.end()
