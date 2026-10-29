# Processus métier en BPMN

Les 33 processus d'Alu Pliage Service, dessinés en BPMN 2.0, pour vérifier avec le client que l'application répond à tout le besoin, et mesurer le gain qu'elle apporte.

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

Les numéros sont ceux des fichiers (`01-contact`, `02-espace-client`…).

**Vente et clients** : 01 Demande de contact · 02 Espace client · 03 Configurateur · 04 Devis en ligne · 05 Commande payée en ligne · 06 Commande saisie par la direction · 07 Refus et remboursement

**Production** : 08 Fabrication · 09 Livraison et retrait

**Stock de feuilles** : 10 Créer une référence · 11 Faire vivre les références (facultatif) · 12 Commande au fournisseur · 13 Réception · 14 Suivi du stock

**Finance** : 15 Facturation · 16 à 23 Statistiques (ventes, audience, finances, atelier, stock, comparateur, alertes, historique)

**Organisation** : 24 Équipe · 25 Paramétrage · 26 Machines de l'atelier · 27 Site vitrine · 28 Messages aux clients · 29 Notifications de la direction

**Mise en service et exploitation** : 30 Mise en service · 31 Disponibilité du serveur · 32 Sauvegardes et test de restauration · 33 Mises à jour

## Les modifier

Les fichiers sont **générés** : on modifie `scripts/bpmn/processus.mjs` (les étapes, les flèches et la couverture), puis :

```sh
node scripts/bpmn/generer.mjs   # écrit les .bpmn, couverture.md et processus.csv
node scripts/bpmn/rendre.mjs    # redessine les .svg et les .png (internet requis, Playwright installé par « make setup »)
```

Quand une fonctionnalité sort, on passe son étape de « manque » à « ok » dans `processus.mjs` et on régénère : le bilan reste vrai. Ces schémas ne contiennent aucune donnée de l'entreprise (le dépôt est public).
