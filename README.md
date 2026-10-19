# Patalu : espace atelier

| Dossier | Contenu |
|---|---|
| `api/` | API Fastify + Drizzle (TypeScript) |
| `web/` | Front Vue 3 + Vite (TypeScript) |
| `compose.yaml` | Base commune (Postgres 17, API, front), durcie |
| `compose.override.yaml` | Ajouts pour le dev, chargés automatiquement |
| `compose.prod.yaml` | Ajouts pour la prod et le staging : Caddy et HTTPS |
| `compose.e2e.yaml` | Stack de production jetable pour les tests Playwright |
| `e2e/` | Tests Playwright (Chromium + Firefox) |
| `entreprise/` | Infos privées sur l'entreprise. **Jamais commité.** |

## Démarrer

```bash
make setup     # hooks Git, .env, secrets/ et dépendances
make dev       # http://localhost:5173 : l'API et le front se rechargent à chaque modification
```

Le premier compte s'appelle `ADMIN_IDENTIFIANT` (par défaut `atelier`). Son mot de passe est dans `secrets/admin_password.txt`. Le compte est créé au premier démarrage, si la base est vide.

`make help` liste toutes les commandes. En dev, l'API et le front se rechargent tout seuls à chaque modification. Il faut relancer `make dev` seulement après l'ajout d'un paquet npm, ou après une modification d'un Dockerfile ou d'un compose.

## Tests

```bash
make test-api   # 76 tests des routes API, sur la base patalu_test (la base de dev doit tourner)
make test-web   # 46 tests des composants Vue
make e2e        # 16 parcours Playwright × 2 navigateurs, sur une stack de production jetable
```

Chaque élément du site doit être couvert par des tests et des contrôles de sécurité avant d'être mergé. Le fonctionnement des branches est décrit dans [CONTRIBUTING.md](CONTRIBUTING.md).

## Production et staging

Sur le serveur :
1. Copier le dépôt, puis lancer `make setup`.
2. Dans `.env`, mettre `DOMAIN` à un nom de domaine qui pointe vers le serveur.
3. Lancer `make prod`.

Caddy obtient le certificat HTTPS tout seul, et le cookie de session passe en `Secure` (`__Host-`). Le staging se déploie de la même façon, sur une autre machine ou un autre domaine.

## Modifier la base

1. Modifier `api/src/db/schema.ts`.
2. Lancer `cd api && npm run db:generate`, puis commiter le fichier SQL créé dans `api/drizzle/`.
3. L'API applique la migration à son démarrage. La CI refuse une PR dont le schéma a changé sans migration.

## Sécurité en place

**Connexion**
- Mots de passe hachés avec Argon2id.
- Blocage de 15 minutes au 5e échec sur un même identifiant.
- Délai progressif après chaque échec : 1, 2, 4 puis 8 secondes.
- Limite de 10 essais par minute et par adresse IP.

**Sessions**
- Cookie HttpOnly et SameSite. La base ne garde que le SHA-256 du jeton.
- Déconnexion après 12 h d'inactivité, ou après 30 jours avec « Rester connecté ».
- Page « Mon compte » : changement de mot de passe et liste des appareils connectés.
- Changer son mot de passe déconnecte les autres appareils.
- Protection CSRF : l'API vérifie l'en-tête Origin.

**Comptes**
- Rôles admin et atelier, avec des permissions par rôle (`api/src/auth/permissions.ts`).
- Mot de passe temporaire à la création, à changer à la première connexion.
- Désactivation d'un compte au départ d'un employé : la personne est déconnectée partout et son historique est conservé.
- Impossible de désactiver ou de rétrograder le dernier admin.

**Journal**
- Connexions, échecs et actions sur les comptes, avec auteur, IP et appareil.
- Conservé 12 mois.

**Serveur**
- En-têtes CSP, HSTS, X-Frame-Options et nosniff.
- Polices hébergées par le site lui-même.
- Containers en lecture seule, sans privilèges, avec l'API et nginx qui tournent sans root.
- Base sur un réseau interne sans accès à Internet.
- Mots de passe dans `secrets/` (secrets Docker), jamais dans `.env`.
