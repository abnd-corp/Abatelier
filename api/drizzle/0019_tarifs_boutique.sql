-- Tarifs calés sur la grille de la boutique actuelle (relevé du 20 octobre 2026).
-- Leurs prix sont lus comme TTC (CGV) : les nôtres sont HT, donc divisés par 1,2. À confirmer avec la direction (question A1b).
-- Prix au m² de développé : couvertines, bavettes et bandeaux donnent 40 à 47 € (1 mm) et 50 à 63 € (1,5 mm) ; on retient la moyenne.
UPDATE "materials" SET "prix_m2" = 41.00, "updated_at" = now() WHERE "nom" = 'Aluminium' AND "epaisseur" = 1.00;
--> statement-breakpoint
UPDATE "materials" SET "prix_m2" = 54.00, "updated_at" = now() WHERE "nom" = 'Aluminium' AND "epaisseur" = 1.50;
--> statement-breakpoint
-- 2 mm : pas vendu dans leur boutique, on prolonge la progression de leurs prix
UPDATE "materials" SET "prix_m2" = 68.00, "updated_at" = now() WHERE "nom" = 'Aluminium' AND "epaisseur" = 2.00;
--> statement-breakpoint
-- 0,8 mm : vendu pour les bandeaux
INSERT INTO "materials" ("nom", "epaisseur", "prix_m2", "retour_min", "position")
VALUES ('Aluminium', 0.80, 35.00, 10, 0)
ON CONFLICT ("nom", "epaisseur") DO NOTHING;
--> statement-breakpoint
-- Coloris : pas de majoration pour le noir sablé (couvertines, bavettes, bandeaux), +15 % pour le chêne doré (68,50 € contre 59,50 €)
UPDATE "colors" SET "majoration" = 0, "updated_at" = now() WHERE "reference" = '2100 Sablé';
--> statement-breakpoint
UPDATE "colors" SET "majoration" = 15, "updated_at" = now() WHERE "reference" = 'Aspect bois';
--> statement-breakpoint
INSERT INTO "colors" ("nom", "reference", "hex", "majoration", "delai_sup", "position")
VALUES ('Sable ivoire', 'RAL 1015', '#e6d2b5', 0, 0, 7)
ON CONFLICT ("reference") DO NOTHING;
--> statement-breakpoint
-- Pas de mise en route ni de minimum de commande dans leur boutique : un bandeau à 13,50 € s'y achète seul
UPDATE "pricing_settings" SET "mise_en_route" = 0, "minimum_commande" = 0, "updated_at" = now() WHERE "id" = 1;
--> statement-breakpoint
-- Accessoires : mêmes prix que leur boutique (HT = TTC / 1,2). Les leurs varient avec la taille, on retient celui de la taille courante.
UPDATE "accessories" SET "prix" = 5.00, "updated_at" = now() WHERE "nom" = 'Bouchon de couvertine';
--> statement-breakpoint
UPDATE "accessories" SET "prix" = 3.75, "updated_at" = now() WHERE "nom" = 'Éclisse de jonction';
--> statement-breakpoint
UPDATE "accessories" SET "prix" = 4.17, "updated_at" = now() WHERE "nom" = 'Angle de bandeau';
--> statement-breakpoint
INSERT INTO "accessories" ("nom", "prix", "unite", "modeles", "quantite_auto", "quantite_fixe", "position")
SELECT v.nom, v.prix, 'piece', ARRAY[m.id], 'aucune', 0, v.position
FROM (VALUES
  ('Angle 90° de couvertine', 38.75, 5),
  ('Support de fixation de couvertine', 6.25, 6),
  ('Chapeau de pilier (300 × 300 mm)', 28.33, 7)
) AS v(nom, prix, position)
CROSS JOIN (SELECT id FROM "piece_models" WHERE "nom" = 'Couvertine') AS m
ON CONFLICT ("nom") DO NOTHING;
