CREATE TABLE "pricing_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"prix_pli_ml" numeric(8, 2) NOT NULL,
	"mise_en_route" numeric(8, 2) NOT NULL,
	"minimum_commande" numeric(10, 2) NOT NULL,
	"remise_pro" numeric(5, 2) NOT NULL,
	"tva" numeric(5, 2) NOT NULL,
	"delai_standard" integer NOT NULL,
	"remises_quantite" jsonb NOT NULL,
	"largeur_tole" integer NOT NULL,
	"longueur_min" integer NOT NULL,
	"longueur_max" integer NOT NULL,
	"plis_max" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pricing_settings_single_row" CHECK ("pricing_settings"."id" = 1)
);
--> statement-breakpoint
-- Réglages de départ (valeurs de la maquette)
INSERT INTO "pricing_settings" ("id", "prix_pli_ml", "mise_en_route", "minimum_commande", "remise_pro", "tva", "delai_standard", "remises_quantite", "largeur_tole", "longueur_min", "longueur_max", "plis_max")
VALUES (1, 0.90, 18.00, 45.00, 10, 20, 5, '[{"seuil":20,"remise":5},{"seuil":50,"remise":10}]', 1250, 200, 3000, 8);
