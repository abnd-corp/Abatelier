# Branches et mises en production

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
| API | Types, compilation, migrations à jour |
| Tests API | Toutes les routes, sur une vraie base Postgres |
| Front | Types et build |
| Tests front | Composants Vue |
| E2E (Chromium + Firefox) | Parcours complets sur une stack de production jetable |
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
make test-api test-web          # tests rapides (lancer « make dev-d » avant, pour la base)
make e2e                        # Playwright, Chromium + Firefox
make pr                         # pousse la branche et ouvre la PR vers dev
```

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
