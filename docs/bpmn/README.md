# Processus métier en BPMN

Les 35 processus d'Alu Pliage Service, dessinés en BPMN 2.0, pour vérifier avec le client que l'application répond à tout le besoin, et mesurer le gain qu'elle apporte.

- **À regarder** : les images `.png` (les plus simples à ouvrir dans VS Code) ou `.svg` (un navigateur suffit).
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

Le numéro est celui du fichier (`01-contact`, `02-espace-client`…) : ils se suivent par famille.

**Vente et clients** : demande de contact · espace client · configurateur · devis en ligne · commande payée en ligne · commande saisie par la direction · refus et remboursement

**Production** : fabrication · écran d'affichage de l'atelier · plan visuel de l'atelier · livraison et retrait

**Stock de feuilles** : créer une référence · faire vivre les références (facultatif) · commande au fournisseur · réception · suivi du stock

**Finance** : facturation · statistiques (ventes, audience, finances, atelier, stock, comparateur, alertes, historique)

**Organisation** : équipe · paramétrage · machines de l'atelier · site vitrine · messages aux clients · notifications de la direction

**Mise en service et exploitation** : mise en service · disponibilité du serveur · sauvegardes et test de restauration · mises à jour

## Les modifier

Les fichiers sont **générés** : on modifie `scripts/bpmn/processus.mjs` (les étapes, les flèches et la couverture), puis :

```sh
node scripts/bpmn/generer.mjs   # écrit les .bpmn, couverture.md et processus.csv
node scripts/bpmn/rendre.mjs    # redessine les .svg et les .png (internet requis, Playwright installé par « make setup »)
```

Quand une fonctionnalité sort, on passe son étape de « manque » à « ok » dans `processus.mjs` et on régénère : le bilan reste vrai. Ces schémas ne contiennent aucune donnée de l'entreprise (le dépôt est public).
