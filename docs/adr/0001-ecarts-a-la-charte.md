# ADR 0001 · Abatelier et la charte Abnd

Date : 23 octobre 2026 · Statut : accepté

## Contexte

La [charte Abnd](https://github.com/abnd-corp/gouvernance/blob/main/CHARTE.md) s'applique à tous les projets de l'organisation. Abatelier existait avant elle, avec un chemin de livraison plus strict (`feature → dev → staging → main`, voir `CONTRIBUTING.md`). La charte est évolutive : on rattache le projet maintenant et on corrige les écarts ensuite.

## Ce qui est appliqué

- Contrôle de PR partagé (R5, R16) sur les PR vers `dev`, via `.github/workflows/gouvernance.yml`.
- Pas de push direct sur les branches protégées (R2), CI verte et review avant merge (R4), aucun secret dans le code (R9).
- `AGENTS.md` renvoie vers `CLAUDE.md`, `CONTRIBUTING.md` et la charte (R17).

## Écarts assumés

| Règle | Écart | Raison |
|---|---|---|
| R4, R10 : merge en squash, `main` reçoit des commits signés par GitHub | Les promotions `dev → staging → main` se font en merge commit | Un squash crée un commit absent de la branche source et provoque des conflits à la promotion suivante (voir `CONTRIBUTING.md`) |
| R5 : titres de PR en Conventional Commits | Exigé seulement sur les PR vers `dev`, pas sur les promotions | Les promotions portent un titre libre ; le merge commit n'alimente pas de changelog |
| R3 : une PR = une issue | Pas encore systématique | Les chantiers sont suivis en issues depuis le 22 octobre 2026 ; à généraliser |
| R22 : CI partagée | Seul le contrôle de PR est partagé | La CI d'Abatelier (API, front, e2e, sauvegardes) lui est propre |
| R23 : release-please, R24 : Renovate | Pas en place | Dependabot ouvre les mises à jour, chaque lundi |
| R6 : kanban d'orga | Pas en place | Chantiers suivis en issues et jalons du dépôt |

## Suite

Chaque écart se corrige par une PR, quand la charte ou le projet change. Si une règle de la charte ne convient plus, on la change dans le dépôt `gouvernance` (issue, puis PR).
