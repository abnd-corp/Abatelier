# Feuille de route

## Principe : des espaces cloisonnés

L'application est découpée en espaces. Chaque personne ne voit que les espaces auxquels son rôle donne accès : le menu de gauche n'affiche que ceux-là, et l'API refuse le reste (permissions).

| Espace | Pour qui | Contenu |
|---|---|---|
| **Atelier** | Équipe de production | Commandes à fabriquer, planning, **gestion de stock** (tôles, coloris, accessoires) |
| **Bureau** | Commercial, secrétariat | Devis, commandes clients, **facturation**, clients et fidélité |
| **RH et administration** | Direction | Salariés, comptes de connexion, journal d'activité |
| **Espace client** (site public) | Clients | Configurateur de pliage, devis, commandes, suivi |

Le stock reste dans l'Atelier. La facturation, les devis et la RH ne sont pas visibles depuis l'Atelier.

### Rôles retenus (octobre 2026)

| Rôle | Atelier | Bureau | RH et administration |
|---|---|---|---|
| **Atelier** | ✅ | ❌ | ❌ |
| **Bureau** | Stock en lecture seule (pour les devis) | ✅ | ❌ |
| **Direction** (aujourd'hui « Administrateur ») | ✅ | ✅ | ✅ |

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
3. ⏳ Rôles Atelier, Bureau et Direction, avec un menu cloisonné par espace.
4. Atelier : gestion de stock (articles, mouvements tracés, alertes de stock bas).
5. Bureau : clients, tarifs, devis, commandes.
6. Atelier : commandes à fabriquer, planning, fiche de fabrication.
7. Bureau : facturation.
8. Espace client : configurateur public, comptes clients, commande en ligne, suivi, fidélité.
9. Mise en production sur le Raspberry Pi 5.
