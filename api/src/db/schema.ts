import { bigint, boolean, date, index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

const ts = (name: string) => timestamp(name, { withTimezone: true })

export const ROLES = ['admin', 'atelier'] as const
export type Role = (typeof ROLES)[number]

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  identifiant: text('identifiant').notNull().unique(),
  nom: text('nom').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ROLES }).notNull().default('atelier'),
  // Mot de passe temporaire donné par un admin : à changer à la prochaine connexion
  mustChangePassword: boolean('must_change_password').notNull().default(false),
  // Compte désactivé (départ d'un employé) : plus de connexion, historique conservé
  disabledAt: ts('disabled_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
  lastLoginAt: ts('last_login_at'),
  passwordChangedAt: ts('password_changed_at'),
})

// L'id est le SHA-256 du jeton envoyé dans le cookie : une fuite de la base
// ne permet pas de réutiliser les sessions. publicId sert à les désigner dans l'interface.
export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    publicId: uuid('public_id').notNull().unique().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    remember: boolean('remember').notNull().default(false),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: ts('created_at').notNull().defaultNow(),
    lastSeenAt: ts('last_seen_at').notNull().defaultNow(),
    expiresAt: ts('expires_at').notNull(),
  },
  (t) => [index('sessions_user_id_idx').on(t.userId)],
)

// Échecs de connexion par identifiant tapé (qu'il existe ou non, pour ne rien révéler)
export const loginAttempts = pgTable('login_attempts', {
  identifiant: text('identifiant').primaryKey(),
  failures: integer('failures').notNull().default(0),
  lastFailedAt: ts('last_failed_at').notNull().defaultNow(),
  lockedUntil: ts('locked_until'),
})

// Journal « qui a fait quoi » : connexions, gestion des comptes, et plus tard les actions métier
export const auditLog = pgTable(
  'audit_log',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    at: ts('at').notNull().defaultNow(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    // Identifiant au moment de l'action (ou identifiant tapé lors d'un échec de connexion)
    identifiant: text('identifiant'),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    ip: text('ip'),
    userAgent: text('user_agent'),
    details: jsonb('details'),
  },
  (t) => [index('audit_log_at_idx').on(t.at), index('audit_log_user_idx').on(t.userId), index('audit_log_action_idx').on(t.action)],
)

export const CONTRATS = ['cdi', 'cdd', 'apprentissage', 'interim', 'stage'] as const
export type Contrat = (typeof CONTRATS)[number]

// Salariés de l'entreprise. Un salarié peut avoir un compte de connexion (user_id), ou pas.
// Les comptes techniques (admin, poste partagé) n'ont pas de fiche salarié.
export const employees = pgTable(
  'employees',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    prenom: text('prenom').notNull(),
    nom: text('nom').notNull(),
    poste: text('poste'),
    contrat: text('contrat', { enum: CONTRATS }),
    dateEntree: date('date_entree', { mode: 'string' }),
    // Une fois cette date atteinte, le compte lié est désactivé automatiquement
    dateSortie: date('date_sortie', { mode: 'string' }),
    telephone: text('telephone'),
    email: text('email'),
    // Visibles uniquement par les administrateurs
    notes: text('notes'),
    userId: uuid('user_id')
      .unique()
      .references(() => users.id, { onDelete: 'set null' }),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [index('employees_nom_idx').on(t.nom, t.prenom)],
)

export type User = typeof users.$inferSelect
export type Employee = typeof employees.$inferSelect
