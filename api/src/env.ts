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
  DB_NAME: z.string().default('abatelier'),
  DB_USER: z.string().default('abatelier'),
  DB_PASSWORD: z.string().optional(),
  // Session « Rester connecté » : prolongée tant que l'utilisateur revient
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  // Session normale : coupée après ce délai sans activité
  IDLE_TIMEOUT_HOURS: z.coerce.number().positive().default(12),
  // Essais de connexion et de changement de mot de passe, par minute et par IP (relevé pour les tests de bout en bout)
  LOGIN_RATE_LIMIT: z.coerce.number().int().positive().default(10),
  // Délai après le premier échec, doublé à chaque échec (abaissé pour les tests)
  LOGIN_DELAY_BASE_MS: z.coerce.number().int().min(0).default(1000),
  // Envois du formulaire de contact du site, par heure et par IP (relevé pour les tests de bout en bout)
  CONTACT_RATE_LIMIT: z.coerce.number().int().positive().default(20),
  // Chiffrages du configurateur public, par minute et par IP (relevé pour les tests de bout en bout)
  QUOTE_RATE_LIMIT: z.coerce.number().int().positive().default(60),
  // Envoi d'e-mails : sans SMTP_HOST et MAIL_FROM, l'application fonctionne sans envoyer (boutons masqués ou refusés)
  SMTP_HOST: z.string().trim().optional(),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_USER: z.string().trim().optional(),
  SMTP_PASSWORD: z.string().optional(),
  // true pour le port 465 (TLS dès la connexion) ; sinon STARTTLS, obligatoire dès qu'il y a un identifiant
  SMTP_SECURE: bool,
  // Expéditeur, par exemple « Alu Pliage Service <contact@exemple.fr> »
  MAIL_FROM: z.string().trim().optional(),
  // Adresses qui reçoivent les alertes (demandes de contact), séparées par des virgules ; par défaut l'e-mail de l'entreprise
  MAIL_ALERT_TO: z.string().trim().optional(),
  // Paiement en ligne de la boutique : none (désactivé), simulation (faux paiement pour le développement et les tests) ou stripe
  PAYMENT_PROVIDER: z.enum(['none', 'simulation', 'stripe']).default('none'),
  // Stripe : clé secrète et secret de signature des notifications (webhooks), dans secrets/
  STRIPE_SECRET_KEY: z.string().trim().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().trim().optional(),
  // Connexion avec Google à l'espace client : none (désactivée), simulation (faux Google pour le développement et les tests) ou google
  GOOGLE_OAUTH_PROVIDER: z.enum(['none', 'simulation', 'google']).default('none'),
  GOOGLE_OAUTH_CLIENT_ID: z.string().trim().optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().trim().optional(),
  // Autorise le faux Google dans une pile de production jetable (tests de bout en bout) ; jamais sur un vrai serveur
  ALLOW_FAKE_GOOGLE: bool,
  // Autorise le faux paiement dans une pile de production jetable (tests de bout en bout) ; jamais sur un vrai serveur
  ALLOW_FAKE_PAYMENT: bool,
  // À mettre à true dès que le site est servi en HTTPS
  COOKIE_SECURE: bool,
  // Premier compte, créé au démarrage si la table des utilisateurs est vide
  ADMIN_IDENTIFIANT: z.string().min(3).optional(),
  ADMIN_PASSWORD: z.string().min(12).optional(),
  ADMIN_NOM: z.string().default('Administrateur'),
  // Avis Google affichés sur le site : identifiant de la fiche et clé de l'API Places (sans clé, le site affiche seulement un lien)
  GOOGLE_PLACE_ID: z.string().trim().optional(),
  // Pages légales, réglées une fois à l'installation : hébergeur du site (mentions légales) et médiateur de la consommation (conditions de vente)
  LEGAL_HEBERGEUR: z.string().trim().optional(),
  LEGAL_MEDIATEUR: z.string().trim().optional(),
  GOOGLE_PLACES_API_KEY: z.string().trim().optional(),
})

const parsed = schema.safeParse({
  ...process.env,
  DB_PASSWORD: secret('DB_PASSWORD'),
  ADMIN_PASSWORD: secret('ADMIN_PASSWORD'),
  GOOGLE_PLACES_API_KEY: secret('GOOGLE_PLACES_API_KEY'),
  SMTP_PASSWORD: secret('SMTP_PASSWORD'),
  STRIPE_SECRET_KEY: secret('STRIPE_SECRET_KEY'),
  STRIPE_WEBHOOK_SECRET: secret('STRIPE_WEBHOOK_SECRET'),
  GOOGLE_OAUTH_CLIENT_SECRET: secret('GOOGLE_OAUTH_CLIENT_SECRET'),
})
if (!parsed.success) {
  console.error('Configuration invalide :', z.prettifyError(parsed.error))
  process.exit(1)
}
const e = parsed.data

if (e.PAYMENT_PROVIDER === 'stripe' && (!e.STRIPE_SECRET_KEY || !e.STRIPE_WEBHOOK_SECRET)) {
  console.error('Configuration invalide : PAYMENT_PROVIDER=stripe demande STRIPE_SECRET_KEY et STRIPE_WEBHOOK_SECRET (ou leurs fichiers _FILE).')
  process.exit(1)
}
if (e.GOOGLE_OAUTH_PROVIDER === 'google' && (!e.GOOGLE_OAUTH_CLIENT_ID || !e.GOOGLE_OAUTH_CLIENT_SECRET)) {
  console.error('Configuration invalide : GOOGLE_OAUTH_PROVIDER=google demande GOOGLE_OAUTH_CLIENT_ID et GOOGLE_OAUTH_CLIENT_SECRET (ou son fichier _FILE).')
  process.exit(1)
}
if (e.GOOGLE_OAUTH_PROVIDER === 'simulation' && e.NODE_ENV === 'production' && !e.ALLOW_FAKE_GOOGLE) {
  console.error('Configuration invalide : le faux Google « simulation » est interdit en production (sauf ALLOW_FAKE_GOOGLE=true, pour les tests de bout en bout).')
  process.exit(1)
}
if (e.PAYMENT_PROVIDER === 'simulation' && e.NODE_ENV === 'production' && !e.ALLOW_FAKE_PAYMENT) {
  console.error('Configuration invalide : le paiement « simulation » est interdit en production (sauf ALLOW_FAKE_PAYMENT=true, pour les tests de bout en bout).')
  process.exit(1)
}

if (!e.DATABASE_URL && !e.DB_PASSWORD) {
  console.error('Configuration invalide : définir DATABASE_URL, ou DB_PASSWORD / DB_PASSWORD_FILE.')
  process.exit(1)
}

export const env = {
  ...e,
  databaseUrl: e.DATABASE_URL ?? `postgres://${encodeURIComponent(e.DB_USER)}:${encodeURIComponent(e.DB_PASSWORD!)}@${e.DB_HOST}:${e.DB_PORT}/${e.DB_NAME}`,
}
