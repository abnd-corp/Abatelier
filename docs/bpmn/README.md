# Processus métier en BPMN

Les 12 processus d'Alu Pliage Service, dessinés en BPMN 2.0, pour vérifier avec le client que l'application répond à tout le besoin.

- **À regarder** : les images `.svg` (un navigateur suffit).
- **À modifier ou à présenter** : les fichiers `.bpmn`, ouverts avec [bpmn.io](https://demo.bpmn.io) (glisser le fichier dans la page) ou avec l'extension « BPMN Editor » de VS Code.
- **Le bilan** : [couverture.md](couverture.md), avec chaque étape, qui la fait, et si l'application la couvre.

## Comment lire un schéma

Chaque ligne horizontale (« voie ») est une personne ou l'application : Visiteur / Client, Direction, Atelier, Application (automatique). Les formes :

| Forme | Sens |
|---|---|
| Cercle fin | Début du processus |
| Cercle épais | Fin |
| Losange | Décision (Oui / Non) |
| Rectangle avec une silhouette | Une personne travaille sur l'écran |
| Rectangle avec des engrenages | L'application le fait toute seule |
| Rectangle avec une main | Geste manuel, hors écran (téléphone, machine, banque…) |

La couleur dit si l'application couvre l'étape :

| Couleur | Sens |
|---|---|
| Vert | Dans l'application |
| Orange | En partie |
| Rouge | Pas encore : à développer |
| Gris | Hors application, par nature (le travail sur la machine, un chèque…) |

Le détail de chaque étape (écran concerné, limite) est dans [couverture.md](couverture.md), et aussi dans la documentation de l'étape à l'intérieur du fichier `.bpmn`.

## Les processus

1. Demande de contact
2. Espace client : inscription, accès, fermeture
3. Devis en ligne avec le configurateur
4. Commande sur mesure saisie par la direction
5. Fabrication à l'atelier
6. Livraison et retrait
7. Facturation et encaissement
8. Boutique en ligne
9. Stock de feuilles
10. Équipe : arrivée et départ d'un salarié
11. Paramétrage par la direction
12. Sauvegarde et exploitation

## Les modifier

Les fichiers sont **générés** : on modifie `scripts/bpmn/processus.mjs` (les étapes, les flèches et la couverture), puis :

```sh
node scripts/bpmn/generer.mjs   # écrit les .bpmn et couverture.md
node scripts/bpmn/rendre.mjs    # redessine les .svg (internet requis, Playwright installé par « make setup »)
```

Quand une fonctionnalité sort, on passe son étape de « manque » à « ok » dans `processus.mjs` et on régénère : le bilan reste vrai. Ces schémas ne contiennent aucune donnée de l'entreprise (le dépôt est public).
