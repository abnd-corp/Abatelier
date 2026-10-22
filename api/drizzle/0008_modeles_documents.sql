CREATE TABLE "company_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"raison_sociale" text NOT NULL,
	"forme_juridique" text DEFAULT '' NOT NULL,
	"capital" text DEFAULT '' NOT NULL,
	"adresse" text DEFAULT '' NOT NULL,
	"telephone" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"site_web" text DEFAULT '' NOT NULL,
	"siret" text DEFAULT '' NOT NULL,
	"rcs" text DEFAULT '' NOT NULL,
	"tva_intra" text DEFAULT '' NOT NULL,
	"iban" text DEFAULT '' NOT NULL,
	"bic" text DEFAULT '' NOT NULL,
	"logo" "bytea",
	"logo_type" text,
	"logo_updated_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_settings_single_row" CHECK ("company_settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "document_counters" (
	"type" text NOT NULL,
	"annee" integer NOT NULL,
	"dernier" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "document_counters_type_annee_pk" PRIMARY KEY("type","annee")
);
--> statement-breakpoint
CREATE TABLE "document_template" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"couleur" text DEFAULT '#5b34c4' NOT NULL,
	"entete" text DEFAULT '' NOT NULL,
	"conditions_paiement" text DEFAULT '' NOT NULL,
	"validite_devis" integer DEFAULT 30 NOT NULL,
	"echeance_facture" integer DEFAULT 30 NOT NULL,
	"note_devis" text DEFAULT '' NOT NULL,
	"note_facture" text DEFAULT '' NOT NULL,
	"mentions_legales" text DEFAULT '' NOT NULL,
	"pied_de_page" text DEFAULT '' NOT NULL,
	"prefixe_devis" text DEFAULT 'D' NOT NULL,
	"prefixe_facture" text DEFAULT 'F' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_template_single_row" CHECK ("document_template"."id" = 1)
);
--> statement-breakpoint
-- Valeurs de départ : à compléter par la direction dans « Modèles de documents »
INSERT INTO "company_settings" ("id", "raison_sociale", "adresse") VALUES (1, 'Alu Pliage Service', '42490 Fraisses');
--> statement-breakpoint
INSERT INTO "document_template" ("id") VALUES (1);
