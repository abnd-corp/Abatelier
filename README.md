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

Le premier compte, administrateur, s'appelle `ADMIN_IDENTIFIANT` (par défaut `admin`). Son mot de passe est dans `secrets/admin_password.txt`. Le compte est créé au premier démarrage, si la base est vide.

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

## Sauvegardes

Le container `backup` sauvegarde la base **chaque nuit à 2h30** (heure de Paris), en dev comme en prod :
- chaque fichier est vérifié et accompagné d'une empreinte SHA-256 ;
- on garde les 14 dernières quotidiennes et les 8 dernières hebdomadaires (celles du dimanche) ;
- au démarrage, si la dernière sauvegarde a plus de 24 h, une sauvegarde est faite tout de suite.

```bash
make backup                                  # sauvegarde immédiate
make backups                                 # liste
make backup-verify                           # restaure la dernière dans une base temporaire et compare
make restore fichier=patalu-…-manuel.dump    # vérifie le fichier, sauvegarde l'état actuel, puis restaure
make backup-export                           # copie tout dans ./backups
```

⚠️ **Les sauvegardes sont sur la même machine que la base.** Si le serveur est perdu, elles le sont aussi. En production, il faut copier régulièrement `./backups` ailleurs : un autre disque, un NAS ou un stockage en ligne.

La CI vérifie à chaque PR qu'une sauvegarde se restaure vraiment après une perte de données, et qu'un fichier abîmé est refusé.

## Comptes

| Compte | Rôle | Usage |
|---|---|---|
| `admin` | Administrateur | Uniquement pour gérer les comptes et lire le journal. Créé au premier démarrage. |
| Un compte par personne | Atelier | Usage quotidien. Chaque action est tracée au nom de la personne. |
| `atelier` (facultatif) | Atelier | Compte commun, par exemple pour le poste de l'atelier. |

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
