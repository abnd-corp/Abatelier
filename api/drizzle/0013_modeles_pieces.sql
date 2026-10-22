-- Modèles de pièces gérés par la direction (auparavant écrits dans le code)
CREATE TABLE "piece_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nom" text NOT NULL,
	"cotes" integer[] NOT NULL,
	"angles" integer[] NOT NULL,
	"noms" text[] NOT NULL,
	"cap" integer DEFAULT 0 NOT NULL,
	"longueur" integer NOT NULL,
	"quantite" integer DEFAULT 1 NOT NULL,
	"actif" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "piece_models_nom_unique" UNIQUE("nom")
);
--> statement-breakpoint
-- Les quatre modèles d'avant, avec des identifiants fixes pour reprendre les données ci-dessous
INSERT INTO "piece_models" ("id", "nom", "cotes", "angles", "noms", "cap", "longueur", "quantite", "position") VALUES
  ('00000000-0000-4000-a000-000000000001', 'Couvertine', '{20,70,300,70,20}', '{-135,90,90,-135}', '{Larmier,Retombée,Dessus,Retombée,Larmier}', -45, 3000, 4, 1),
  ('00000000-0000-4000-a000-000000000002', 'Bavette d’appui', '{30,220,45,15}', '{-95,95,135}', '{Rejingot,Dessus,Nez,Retour}', 90, 1400, 2, 2),
  ('00000000-0000-4000-a000-000000000003', 'Bandeau', '{40,150}', '{-90}', '{Retour,Face}', 180, 3000, 6, 3),
  ('00000000-0000-4000-a000-000000000004', 'Autre profil', '{60,120}', '{90}', '{"",""}', 0, 2000, 1, 4);
--> statement-breakpoint
-- Accessoires : les noms de modèles deviennent des identifiants. Le profil libre proposait tous les accessoires : on garde ce comportement.
ALTER TABLE "accessories" ADD COLUMN "modeles_ids" uuid[];--> statement-breakpoint
UPDATE "accessories" SET "modeles_ids" = ARRAY(
  SELECT CASE m WHEN 'couvertine' THEN '00000000-0000-4000-a000-000000000001'::uuid WHEN 'bavette' THEN '00000000-0000-4000-a000-000000000002'::uuid ELSE '00000000-0000-4000-a000-000000000003'::uuid END
  FROM unnest("modeles") AS m
) || '00000000-0000-4000-a000-000000000004'::uuid;--> statement-breakpoint
ALTER TABLE "accessories" DROP COLUMN "modeles";--> statement-breakpoint
ALTER TABLE "accessories" RENAME COLUMN "modeles_ids" TO "modeles";--> statement-breakpoint
ALTER TABLE "accessories" ALTER COLUMN "modeles" SET NOT NULL;--> statement-breakpoint
-- Lignes de commande : lien vers le modèle, et son nom et son orientation recopiés
ALTER TABLE "order_lines" ADD COLUMN "model_id" uuid;--> statement-breakpoint
ALTER TABLE "order_lines" ADD COLUMN "modele_label" text;--> statement-breakpoint
ALTER TABLE "order_lines" ADD COLUMN "cap" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "order_lines" l SET "model_id" = p."id", "modele_label" = p."nom", "cap" = p."cap"
FROM "piece_models" p
WHERE p."id" = CASE l."modele" WHEN 'couvertine' THEN '00000000-0000-4000-a000-000000000001'::uuid WHEN 'bavette' THEN '00000000-0000-4000-a000-000000000002'::uuid WHEN 'bandeau' THEN '00000000-0000-4000-a000-000000000003'::uuid ELSE '00000000-0000-4000-a000-000000000004'::uuid END;--> statement-breakpoint
ALTER TABLE "order_lines" ALTER COLUMN "modele_label" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_model_id_piece_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."piece_models"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" DROP COLUMN "modele";
