CREATE TABLE "accessories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nom" text NOT NULL,
	"prix" numeric(10, 2) NOT NULL,
	"unite" text DEFAULT 'piece' NOT NULL,
	"modeles" text[] NOT NULL,
	"quantite_auto" text DEFAULT 'aucune' NOT NULL,
	"quantite_fixe" integer DEFAULT 0 NOT NULL,
	"actif" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accessories_nom_unique" UNIQUE("nom")
);
--> statement-breakpoint
-- Accessoires de départ (valeurs de la maquette, à ajuster dans l'écran Tarifs et catalogue)
INSERT INTO "accessories" ("nom", "prix", "unite", "modeles", "quantite_auto", "quantite_fixe", "position") VALUES
  ('Bouchon de couvertine', 6.90, 'piece', '{couvertine}', 'fixe', 2, 1),
  ('Éclisse de jonction', 7.80, 'piece', '{couvertine}', 'jonctions', 0, 2),
  ('Embouts de bavette', 9.60, 'paire', '{bavette}', 'par_piece', 0, 3),
  ('Angle de bandeau', 14.50, 'piece', '{bandeau}', 'fixe', 2, 4);
