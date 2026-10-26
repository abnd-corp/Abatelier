# Branches et mises en production

Les règles communes à toute l'organisation sont dans la [charte Abnd](https://github.com/abnd-corp/gouvernance/blob/main/CHARTE.md). Les écarts d'Abatelier sont listés dans [docs/adr/0001-ecarts-a-la-charte.md](docs/adr/0001-ecarts-a-la-charte.md) : c'est ce fichier-ci qui prévaut pour les branches.

```
feature/xxx ──PR──▶ dev ──PR──▶ staging ──PR──▶ main
 (travail)        (intégration)  (recette)      (production)
```

## Les règles

| Branche cible | Seule source acceptée | Méthode de merge |
|---|---|---|
| `dev` | `feature/**` (et `dependabot/**`) | Squash : un commit propre par fonctionnalité |
| `staging` | `dev` | Merge commit |
| `main` | `staging` | Merge commit |

- **Personne ne pousse directement sur `dev`, `staging` ou `main`**, administrateurs compris. Tout passe par une Pull Request.
- Pas de force push et pas de suppression sur ces trois branches.
- Une PR ne peut être mergée que si **toute la CI est verte** :

| Contrôle | Ce qu'il vérifie |
|---|---|
| Linter et mise en forme | ESLint et Prettier (`make lint`, et `make format` pour tout remettre en forme) |
| API | Types, compilation, migrations à jour |
| Tests API | Toutes les routes, sur une vraie base Postgres |
| Front | Types et build |
| Tests front | Composants Vue |
| E2E (Chromium + Firefox) | Parcours complets sur une stack de production jetable, répartis sur 3 machines. Vers `dev`, seuls les groupes touchés par la PR tournent ; vers `staging` et `main`, tout tourne |
| Sauvegardes | Sauvegarde, vérification, puis restauration réelle après perte de données |
| Sécurité | Failles dans les dépendances, secrets dans l'historique Git |
| Branche source autorisée | Respect du chemin feature → dev → staging → main |

- Chaque élément terminé doit être couvert par des tests et passer la checklist de sécurité du modèle de PR (`.github/pull_request_template.md`).
- Le contrôle « Branche source autorisée » refuse toute PR qui saute une étape, par exemple `dev → main` ou `feature/x → staging`.
- Une promotion vers `staging` ou `main` est refusée si la branche cible contient un commit absent de la source. Cela signale qu'une correction a été faite en aval sans repasser par `dev`.

### Pourquoi « merge commit » et pas « squash » pour les promotions

Un squash de `dev` vers `staging` crée un nouveau commit qui n'existe pas dans `dev`. À la promotion suivante, Git ne reconnaît plus l'historique commun, ce qui provoque des conflits sur du code identique. Avec un merge commit, `staging` et `main` restent toujours des ancêtres de `dev`, et les promotions se font sans conflit.

## Au quotidien

```bash
make setup                      # une fois : hooks Git, .env, secrets, dépendances
make feature nom=commandes      # crée feature/commandes depuis dev à jour
# … commits …
make check                      # types et builds
make test-vite                  # pendant le dev : seulement les tests touchés par les fichiers modifiés
make e2e GROUPE=stock,auth      # seulement ces groupes (liste : make e2e-groupes)
make e2e PAGE=catalogue         # un seul parcours (ajouter ECRAN=firefox pour un seul écran)
make test-api test-web          # avant la PR : tous les tests d'API et de composants (« make dev-d » avant)
make e2e                        # avant la PR : tout Playwright, Chromium, Firefox, téléphone et tablette
make pr                         # pousse la branche et ouvre la PR vers dev
```

## La base de développement

```bash
make bdd-demo                   # remonte la base de dev en démonstration complète (équipe, clients, commandes, factures, boutique, stock)
make bdd-minimale               # remonte la base de dev avec le strict nécessaire : catalogue de départ + compte admin
make mdp COMPTE=admin           # mot de passe oublié : un mot de passe provisoire est affiché une fois
```

Les deux premières commandes **remplacent toute la base de dev** (une sauvegarde est faite avant : `make backups`, `make restore`). Elles refusent de tourner en production et ne touchent jamais à la base des tests. Comptes de démonstration : `demo-direction`, `demo-rh`, `demo-atelier` (mot de passe `Demo-Alu-Pliage-2026!`, public : ce sont des données inventées). Pour essayer sans risque : `BDD_NOM=abatelier_essai ./scripts/bdd.sh demo --oui`.

`make demo` et `make demo-boutique` existent toujours : le premier remplit une base **vide**, le second **ajoute** la boutique et le stock sans rien supprimer.

`e2e/apercu/` sert à `make apercu` : des captures de toutes les pages (téléphone, tablette, ordinateur, clair et sombre) sur une stack jetable remplie de données de démonstration, rangées dans `apercus/` (ignoré par Git).

Pour livrer :

```bash
make promote-staging            # PR dev → staging, puis tester sur le serveur de staging
make promote-main               # PR staging → main, mise en production
```

## Garde-fous locaux

Après `make setup`, les hooks de `.githooks/` font deux choses :
- ils refusent un commit sur `dev`, `staging` ou `main` ;
- ils refusent un push vers ces branches, ou vers une branche qui ne s'appelle pas `feature/…`.

Les mêmes règles sont appliquées par GitHub. Les hooks évitent seulement d'attendre le refus du serveur.

## Mises à jour des dépendances (Dependabot)

Chaque lundi matin, Dependabot ouvre des PR vers `dev` :
- une PR groupée par partie (api, web, e2e) pour les mises à jour mineures ;
- une PR par mise à jour majeure, à lire avec attention ;
- les images Docker et les GitHub Actions sont aussi suivies.

Les failles de sécurité déclenchent une PR immédiate, sans attendre le lundi. Ces PR passent par la même CI : si tout est vert, on peut les merger (squash) dans `dev`, puis elles suivent le chemin habituel jusqu'en production.

## Un élément terminé est testé et sécurisé

Une fonctionnalité n'est pas terminée tant qu'elle n'a pas :

1. **Des tests d'API** (`api/test/*.test.ts`, Vitest + `app.inject` sur la base `abatelier_test`). Ils couvrent le cas normal, les erreurs de validation, les droits par rôle (401 et 403) et l'écriture dans le journal.
2. **Des tests de composants** (`web/test/*.spec.ts`, Vitest + @vue/test-utils, fetch simulé avec `mockApi`) pour chaque vue ou composant ajouté.
3. **Un test Playwright** (`e2e/tests/*.spec.ts`) pour le parcours utilisateur, qui tourne sur Chromium **et** Firefox.
4. **Les contrôles de sécurité** :
   - chaque route exige `requireAuth` ou `requirePerm`. `api/test/security.test.ts` vérifie automatiquement qu'aucune route n'est publique par erreur et que la protection CSRF s'applique à toutes les routes qui modifient des données ;
   - les entrées sont validées par zod ;
   - les actions importantes passent par `audit()`, avec leur libellé dans `web/src/lib/audit-labels.ts` ;
   - aucune donnée sensible n'apparaît dans les réponses ;
   - toute nouvelle permission est déclarée dans `api/src/auth/permissions.ts`.

Avant de considérer un travail fini, lancer `make check`, `make test-api`, `make test-web` et `make e2e`. La CI rejoue tout cela, et une PR ne peut être mergée que si tout est vert.

## Données et comptes

- La base est sauvegardée chaque nuit par le container `backup` (`scripts/backup/backup.sh`).
- Toute nouvelle table doit être ajoutée à la liste vérifiée par `verify` dans ce script.
- Le compte `admin` (rôle Direction) sert uniquement à l'administration. L'usage quotidien passe par des comptes personnels.
- Une nouvelle fonctionnalité déclare sa permission dans `api/src/auth/permissions.ts` et l'attribue aux bons rôles (Direction, RH, Atelier), selon l'espace de la feuille de route.

## Conventions de code

- **API** : une route = un fichier par domaine dans `api/src/routes/`.
  - Erreurs au format `{ error: 'message en français' }`.
  - Pour un formulaire, ajouter `field` dans l'erreur.
- **Base** :
  - modifier `api/src/db/schema.ts`, puis lancer `npm run db:generate` ;
  - ne jamais modifier une migration déjà commitée.
- **Front** :
  - les couleurs passent par les variables CSS de `web/src/style.css`, en thème clair et sombre ;
  - les icônes viennent de `AppIcon.vue` ;
  - le logo est `BrandMark.vue` ;
  - le menu de gauche (façon GitLab) se configure dans `SECTIONS`, dans `web/src/components/AppLayout.vue`. Une nouvelle page y ajoute son lien, avec sa permission ; les sections pas encore développées ne sont pas affichées ;
  - chaque route déclare `meta.section` et `meta.title` pour le fil d'Ariane, plus `meta.parent` et `meta.menu` pour une sous-page ;
  - les appels à l'API passent par `api()` dans `web/src/api.ts`.

## Groupes de tests e2e

Chaque fichier de `e2e/tests/` appartient à un groupe dans `e2e/groupes.mjs`, avec les fichiers du code qu'il concerne. Un nouveau test doit être rangé dans un groupe (`make check` le vérifie). Un changement hors de tout groupe connu, ou transverse (base, authentification, mise en page, CI), rejoue toute la suite : dans le doute, on teste tout.
