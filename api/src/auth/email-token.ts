import { createHash, randomBytes } from 'node:crypto'
import { and, desc, eq, gt, isNull } from 'drizzle-orm'
import { db } from '../db/index.js'
import { emailTokens, type EmailTokenPurpose } from '../db/schema.js'

// Liens à usage unique envoyés par e-mail. Le jeton (32 octets aléatoires) n'existe que dans le message : la base garde son empreinte.

/** Durée de validité : un mot de passe se réinitialise dans l'heure ; une activation laisse quelques jours. */
const TTL_MS: Record<EmailTokenPurpose, number> = { reinitialisation: 60 * 60 * 1000, activation: 7 * 24 * 60 * 60 * 1000 }
/** Pas plus d'un message de ce genre par client dans ce délai : personne ne peut en inonder une boîte. */
export const COOLDOWN_MS = 60 * 1000

const hash = (token: string) => createHash('sha256').update(token).digest('hex')

/** Un client a-t-il déjà reçu un lien de ce type il y a moins d'une minute ? */
export async function recentlyIssued(clientId: string, purpose: EmailTokenPurpose, now = Date.now()) {
  const [last] = await db
    .select({ createdAt: emailTokens.createdAt })
    .from(emailTokens)
    .where(and(eq(emailTokens.clientId, clientId), eq(emailTokens.purpose, purpose)))
    .orderBy(desc(emailTokens.createdAt))
    .limit(1)
  return last ? now - last.createdAt.getTime() < COOLDOWN_MS : false
}

/** Crée un lien et renvoie le jeton à mettre dans le message. Les liens précédents du même type cessent de fonctionner. */
export async function issueEmailToken(clientId: string, purpose: EmailTokenPurpose, now = Date.now()) {
  const token = randomBytes(32).toString('base64url')
  await db.transaction(async (tx) => {
    await tx
      .update(emailTokens)
      .set({ usedAt: new Date(now) })
      .where(and(eq(emailTokens.clientId, clientId), eq(emailTokens.purpose, purpose), isNull(emailTokens.usedAt)))
    await tx.insert(emailTokens).values({ id: hash(token), clientId, purpose, expiresAt: new Date(now + TTL_MS[purpose]) })
  })
  return token
}

/** Le lien est-il valable (inconnu, expiré ou déjà utilisé : même réponse) ? */
export async function findEmailToken(token: string, now = Date.now()) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null
  const [row] = await db
    .select()
    .from(emailTokens)
    .where(and(eq(emailTokens.id, hash(token)), isNull(emailTokens.usedAt), gt(emailTokens.expiresAt, new Date(now))))
  return row ?? null
}

/** Marque le lien utilisé, une seule fois : renvoie false si quelqu'un l'a déjà consommé entre-temps. */
export async function consumeEmailToken(id: string, now = Date.now()) {
  const rows = await db
    .update(emailTokens)
    .set({ usedAt: new Date(now) })
    .where(and(eq(emailTokens.id, id), isNull(emailTokens.usedAt)))
    .returning({ id: emailTokens.id })
  return rows.length === 1
}
