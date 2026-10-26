ALTER TABLE "users" ADD COLUMN "sections" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Reprise des comptes : direction = les trois sections + administration ; rh = administration seule (elle n'a pas les droits d'écriture des Ventes) ; atelier = section Atelier
UPDATE "users" SET "sections" = ARRAY['ventes','atelier','direction'], "admin" = true WHERE "role" = 'direction';--> statement-breakpoint
UPDATE "users" SET "sections" = '{}', "admin" = true WHERE "role" = 'rh';--> statement-breakpoint
UPDATE "users" SET "sections" = ARRAY['atelier'] WHERE "role" = 'atelier';
