import { bigint, boolean, check, customType, type AnyPgColumn, date, index, integer, jsonb, numeric, pgTable, primaryKey, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

const ts = (name: string) => timestamp(name, { withTimezone: true })

// direction : tout ; rh : salariés et journal ; atelier : production et stock
export const ROLES = ['direction', 'rh', 'atelier'] as const
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
    // Visibles uniquement par la direction et la RH
    notes: text('notes'),
    userId: uuid('user_id')
      .unique()
      .references(() => users.id, { onDelete: 'set null' }),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [index('employees_nom_idx').on(t.nom, t.prenom)],
)

// --- Catalogue (direction) ---
// On ne supprime jamais une matière ou un coloris : on le désactive, pour garder les devis passés lisibles.

export const materials = pgTable(
  'materials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nom: text('nom').notNull(),
    // Épaisseur de la tôle en millimètres (ex. 1.50)
    epaisseur: numeric('epaisseur', { precision: 5, scale: 2, mode: 'number' }).notNull(),
    // Prix de vente HT au m² de développé
    prixM2: numeric('prix_m2', { precision: 10, scale: 2, mode: 'number' }).notNull(),
    // Plus petit retour que la plieuse sait faire dans cette épaisseur, en mm
    retourMin: integer('retour_min').notNull(),
    actif: boolean('actif').notNull().default(true),
    position: integer('position').notNull().default(0),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [unique('materials_nom_epaisseur_unique').on(t.nom, t.epaisseur)],
)

export const colors = pgTable('colors', {
  id: uuid('id').primaryKey().defaultRandom(),
  nom: text('nom').notNull(),
  // Référence fournisseur, unique (ex. « RAL 7016 », « 2100 Sablé », « Aspect bois »)
  reference: text('reference').notNull().unique(),
  // Teinte d'affichage, #rrggbb
  hex: text('hex').notNull(),
  // Majoration en % du prix matière (négative pour un brut moins cher)
  majoration: numeric('majoration', { precision: 5, scale: 2, mode: 'number' }).notNull().default(0),
  // Jours ouvrés ajoutés au délai standard
  delaiSup: integer('delai_sup').notNull().default(0),
  actif: boolean('actif').notNull().default(true),
  position: integer('position').notNull().default(0),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
})

// Modèles de pièces (couvertine, bavette…) : une forme de départ que l'on ajuste à chaque commande.
// Gérés par la direction ; on les désactive au lieu de les supprimer.
export const pieceModels = pgTable('piece_models', {
  id: uuid('id').primaryKey().defaultRandom(),
  nom: text('nom').notNull().unique(),
  // Forme de départ : cotes en mm, angles signés (négatif = pli dans l'autre sens), nom de chaque cote
  cotes: integer('cotes').array().notNull(),
  angles: integer('angles').array().notNull(),
  noms: text('noms').array().notNull(),
  // Direction du premier segment sur le dessin, en degrés (orientation de la vue en coupe)
  cap: integer('cap').notNull().default(0),
  // Valeurs proposées pour une nouvelle pièce
  longueur: integer('longueur').notNull(),
  quantite: integer('quantite').notNull().default(1),
  actif: boolean('actif').notNull().default(true),
  position: integer('position').notNull().default(0),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
})
export type PieceModel = typeof pieceModels.$inferSelect

export const UNITES = ['piece', 'paire'] as const
// Quantité proposée pour une ligne de N pièces : aucune (saisie libre), un nombre fixe,
// une par pièce, ou une par jonction entre deux longueurs posées bout à bout (N − 1)
export const QUANTITES_AUTO = ['aucune', 'fixe', 'par_piece', 'jonctions'] as const

export const accessories = pgTable('accessories', {
  id: uuid('id').primaryKey().defaultRandom(),
  nom: text('nom').notNull().unique(),
  // Prix de vente HT, par unité (la pièce ou la paire)
  prix: numeric('prix', { precision: 10, scale: 2, mode: 'number' }).notNull(),
  unite: text('unite', { enum: UNITES }).notNull().default('piece'),
  // Modèles de pièces avec lesquels l'accessoire est proposé (identifiants de piece_models)
  modeles: uuid('modeles').array().notNull(),
  quantiteAuto: text('quantite_auto', { enum: QUANTITES_AUTO }).notNull().default('aucune'),
  // Utilisé seulement quand quantiteAuto = 'fixe'
  quantiteFixe: integer('quantite_fixe').notNull().default(0),
  actif: boolean('actif').notNull().default(true),
  position: integer('position').notNull().default(0),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
})

export interface QuantityDiscount {
  // À partir de ce nombre de pièces (sur une même ligne de devis)…
  seuil: number
  // …remise en % sur le prix des pièces
  remise: number
}

// Réglages de chiffrage : une seule ligne (id = 1), modifiée par la direction
export const pricingSettings = pgTable(
  'pricing_settings',
  {
    id: integer('id').primaryKey().default(1),
    // Façonnage
    prixPliMl: numeric('prix_pli_ml', { precision: 8, scale: 2, mode: 'number' }).notNull(),
    miseEnRoute: numeric('mise_en_route', { precision: 8, scale: 2, mode: 'number' }).notNull(),
    // Conditions commerciales
    minimumCommande: numeric('minimum_commande', { precision: 10, scale: 2, mode: 'number' }).notNull(),
    remisePro: numeric('remise_pro', { precision: 5, scale: 2, mode: 'number' }).notNull(),
    tva: numeric('tva', { precision: 5, scale: 2, mode: 'number' }).notNull(),
    delaiStandard: integer('delai_standard').notNull(),
    remisesQuantite: jsonb('remises_quantite').$type<QuantityDiscount[]>().notNull(),
    // Limites des machines
    largeurTole: integer('largeur_tole').notNull(),
    longueurMin: integer('longueur_min').notNull(),
    longueurMax: integer('longueur_max').notNull(),
    plisMax: integer('plis_max').notNull(),
    // Angle intérieur possible d'un pli, en degrés, et pince (pli écrasé à plat) faisable ou non
    angleMin: integer('angle_min').notNull().default(30),
    angleMax: integer('angle_max').notNull().default(175),
    pinceAutorisee: boolean('pince_autorisee').notNull().default(false),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [check('pricing_settings_single_row', sql`${t.id} = 1`)],
)

export interface DeliveryZone {
  // Jusqu'à cette distance par la route depuis l'atelier, en km…
  distanceMax: number
  // …prix HT de la livraison
  prix: number
  // Livraison offerte à partir de ce montant de commande HT (null : jamais offerte)
  franco: number | null
}

// Réglages de livraison : une seule ligne (id = 1), modifiée par la direction
export const deliverySettings = pgTable(
  'delivery_settings',
  {
    id: integer('id').primaryKey().default(1),
    // Retrait gratuit à l'atelier
    retraitActif: boolean('retrait_actif').notNull().default(true),
    retraitInfo: text('retrait_info').notNull().default(''),
    // Point de départ des livraisons. Les coordonnées viennent du géocodage de l'adresse.
    atelierAdresse: text('atelier_adresse').notNull(),
    atelierLabel: text('atelier_label'),
    atelierLat: numeric('atelier_lat', { precision: 9, scale: 6, mode: 'number' }),
    atelierLon: numeric('atelier_lon', { precision: 9, scale: 6, mode: 'number' }),
    // Paliers de distance, du plus proche au plus loin. Au-delà du dernier : pas de livraison.
    zones: jsonb('zones').$type<DeliveryZone[]>().notNull(),
    // Supplément si une pièce dépasse cette longueur en mm (null : pas de supplément)
    longueurSeuil: integer('longueur_seuil'),
    longueurPrix: numeric('longueur_prix', { precision: 8, scale: 2, mode: 'number' }).notNull().default(0),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [check('delivery_settings_single_row', sql`${t.id} = 1`)],
)

// --- Modèles de devis et de factures (direction) ---

const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' })
const txt = (name: string) => text(name).notNull().default('')

// Identité de l'entreprise, imprimée sur les devis et les factures : une seule ligne (id = 1)
export const companySettings = pgTable(
  'company_settings',
  {
    id: integer('id').primaryKey().default(1),
    raisonSociale: text('raison_sociale').notNull(),
    formeJuridique: txt('forme_juridique'),
    capital: txt('capital'),
    // Adresse sur plusieurs lignes
    adresse: txt('adresse'),
    telephone: txt('telephone'),
    email: txt('email'),
    siteWeb: txt('site_web'),
    siret: txt('siret'),
    rcs: txt('rcs'),
    tvaIntra: txt('tva_intra'),
    iban: txt('iban'),
    bic: txt('bic'),
    // Logo envoyé par la direction (PNG ou JPEG). Sans logo : celui de l'appli.
    logo: bytea('logo'),
    logoType: text('logo_type', { enum: ['image/png', 'image/jpeg'] }),
    logoUpdatedAt: ts('logo_updated_at'),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [check('company_settings_single_row', sql`${t.id} = 1`)],
)

// Modèle commun aux devis et aux factures : une seule ligne (id = 1)
export const documentTemplate = pgTable(
  'document_template',
  {
    id: integer('id').primaryKey().default(1),
    // Couleur des titres et de l'en-tête du tableau, #rrggbb
    couleur: text('couleur').notNull().default('#5b34c4'),
    // Texte d'introduction, sous les coordonnées du client
    entete: txt('entete'),
    conditionsPaiement: txt('conditions_paiement'),
    // Durée de validité d'un devis et délai de paiement d'une facture, en jours
    validiteDevis: integer('validite_devis').notNull().default(30),
    echeanceFacture: integer('echeance_facture').notNull().default(30),
    noteDevis: txt('note_devis'),
    noteFacture: txt('note_facture'),
    mentionsLegales: txt('mentions_legales'),
    piedDePage: txt('pied_de_page'),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [check('document_template_single_row', sql`${t.id} = 1`)],
)

export const DOCUMENT_TYPES = ['devis', 'facture'] as const
export type DocumentType = (typeof DOCUMENT_TYPES)[number]
// Compteurs : devis, factures et avoirs (numérotation légale), et commandes
export const COUNTER_TYPES = [...DOCUMENT_TYPES, 'avoir', 'commande'] as const
export type CounterType = (typeof COUNTER_TYPES)[number]

// Dernier numéro attribué, par type et par année. La ligne est verrouillée pendant l'attribution :
// deux devis créés en même temps ne peuvent pas recevoir le même numéro, et une création annulée
// (transaction annulée) ne laisse pas de trou. « utilise » passe à vrai au premier document créé :
// le prochain numéro ne peut alors plus être modifié à la main.
export const documentCounters = pgTable(
  'document_counters',
  {
    type: text('type', { enum: COUNTER_TYPES }).notNull(),
    annee: integer('annee').notNull(),
    dernier: integer('dernier').notNull().default(0),
    utilise: boolean('utilise').notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.type, t.annee] })],
)

// --- Clients (direction ; lecture seule pour la RH) ---
// Ils arriveront surtout par le panier du site ; en attendant, l'équipe crée les fiches à la main.
// On ne supprime pas un client : on l'archive, pour garder ses commandes et factures lisibles.

export const CLIENT_TYPES = ['particulier', 'professionnel'] as const
export type ClientType = (typeof CLIENT_TYPES)[number]
export const CLIENT_ORIGINES = ['site', 'atelier', 'telephone', 'email'] as const
export type ClientOrigine = (typeof CLIENT_ORIGINES)[number]

export const clients = pgTable(
  'clients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: text('type', { enum: CLIENT_TYPES }).notNull(),
    // Professionnel : raison sociale obligatoire, prénom et nom du contact facultatifs
    raisonSociale: text('raison_sociale'),
    siret: text('siret'),
    tvaIntra: text('tva_intra'),
    prenom: text('prenom'),
    nom: text('nom'),
    email: text('email'),
    telephone: text('telephone'),
    // Adresse de facturation
    adresse: text('adresse'),
    codePostal: text('code_postal'),
    ville: text('ville'),
    origine: text('origine', { enum: CLIENT_ORIGINES }).notNull(),
    notes: text('notes'),
    archivedAt: ts('archived_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    // Une adresse e-mail désigne un seul client (elle servira à son compte sur le site)
    uniqueIndex('clients_email_idx').on(sql`lower(${t.email})`),
    index('clients_nom_idx').on(t.nom, t.prenom),
    check('clients_identite', sql`(${t.type} = 'professionnel' and ${t.raisonSociale} is not null) or (${t.type} = 'particulier' and ${t.nom} is not null)`),
  ],
)

// Adresses de chantier (livraison) d'un client
export const clientSites = pgTable(
  'client_sites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    libelle: text('libelle').notNull(),
    adresse: text('adresse').notNull(),
    codePostal: text('code_postal').notNull(),
    ville: text('ville').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('client_sites_client_idx').on(t.clientId)],
)

// --- Commandes ---
// Les prix sont calculés avec le catalogue au moment de l'enregistrement, puis figés dans la commande :
// un changement de tarif ne modifie pas une commande déjà passée.

export const ORDER_STATUTS = ['recue', 'validee', 'fabrication', 'prete', 'livree', 'annulee'] as const
export type OrderStatut = (typeof ORDER_STATUTS)[number]
export const LIVRAISON_MODES = ['retrait', 'livraison'] as const

export interface OrderLineAccessory {
  accessoryId: string
  nom: string
  unite: 'piece' | 'paire'
  prix: number
  quantite: number
}

const money = (name: string) => numeric(name, { precision: 12, scale: 2, mode: 'number' }).notNull()

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // C-2026-0001
    numero: text('numero').notNull().unique(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'restrict' }),
    statut: text('statut', { enum: ORDER_STATUTS }).notNull().default('recue'),
    livraisonMode: text('livraison_mode', { enum: LIVRAISON_MODES }).notNull(),
    // Adresse de livraison recopiée (elle reste lisible si la fiche client change)
    livraisonAdresse: text('livraison_adresse'),
    livraisonCodePostal: text('livraison_code_postal'),
    livraisonVille: text('livraison_ville'),
    distanceKm: numeric('distance_km', { precision: 7, scale: 1, mode: 'number' }),
    notes: text('notes'),
    // Totaux HT, TVA et TTC, en euros
    brut: money('brut'),
    remisePro: money('remise_pro'),
    complementMinimum: money('complement_minimum'),
    livraisonPrix: money('livraison_prix'),
    ht: money('ht'),
    tauxTva: numeric('taux_tva', { precision: 5, scale: 2, mode: 'number' }).notNull(),
    tva: money('tva'),
    ttc: money('ttc'),
    // Délai en jours ouvrés, et date prévue fixée à la validation
    delaiJours: integer('delai_jours').notNull(),
    datePrevue: date('date_prevue', { mode: 'string' }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [index('orders_client_idx').on(t.clientId), index('orders_statut_idx').on(t.statut)],
)

// Pièces d'une commande, avec le détail du chiffrage
export const orderLines = pgTable(
  'order_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    // Repère libre (« Mur sud », « Fenêtre cuisine »)
    repere: text('repere'),
    // Modèle de départ, et son nom et son orientation recopiés (la ligne reste lisible si le modèle change)
    modelId: uuid('model_id').references(() => pieceModels.id, { onDelete: 'set null' }),
    modeleLabel: text('modele_label').notNull(),
    cap: integer('cap').notNull().default(0),
    materialId: uuid('material_id').references(() => materials.id, { onDelete: 'set null' }),
    materialLabel: text('material_label').notNull(),
    colorId: uuid('color_id').references(() => colors.id, { onDelete: 'set null' }),
    colorLabel: text('color_label').notNull(),
    colorHex: text('color_hex').notNull(),
    // Cotes extérieures de chaque segment en mm, et angle intérieur de chaque pli en degrés
    cotes: integer('cotes').array().notNull(),
    angles: integer('angles').array().notNull(),
    longueur: integer('longueur').notNull(),
    quantite: integer('quantite').notNull(),
    accessoires: jsonb('accessoires').$type<OrderLineAccessory[]>().notNull(),
    prixUnitaire: money('prix_unitaire'),
    remiseQuantite: numeric('remise_quantite', { precision: 5, scale: 2, mode: 'number' }).notNull(),
    montantPieces: money('montant_pieces'),
    montantAccessoires: money('montant_accessoires'),
    miseEnRoute: money('mise_en_route'),
    total: money('total'),
  },
  (t) => [index('order_lines_order_idx').on(t.orderId)],
)

// Chaque changement d'étape, daté, avec la personne qui l'a fait
export const orderEvents = pgTable(
  'order_events',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    statut: text('statut', { enum: ORDER_STATUTS }).notNull(),
    at: ts('at').notNull().defaultNow(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    note: text('note'),
  },
  (t) => [index('order_events_order_idx').on(t.orderId)],
)

// --- Devis, factures et avoirs (direction) ---
// Créés depuis une commande. Une fois émis, leur contenu (lignes, montants, PDF) est figé :
// un déclencheur de la base refuse toute modification et toute suppression (migration 0014).
// Seul le suivi (envoi, réponse au devis, paiement) évolue. Une facture se corrige par un avoir.

export const BILLING_TYPES = ['devis', 'facture', 'avoir'] as const
export type BillingType = (typeof BILLING_TYPES)[number]
export const DEVIS_REPONSES = ['accepte', 'refuse'] as const
export const PAIEMENT_MODES = ['virement', 'cheque', 'carte', 'especes'] as const
export type PaiementMode = (typeof PAIEMENT_MODES)[number]

export interface BillingLine {
  designation: string
  detail?: string
  quantite: number
  prixUnitaire: number
}

export const billingDocuments = pgTable(
  'billing_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: text('type', { enum: BILLING_TYPES }).notNull(),
    // D-2026-0001, F-2026-0001, A-2026-0001
    numero: text('numero').notNull().unique(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'restrict' }),
    // Avoir : la facture qu'il annule (un seul avoir par facture)
    factureId: uuid('facture_id').references((): AnyPgColumn => billingDocuments.id, { onDelete: 'restrict' }),
    emisLe: ts('emis_le').notNull().defaultNow(),
    // Devis : valable jusqu'au ; facture : à payer avant le
    echeance: date('echeance', { mode: 'string' }),
    // Client tel qu'imprimé sur le document
    clientNom: text('client_nom').notNull(),
    clientAdresse: text('client_adresse').notNull(),
    lignes: jsonb('lignes').$type<BillingLine[]>().notNull(),
    ht: money('ht'),
    tauxTva: numeric('taux_tva', { precision: 5, scale: 2, mode: 'number' }).notNull(),
    tva: money('tva'),
    ttc: money('ttc'),
    // Le PDF remis au client, conservé tel quel (PDF/A-3 Factur-X pour une facture ou un avoir)
    pdf: bytea('pdf').notNull(),
    // Le XML Factur-X embarqué dans le PDF, gardé à part pour le déposer sur une plateforme de facturation
    facturxXml: text('facturx_xml'),
    // Avoir : raison de l'annulation
    motif: text('motif'),
    // Suivi
    envoyeLe: ts('envoye_le'),
    reponse: text('reponse', { enum: DEVIS_REPONSES }),
    reponseLe: ts('reponse_le'),
    payeLe: date('paye_le', { mode: 'string' }),
    modePaiement: text('mode_paiement', { enum: PAIEMENT_MODES }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('billing_documents_order_idx').on(t.orderId),
    index('billing_documents_client_idx').on(t.clientId),
    index('billing_documents_type_idx').on(t.type, t.emisLe),
    uniqueIndex('billing_documents_facture_idx').on(t.factureId),
    check('billing_documents_avoir', sql`(${t.type} = 'avoir') = (${t.factureId} is not null)`),
  ],
)

export type User = typeof users.$inferSelect
export type Employee = typeof employees.$inferSelect
// --- Site vitrine ---

// Textes du site modifiables par la direction : une ligne par champ (clé définie dans site.ts)
export const siteContent = pgTable('site_content', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
})

// Où une photo s'affiche : bandeau d'accueil, galerie de réalisations ou page d'un produit
export const PHOTO_PLACES = ['accueil', 'realisation', 'couvertine', 'bavette', 'bandeau'] as const
export type PhotoPlace = (typeof PHOTO_PLACES)[number]

export const sitePhotos = pgTable(
  'site_photos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    emplacement: text('emplacement', { enum: PHOTO_PLACES }).notNull(),
    // Description pour les malvoyants et le référencement
    alt: text('alt').notNull().default(''),
    type: text('type', { enum: ['image/png', 'image/jpeg'] }).notNull(),
    largeur: integer('largeur').notNull(),
    hauteur: integer('hauteur').notNull(),
    data: bytea('data').notNull(),
    position: integer('position').notNull().default(0),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('site_photos_place_idx').on(t.emplacement, t.position)],
)

// Demandes reçues par le formulaire de contact du site
export const contactRequests = pgTable(
  'contact_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    createdAt: ts('created_at').notNull().defaultNow(),
    nom: text('nom').notNull(),
    email: text('email').notNull(),
    telephone: text('telephone'),
    adresse: text('adresse'),
    codePostal: text('code_postal'),
    ville: text('ville'),
    objet: text('objet').notNull(),
    message: text('message').notNull(),
    // Plan joint (PDF, photo ou croquis)
    fichierNom: text('fichier_nom'),
    fichierType: text('fichier_type'),
    fichier: bytea('fichier'),
    traiteAt: ts('traite_at'),
    traitePar: uuid('traite_par').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => [index('contact_requests_created_idx').on(t.createdAt)],
)

// Journal des e-mails envoyés par l'application (preuve d'envoi, diagnostic quand un message n'arrive pas)
export const EMAIL_KINDS = ['contact', 'document', 'test'] as const
export const emailLog = pgTable(
  'email_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    at: ts('at').notNull().defaultNow(),
    kind: text('kind', { enum: EMAIL_KINDS }).notNull(),
    // Adresses séparées par une virgule
    destinataires: text('destinataires').notNull(),
    objet: text('objet').notNull(),
    statut: text('statut', { enum: ['envoye', 'echec'] }).notNull(),
    // Raison de l'échec, sans mot de passe ni détail technique sensible
    erreur: text('erreur'),
    targetType: text('target_type'),
    targetId: text('target_id'),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => [index('email_log_at_idx').on(t.at)],
)

export type SitePhoto = typeof sitePhotos.$inferSelect
export type ContactRequest = typeof contactRequests.$inferSelect
export type Material = typeof materials.$inferSelect
export type Color = typeof colors.$inferSelect
export type PricingSettings = typeof pricingSettings.$inferSelect
export type Accessory = typeof accessories.$inferSelect
export type DeliverySettings = typeof deliverySettings.$inferSelect
export type CompanySettings = typeof companySettings.$inferSelect
export type DocumentTemplate = typeof documentTemplate.$inferSelect
export type Client = typeof clients.$inferSelect
export type ClientSite = typeof clientSites.$inferSelect
export type Order = typeof orders.$inferSelect
export type OrderLine = typeof orderLines.$inferSelect
export type BillingDocument = typeof billingDocuments.$inferSelect
