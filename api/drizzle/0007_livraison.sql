CREATE TABLE "delivery_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"retrait_actif" boolean DEFAULT true NOT NULL,
	"retrait_info" text DEFAULT '' NOT NULL,
	"atelier_adresse" text NOT NULL,
	"atelier_label" text,
	"atelier_lat" numeric(9, 6),
	"atelier_lon" numeric(9, 6),
	"zones" jsonb NOT NULL,
	"longueur_seuil" integer,
	"longueur_prix" numeric(8, 2) DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_settings_single_row" CHECK ("delivery_settings"."id" = 1)
);
--> statement-breakpoint
-- Réglages de départ (valeurs de la maquette). L'atelier sera localisé à la première estimation.
INSERT INTO "delivery_settings" ("id", "retrait_actif", "retrait_info", "atelier_adresse", "zones")
VALUES (1, true, 'Du lundi au jeudi de 7h30 à 12h et de 13h30 à 16h, le vendredi de 7h30 à 12h.', '42490 Fraisses', '[{"distanceMax":30,"prix":39,"franco":null},{"distanceMax":80,"prix":69,"franco":null}]');
