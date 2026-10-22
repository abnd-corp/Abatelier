ALTER TABLE "clients" ADD COLUMN "pro_verifie" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- Les fiches de professionnels déjà créées par l'atelier sont reconnues comme professionnelles
UPDATE "clients" SET "pro_verifie" = true WHERE "type" = 'professionnel';
