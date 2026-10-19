import { readFileSync } from 'node:fs'
import { z } from 'zod'

/** Lit NOM, ou à défaut le fichier indiqué par NOM_FILE (secrets Docker). */
function secret(name: string) {
  if (process.env[name]) return process.env[name]
  const file = process.env[`${name}_FILE`]
  if (!file) return undefined
  try {
    return readFileSync(file, 'utf8').trim()
  } catch {
    console.error(`Impossible de lire ${name}_FILE (${file}).`)
    process.exit(1)
  }
}

const bool = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true')

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  // Soit DATABASE_URL complète, soit les DB_* (le mot de passe peut venir d'un fichier)
  DATABASE_URL: z.url().optional(),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().int().default(5432),
  DB_NAME: z.string().default('patalu'),
  DB_USER: z.string().default('patalu'),
  DB_PASSWORD: z.string().optional(),
  // Session « Rester connecté » : prolongée tant que l'utilisateur revient
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  // Session normale : coupée après ce délai sans activité
  IDLE_TIMEOUT_HOURS: z.coerce.number().positive().default(12),
  // Essais de connexion par minute et par IP (relevé pour les tests de bout en bout)
  LOGIN_RATE_LIMIT: z.coerce.number().int().positive().default(10),
  // Délai après le premier échec, doublé à chaque échec (abaissé pour les tests)
  LOGIN_DELAY_BASE_MS: z.coerce.number().int().min(0).default(1000),
  // À mettre à true dès que le site est servi en HTTPS
  COOKIE_SECURE: bool,
  // Premier compte, créé au démarrage si la table des utilisateurs est vide
  ADMIN_IDENTIFIANT: z.string().min(3).optional(),
  ADMIN_PASSWORD: z.string().min(12).optional(),
  ADMIN_NOM: z.string().default('Atelier'),
})

const parsed = schema.safeParse({ ...process.env, DB_PASSWORD: secret('DB_PASSWORD'), ADMIN_PASSWORD: secret('ADMIN_PASSWORD') })
if (!parsed.success) {
  console.error('Configuration invalide :', z.prettifyError(parsed.error))
  process.exit(1)
}
const e = parsed.data

if (!e.DATABASE_URL && !e.DB_PASSWORD) {
  console.error('Configuration invalide : définir DATABASE_URL, ou DB_PASSWORD / DB_PASSWORD_FILE.')
  process.exit(1)
}

export const env = {
  ...e,
  databaseUrl:
    e.DATABASE_URL ??
    `postgres://${encodeURIComponent(e.DB_USER)}:${encodeURIComponent(e.DB_PASSWORD!)}@${e.DB_HOST}:${e.DB_PORT}/${e.DB_NAME}`,
}
