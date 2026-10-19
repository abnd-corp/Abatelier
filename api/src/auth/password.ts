import { hash, verify } from '@node-rs/argon2'

// Paramètres Argon2id recommandés par l'OWASP
const options = { memoryCost: 19456, timeCost: 2, parallelism: 1 }

export const hashPassword = (password: string) => hash(password, options)

// Hash factice : on le vérifie quand l'identifiant n'existe pas, pour que la
// réponse prenne le même temps et ne révèle pas quels identifiants existent.
const dummyHash = hashPassword('mot-de-passe-factice')

export async function verifyPassword(passwordHash: string | undefined, password: string) {
  try {
    const ok = await verify(passwordHash ?? (await dummyHash), password)
    return ok && passwordHash !== undefined
  } catch {
    return false
  }
}
