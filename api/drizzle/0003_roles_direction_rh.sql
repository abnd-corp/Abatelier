-- Rôles : « admin » devient « direction » ; nouveau rôle « rh » (aucune donnée à convertir)
UPDATE "users" SET "role" = 'direction' WHERE "role" = 'admin';
