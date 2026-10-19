# Feuille de route

## Principe : des espaces cloisonnés

L'application est découpée en espaces. Chaque personne ne voit que les espaces auxquels son rôle donne accès : le menu de gauche n'affiche que ceux-là, et l'API refuse le reste (permissions).

| Espace | Pour qui | Contenu |
|---|---|---|
| **Atelier** | Équipe de production | Commandes à fabriquer, planning, **gestion de stock** (tôles, coloris, accessoires) |
| **Direction** | Direction | Tarifs, devis, **facturation**, vitrine, clients, trésorerie, comptes |
| **RH** | Bureau | Salariés, journal d'activité, clients en lecture seule |
| **Espace client** (site public) | Clients | Configurateur de pliage, devis, commandes, suivi |

Le stock reste dans l'Atelier. La facturation, les devis et la RH ne sont pas visibles depuis l'Atelier, et la RH ne voit ni les devis, ni les factures, ni la trésorerie.

### Utilisateurs et rôles (octobre 2026)

| Qui | Accès |
|---|---|
| **Visiteur anonyme** | Site vitrine, configurateur avec prix en direct |
| **Client** (compte client) | En plus : commander, suivre et gérer ses commandes, fidélité |
| **Atelier** | Production, stock |
| **RH** (au bureau) | Salariés, journal d'activité, clients en lecture seule |
| **Direction** | Tout : catalogue et tarifs, modèles de devis et de factures, vitrine (textes et photos), clients, trésorerie, comptes, RH |

On développe un rôle jusqu'au bout avant de passer au suivant, en commençant par la Direction.

### Espace Direction, dans l'ordre

1. **Tarifs et catalogue** : ✅ matières, coloris, façonnage et conditions. Restent : accessoires et livraison. C'est la base des devis, de la vitrine et du configurateur.
2. **Modèles de devis et de factures** : logo, en-tête, mentions légales, conditions, pied de page, aperçu PDF.
3. **Site vitrine** intégré à l'application, à la place du WordPress : pages publiques dont la direction édite les textes et les photos.
4. **Clients** : fiches, historique, fidélité.
5. **Trésorerie** : encaissements (payé, en attente, en retard), dépenses, tableau de bord chiffré (chiffre d'affaires, marge, prévisionnel).

### Stock (retenu)

- **Articles** : tôles par matière, épaisseur et coloris (en nombre de tôles ou en m²), et accessoires (bouchons, éclisses, angles…).
- **Mouvements tracés** : réception, consommation, correction d'inventaire, avec qui, quand et pourquoi.
- **Alertes** : seuil minimum par article, et alerte sur le tableau de bord en dessous du seuil.
- Plus tard, avec les commandes : sortie de stock automatique au passage en fabrication.

## Espace client : configurateur libre, commande sur compte

- **Le configurateur est accessible à tous, sans compte** : couvertines, bavettes, bandeaux, profil libre, avec le prix en direct.
- **Pour commander, il faut un compte client.** Le panier configuré sans compte est conservé pendant la création du compte.
- Le compte client permet :
  - le suivi des commandes et l'historique ;
  - « recommander à l'identique » ;
  - la **fidélité** (remises selon l'historique d'achat, compte pro).
- Les comptes clients sont séparés des comptes de l'équipe : autre espace, autres règles, aucun accès à l'atelier ni au bureau.

## Étapes

1. ✅ Base technique : connexion sécurisée, comptes, journal, sauvegardes, tests, CI, branches protégées.
2. ✅ Équipe : salariés, fiches, comptes, désactivation à la date de sortie, menu latéral, responsive.
3. ⏳ Rôles Direction, RH et Atelier, avec un menu cloisonné par espace.
4. Atelier : gestion de stock (articles, mouvements tracés, alertes de stock bas).
5. Direction : tarifs et catalogue, modèles de devis et de factures, vitrine, clients, trésorerie.
6. Atelier : commandes à fabriquer, planning, fiche de fabrication.
7. Direction : facturation et trésorerie.
8. Espace client : configurateur public, comptes clients, commande en ligne, suivi, fidélité.
9. Mise en production sur le Raspberry Pi 5.
