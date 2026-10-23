CREATE TABLE "colors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nom" text NOT NULL,
	"reference" text NOT NULL,
	"hex" text NOT NULL,
	"majoration" numeric(5, 2) DEFAULT 0 NOT NULL,
	"delai_sup" integer DEFAULT 0 NOT NULL,
	"actif" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "colors_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nom" text NOT NULL,
	"epaisseur" numeric(5, 2) NOT NULL,
	"prix_m2" numeric(10, 2) NOT NULL,
	"retour_min" integer NOT NULL,
	"actif" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "materials_nom_epaisseur_unique" UNIQUE("nom","epaisseur")
);
--> statement-breakpoint
-- Catalogue de départ (valeurs de la maquette, à ajuster dans l'écran Tarifs et catalogue)
INSERT INTO "materials" ("nom", "epaisseur", "prix_m2", "retour_min", "position") VALUES
  ('Aluminium', 1.00, 48.00, 10, 1),
  ('Aluminium', 1.50, 62.00, 10, 2),
  ('Aluminium', 2.00, 78.00, 15, 3),
  ('Acier galvanisé', 0.75, 36.00, 8, 4);
--> statement-breakpoint
INSERT INTO "colors" ("nom", "reference", "hex", "majoration", "delai_sup", "position") VALUES
  ('Blanc pur', 'RAL 9010', '#efeadc', 0, 0, 1),
  ('Gris anthracite', 'RAL 7016', '#383e42', 0, 0, 2),
  ('Aluminium blanc', 'RAL 9006', '#a3a6a5', 0, 0, 3),
  ('Noir sablé', '2100 Sablé', '#27282b', 12, 0, 4),
  ('Chêne doré', 'Aspect bois', '#a9733f', 35, 5, 5),
  ('Brut', 'Non laqué', '#cdd1d4', -15, 0, 6);
