# Processus métier en BPMN

Les 20 processus d'Alu Pliage Service, dessinés en BPMN 2.0, pour vérifier avec le client que l'application répond à tout le besoin, et mesurer le gain qu'elle apporte.

- **À regarder** : les images `.svg` (un navigateur suffit).
- **À modifier ou à présenter** : les fichiers `.bpmn`, ouverts avec [bpmn.io](https://demo.bpmn.io) (glisser le fichier dans la page) ou avec l'extension « BPMN Editor » de VS Code.
- **Le bilan** : [couverture.md](couverture.md), avec chaque étape, qui la fait, et si l'application la couvre.
- **Le tableur du gain** : [processus.csv](processus.csv), une ligne par processus, à remplir avec le client (voir [le questionnaire](../processus-a-valider-avec-le-client.md)).

## Comment lire un schéma

Chaque ligne horizontale (« voie ») est une personne ou l'application : Visiteur / Client, Direction, Atelier, Application (automatique), Prestataire de paiement, Maintenance (nous). Les formes :

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

**Vente et clients** : 1 Demande de contact · 2 Espace client · 3 Configurateur · 4 Devis en ligne · 5 Commande payée en ligne · 6 Commande saisie par la direction · 7 Refus et remboursement

**Production** : 8 Fabrication · 9 Livraison et retrait

**Stock de feuilles** : 10 Références et codes-barres · 11 Réception · 12 Suivi du stock

**Finance** : 13 Facturation et encaissement · 14 Statistiques

**Organisation** : 15 Équipe · 16 Paramétrage · 17 Site vitrine · 18 Messages

**Mise en service et exploitation** : 19 Mise en service · 20 Sauvegarde et exploitation

## Les modifier

Les fichiers sont **générés** : on modifie `scripts/bpmn/processus.mjs` (les étapes, les flèches et la couverture), puis :

```sh
node scripts/bpmn/generer.mjs   # écrit les .bpmn, couverture.md et processus.csv
node scripts/bpmn/rendre.mjs    # redessine les .svg (internet requis, Playwright installé par « make setup »)
```

Quand une fonctionnalité sort, on passe son étape de « manque » à « ok » dans `processus.mjs` et on régénère : le bilan reste vrai. Ces schémas ne contiennent aucune donnée de l'entreprise (le dépôt est public).
