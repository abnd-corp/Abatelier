# Processus à valider avec le client

> Document de travail : à lire avec le client, processus par processus. Les réponses remplissent le tableur [bpmn/processus.csv](bpmn/processus.csv), qui calcule le coût actuel de chaque tâche et le gain apporté par l'application, donc de quoi chiffrer.

Les schémas sont dans [bpmn/](bpmn/) (BPMN 2.0, fichiers `.bpmn` et images `.svg`). Le bilan étape par étape est dans [bpmn/couverture.md](bpmn/couverture.md).

## Comment s'en servir

1. Montrer à chaque fois l'image du processus et demander : « C'est bien comme ça que ça se passe chez vous ? » Corriger le schéma si besoin.
2. Poser les **questions communes** ci-dessous, pour chaque processus.
3. Remplir la ligne du tableur : qui, outil, minutes par fois, fois par semaine, coût horaire, problèmes constatés.
4. Le tableur calcule les heures par semaine, le coût par an, et le gain par an (coût × part prise en charge par l'application). La colonne « part prise en charge » est calculée à partir des étapes du schéma, **elle est à ajuster avec le client** : une étape automatisée ne fait pas gagner tout le temps de la tâche.
5. Le prix de l'application se compare au gain annuel (plus les coûts évités : erreurs, relances, retards).

## Questions communes (à chaque processus)

- Qui s'en occupe aujourd'hui, et avec quel outil (papier, tableur, téléphone, logiciel de facturation, autre) ?
- Combien de temps cela prend-il **à chaque fois**, et **combien de fois par semaine** ?
- Quelles erreurs, oublis ou retards arrivent ? À quelle fréquence, et que coûtent-ils ?
- Qu'est-ce qui vous agace le plus dans cette tâche ?
- Quelle est la saisie faite en double (recopier d'un outil à l'autre) ?
- Y a-t-il des étapes que nous n'avons pas dessinées ?

## Qui fait quoi chez eux (à clarifier en premier)

L'organigramme n'est pas connu, et il est sans doute flou. Il décide des comptes et des droits, donc de plusieurs choix de l'application.

- Combien de personnes dirigent, et se partagent-elles les mêmes informations ?
- Chacune aura-t-elle son compte, ou plusieurs partageront-elles le même ? (Un compte par personne garde la trace de qui a fait quoi : annulation, avoir, remboursement.)
- Qui reçoit quelles notifications (commandes, demandes de contact, devis, stock bas) ? Tous les mêmes, ou selon le rôle ?
- Une notification lue par l'un est-elle lue pour l'autre ?
- À partir de combien de notifications non lues faut-il un e-mail d'alerte ?
- Qui est à l'atelier, qui fait l'administratif, qui fait la comptabilité ? Qui remplace qui en cas d'absence ?
- Qui décide de l'exception : annuler une commande, rembourser, refuser, valider un statut professionnel qu'aucun annuaire ne confirme ?

## Questions précises, processus par processus

- **Livraison** : ce sont des salariés qui livrent avec le camion de l'entreprise : combien de personnes, de camions, de tournées par semaine ? Comment groupez-vous les pièces ? Accepteriez-vous une étiquette code-barres collée sur chaque colis, scannée à la remise, avec la signature du client sur l'écran du salarié ? Que faites-vous quand le client est absent ? Comment livrez-vous aujourd'hui (un camion, plusieurs, tournées) ? Comment savez-vous que le client a bien reçu : signature, bon de livraison, appel ? Accepteriez-vous un code que le client donne au livreur (envoyé par e-mail et visible dans son espace), ou une signature sur écran ?
- **Code-barres des clients et des commandes** (idée à valider) : retrouver une fiche en scannant le code d'un devis ou d'une facture vous ferait-il gagner du temps ? Qui chercherait un client de cette façon (direction, vente, atelier) et sur quel appareil ? Sur quels documents voulez-vous le code ? Pour les pièces : un code par commande (avec « pièce 3 sur 6 » écrit à côté) ou un code par pièce ? Étiquettes sur une imprimante d'étiquettes ou sur feuille adhésive A4 ? Les pièces sont-elles aujourd'hui mélangées entre commandes, ou rangées par commande ?
- **Taille des chutes** : en dessous de quelle taille jetez-vous une chute ? La taille dépend-elle de la matière, de l'épaisseur ou du coloris ? Gardez-vous aujourd'hui des chutes, et où les rangez-vous ? Combien de temps une chute reste-t-elle au stock avant d'être utilisée ou jetée ?
- **Paiement** : une commande peut-elle partir sans paiement préalable (client professionnel, virement, chèque, paiement à la livraison) ? Si oui, comment est-elle réglée, et qui le constate ? La plateforme ne demande pas à la direction de saisir les paiements : par quoi les remplacer (lecture du relevé bancaire, par exemple) ?
- **Commande de feuilles** : qui commande, à quel fournisseur, comment (téléphone, e-mail, site) ? Les feuilles arrivent-elles en plusieurs camions ? Combien de références par commande ?
- **Réception** : qui réceptionne, et sur quel appareil (téléphone, tablette) ? Que fait-on quand le camion apporte moins ou plus que commandé ?
- **Machines** : combien de machines, de quels types ? Longueur maximale, épaisseur maximale par matière, cadence, pannes fréquentes ? Qui peut les modifier ?
- **Serveur** : le client a-t-il un NAS (modèle, accès) pour la copie des sauvegardes ? Quel réseau (wifi, câble), quelle coupure de courant ou d'internet est acceptable ? Quelle disponibilité attend-il vraiment ?
- **Statistiques** : quelles questions voulez-vous poser à vos chiffres ? Quelles données anciennes existent (logiciel de facturation, tableurs) ? Quelles catégories de dépenses voulez-vous suivre ?

## Chiffres à demander une fois pour toutes

- Coût horaire chargé de la direction, de l'atelier, de l'administratif.
- Chiffre d'affaires annuel et nombre de commandes par an (particuliers, professionnels).
- Part des commandes qui partent en erreur, en litige ou en retard.
- Dépenses actuelles d'outils (facturation, site, messagerie) que l'application remplacerait.
- Ce qui compte pour eux : gagner du temps, vendre plus (site, configurateur, paiement en ligne), ou éviter les erreurs de fabrication.


## Vente et clients

### 1. Demande de contact

Dernier recours : le visiteur ne passe par la direction que si le configurateur, le devis et la commande en ligne ne suffisent pas (pièce hors limites, question, cas particulier). Le reste se fait seul.

Schéma : [01-contact.svg](bpmn/01-contact.svg) · 10 étapes : 4 dans l'application, 1 en partie, 4 pas encore, 1 hors application.

À développer ou à compléter :

- Proposer d’abord les services en ligne et les réponses aux questions fréquentes (pas encore)
- Enregistrer la demande et notifier la direction dans la plateforme (en partie)
- Envoyer un accusé de réception au visiteur, avec les liens utiles (pas encore)
- Retrouver ou créer la fiche client depuis la demande (pas encore)
- Supprimer la demande au bout de 12 mois (pas encore)

À demander au client :

- Ce processus existe-t-il chez vous ? Est-il décrit correctement ?
- Qui, avec quel outil, combien de minutes, combien de fois par semaine ?
- Quels problèmes (erreurs, retards, oublis) ?
- Gain attendu de l'application : temps, erreurs évitées, ventes en plus ?

### 2. Espace client : création, activation, mot de passe, fermeture

Création de l’espace d’un particulier ou d’un professionnel, activation sur une fiche existante, mot de passe oublié, vérification automatique du statut pro auprès de l’annuaire officiel, fermeture.

Schéma : [02-espace-client.svg](bpmn/02-espace-client.svg) · 15 étapes : 14 dans l'application, 0 en partie, 1 pas encore, 0 hors application.

À développer ou à compléter :

- Vérifier le SIRET dans l’annuaire officiel des entreprises (en activité, nom concordant) (pas encore)

À demander au client :

- Ce processus existe-t-il chez vous ? Est-il décrit correctement ?
- Qui, avec quel outil, combien de minutes, combien de fois par semaine ?
- Quels problèmes (erreurs, retards, oublis) ?
- Gain attendu de l'application : temps, erreurs évitées, ventes en plus ?

### 3. Configurateur : faisabilité contrôlée, prix et date estimée

Le client dessine sa pièce. L’application vérifie tout, l’aide à corriger, calcule le prix et une date estimée ; au-delà de ses limites, il passe par une demande de contact.

Schéma : [03-configurateur.svg](bpmn/03-configurateur.svg) · 7 étapes : 5 dans l'application, 1 en partie, 1 pas encore, 0 hors application.

À développer ou à compléter :

- Vérifier la quantité et la charge de l’atelier (pas encore)
- Calculer le prix, la livraison et la date estimée (en partie)

À demander au client :

- Ce processus existe-t-il chez vous ? Est-il décrit correctement ?
- Qui, avec quel outil, combien de minutes, combien de fois par semaine ?
- Quels problèmes (erreurs, retards, oublis) ?
- Gain attendu de l'application : temps, erreurs évitées, ventes en plus ?

### 4. Devis depuis l’espace client

Le client enregistre son devis numéroté, l’accepte ou le refuse en ligne. L’acceptation valide la commande toute seule ; la direction est seulement prévenue, dans les deux cas.

Schéma : [04-devis-en-ligne.svg](bpmn/04-devis-en-ligne.svg) · 9 étapes : 4 dans l'application, 3 en partie, 2 pas encore, 0 hors application.

À développer ou à compléter :

- Notifier la direction dans la plateforme : devis demandé (en partie)
- Valider la commande tout de suite, sans passer par la direction (pas encore)
- Notifier la direction dans la plateforme : devis accepté, commande validée (en partie)
- Annuler la commande toute seule (motif : devis refusé par le client) (pas encore)
- Notifier la direction dans la plateforme : devis refusé (en partie)

À demander au client :

- Ce processus existe-t-il chez vous ? Est-il décrit correctement ?
- Qui, avec quel outil, combien de minutes, combien de fois par semaine ?
- Quels problèmes (erreurs, retards, oublis) ?
- Gain attendu de l'application : temps, erreurs évitées, ventes en plus ?

### 5. Commande payée en ligne (sur mesure ou boutique)

Le client paie par carte avant que la commande n’existe : elle naît validée, avec une date estimée, sans intervention de l’atelier.

Schéma : [05-commande-en-ligne.svg](bpmn/05-commande-en-ligne.svg) · 11 étapes : 8 dans l'application, 2 en partie, 1 pas encore, 0 hors application.

À développer ou à compléter :

- Garder le panier dans le compte du client, retrouvé sur tous ses appareils (pas encore)
- Contrôler et débiter la carte (en partie)
- Confirmer au client par e-mail et notifier la direction dans la plateforme (en partie)

À demander au client :

- Ce processus existe-t-il chez vous ? Est-il décrit correctement ?
- Qui, avec quel outil, combien de minutes, combien de fois par semaine ?
- Quels problèmes (erreurs, retards, oublis) ?
- Gain attendu de l'application : temps, erreurs évitées, ventes en plus ?

### 6. Commande saisie par la direction pour un client

Exception à la commande en ligne : un client qui ne peut ou ne veut pas le faire seul (téléphone, visite). La direction saisit la commande dans l’application, mais le devis, son envoi, l’accès à l’espace et la validation se font tout seuls : le client décide dans son espace.

Schéma : [06-commande-direction.svg](bpmn/06-commande-direction.svg) · 9 étapes : 5 dans l'application, 2 en partie, 2 pas encore, 0 hors application.

À développer ou à compléter :

- Éditer le devis numéroté et envoyer au client le lien d’accès à son espace (en partie)
- Valider la commande tout de suite, sans passer par la direction (pas encore)
- Annuler la commande toute seule (motif : devis refusé par le client) (pas encore)
- Notifier la direction dans la plateforme : devis refusé (en partie)

À demander au client :

- Ce processus existe-t-il chez vous ? Est-il décrit correctement ?
- Qui, avec quel outil, combien de minutes, combien de fois par semaine ?
- Quels problèmes (erreurs, retards, oublis) ?
- Gain attendu de l'application : temps, erreurs évitées, ventes en plus ?

### 7. Refus d’une commande payée et remboursement

Cas exceptionnel : une commande déjà payée ne peut pas être réalisée. La direction la refuse, le client est remboursé en totalité et prévenu.

Schéma : [07-refus-remboursement.svg](bpmn/07-refus-remboursement.svg) · 7 étapes : 5 dans l'application, 1 en partie, 0 pas encore, 1 hors application.

À développer ou à compléter :

- Rembourser la carte du client (en partie)

À demander au client :

- Ce processus existe-t-il chez vous ? Est-il décrit correctement ?
- Qui, avec quel outil, combien de minutes, combien de fois par semaine ?
- Quels problèmes (erreurs, retards, oublis) ?
- Gain attendu de l'application : temps, erreurs évitées, ventes en plus ?

## Production

### 8. Fabrication à l’atelier

L’atelier voit les commandes en quatre colonnes, en prend une en charge, fabrique, puis la marque prête. Chaque carte montre le client, les pièces et les retards.

Schéma : [08-fabrication.svg](bpmn/08-fabrication.svg) · 11 étapes : 6 dans l'application, 0 en partie, 3 pas encore, 2 hors application.

À développer ou à compléter :

- Décompter les feuilles utilisées du stock (pas encore)
- Confirmer les chutes obtenues et les remettre au stock (pas encore)
- Prévenir le client par e-mail que sa commande est prête (pas encore)

À demander au client :

- Ce processus existe-t-il chez vous ? Est-il décrit correctement ?
- Qui, avec quel outil, combien de minutes, combien de fois par semaine ?
- Quels problèmes (erreurs, retards, oublis) ?
- Gain attendu de l'application : temps, erreurs évitées, ventes en plus ?

### 9. Écran d’affichage de l’atelier

Un écran fixé dans l’atelier montre en permanence les commandes en cours, en lecture seule : pas de menu, pas de bouton, rien à toucher. La page n’est servie que depuis le réseau interne de l’atelier ; tout le reste de l’application exige une connexion.

Schéma : [09-ecran-atelier.svg](bpmn/09-ecran-atelier.svg) · 6 étapes : 0 dans l'application, 0 en partie, 5 pas encore, 1 hors application.

À développer ou à compléter :

- Servir la page seulement depuis le réseau interne, jamais depuis internet (pas encore)
- Afficher les commandes en colonnes : À lancer, En fabrication, Prêtes (pas encore)
- Montrer le numéro, les pièces, la date prévue et les retards, jamais le nom du client (pas encore)
- Se rafraîchir toute seule et signaler une coupure (pas encore)
- Regarder l’écran pour savoir quoi lancer et ce qui est en retard (pas encore)

À demander au client :

- Ce processus existe-t-il chez vous ? Est-il décrit correctement ?
- Qui, avec quel outil, combien de minutes, combien de fois par semaine ?
- Quels problèmes (erreurs, retards, oublis) ?
- Gain attendu de l'application : temps, erreurs évitées, ventes en plus ?

### 10. Plan visuel de l’atelier dans l’application

La direction ouvre un plan du bâtiment, dans l’application, où les commandes se déplacent de lieu en lieu et où le stock se lit sur les racks. Le plan lit les vraies données ; l’emplacement des machines et des racks se règle une fois.

Schéma : [10-plan-atelier.svg](bpmn/10-plan-atelier.svg) · 6 étapes : 0 dans l'application, 0 en partie, 6 pas encore, 0 hors application.

À développer ou à compléter :

- Ouvrir le plan dans le menu de l’atelier (pas encore)
- Placer chaque commande dans son lieu : à lancer, sur une machine, prête, à retirer (pas encore)
- Montrer le stock sur les racks et signaler les références sous leur seuil (pas encore)
- Montrer les arrivages : le camion de feuilles sur le parking pendant la réception (pas encore)
- Cliquer une commande ou un rack pour ouvrir sa page (pas encore)
- Placer les machines, les racks et les pièces sur le plan (une fois) (pas encore)

À demander au client :

- Ce processus existe-t-il chez vous ? Est-il décrit correctement ?
- Qui, avec quel outil, combien de minutes, combien de fois par semaine ?
- Quels problèmes (erreurs, retards, oublis) ?
- Gain attendu de l'application : temps, erreurs évitées, ventes en plus ?

### 11. Livraison et retrait

La commande prête est retirée à l’atelier, ou livrée sur chantier par un salarié avec le camion de l’entreprise. Chaque colis porte une étiquette code-barres : la remise se valide en la scannant et en faisant signer le client sur l’écran. La remise lance ensuite la facture.

Schéma : [11-livraison.svg](bpmn/11-livraison.svg) · 8 étapes : 1 dans l'application, 1 en partie, 5 pas encore, 1 hors application.

À développer ou à compléter :

- Générer le code-barres du colis et l’étiquette à imprimer (pas encore)
- Grouper les colis et préparer la tournée du salarié livreur (pas encore)
- Éditer le bon de livraison (pas encore)
- Scanner le code-barres du colis à la remise (caméra du téléphone) (pas encore)
- Signer la réception sur l’écran du salarié (pas encore)
- Valider la remise : la commande passe à « Livrée » ou « Retirée » (en partie)

À demander au client :

- Ce processus existe-t-il chez vous ? Est-il décrit correctement ?
- Qui, avec quel outil, combien de minutes, combien de fois par semaine ?
- Quels problèmes (erreurs, retards, oublis) ?
- Gain attendu de l'application : temps, erreurs évitées, ventes en plus ?

## Stock de feuilles

### 12. Créer une référence de feuille

La direction décrit une feuille que l’atelier reçoit (matière, épaisseur, coloris, format) et son code-barres. Dès lors, la réception la reconnaît au scan. Rien d’autre n’est nécessaire.

Schéma : [12-materiaux.svg](bpmn/12-materiaux.svg) · 3 étapes : 3 dans l'application, 0 en partie, 0 pas encore, 0 hors application.

À demander au client :

- Ce processus existe-t-il chez vous ? Est-il décrit correctement ?
- Qui, avec quel outil, combien de minutes, combien de fois par semaine ?
- Quels problèmes (erreurs, retards, oublis) ?
- Gain attendu de l'application : temps, erreurs évitées, ventes en plus ?

### 13. Faire vivre les références de feuilles (facultatif)

Ce qui n’est pas nécessaire pour qu’une référence soit prête : ajouter ou retirer des codes-barres, archiver une référence qui n’est plus utilisée, importer un fichier.

Schéma : [13-materiaux-gestion.svg](bpmn/13-materiaux-gestion.svg) · 3 étapes : 2 dans l'application, 0 en partie, 1 pas encore, 0 hors application.

À développer ou à compléter :

- Importer toutes les références d’un coup (fichier) (pas encore)

À demander au client :

- Ce processus existe-t-il chez vous ? Est-il décrit correctement ?
- Qui, avec quel outil, combien de minutes, combien de fois par semaine ?
- Quels problèmes (erreurs, retards, oublis) ?
- Gain attendu de l'application : temps, erreurs évitées, ventes en plus ?

### 14. Commande de feuilles au fournisseur

La commande passée au fournisseur est enregistrée dans la plateforme avec ses feuilles : la réception sait ce qu’elle doit scanner et compare avec ce qui arrive.

Schéma : [14-commande-fournisseur.svg](bpmn/14-commande-fournisseur.svg) · 5 étapes : 1 dans l'application, 0 en partie, 3 pas encore, 1 hors application.

À développer ou à compléter :

- Enregistrer la commande passée : fournisseur, références, nombre de feuilles de chaque lot, date de livraison prévue (pas encore)
- Afficher « en commande » sur chaque référence et préparer les quantités attendues à la réception (pas encore)
- Notifier la direction si la livraison n’arrive pas à la date prévue (pas encore)

À demander au client :

- Ce processus existe-t-il chez vous ? Est-il décrit correctement ?
- Qui, avec quel outil, combien de minutes, combien de fois par semaine ?
- Quels problèmes (erreurs, retards, oublis) ?
- Gain attendu de l'application : temps, erreurs évitées, ventes en plus ?

### 15. Réception de marchandise au scan

L’atelier reçoit des feuilles : il scanne le code-barres d’une feuille et indique, sur la plateforme, le nombre reçu. Le stock monte et la réception est comparée à la commande passée au fournisseur. Elle peut être suspendue et reprise au camion suivant.

Schéma : [15-reception.svg](bpmn/15-reception.svg) · 11 étapes : 5 dans l'application, 0 en partie, 5 pas encore, 1 hors application.

À développer ou à compléter :

- Ouvrir la commande fournisseur attendue (pas encore)
- Comparer à la commande : ce qui reste à recevoir (pas encore)
- Clore la commande fournisseur (pas encore)
- Notifier la direction de l’écart (manque ou surplus) (pas encore)
- Suspendre la réception, la reprendre au camion suivant (pas encore)

À demander au client :

- Ce processus existe-t-il chez vous ? Est-il décrit correctement ?
- Qui, avec quel outil, combien de minutes, combien de fois par semaine ?
- Quels problèmes (erreurs, retards, oublis) ?
- Gain attendu de l'application : temps, erreurs évitées, ventes en plus ?

### 16. Suivi du stock de feuilles

Voir ce qu’il reste, être prévenu quand le stock baisse, compter, et tenir les chutes à part des feuilles entières.

Schéma : [16-stock.svg](bpmn/16-stock.svg) · 7 étapes : 5 dans l'application, 0 en partie, 2 pas encore, 0 hors application.

À développer ou à compléter :

- Décompter automatiquement ce qu’une commande consomme (pas encore)
- Estimer la date d’une commande selon le stock disponible (pas encore)

À demander au client :

- Ce processus existe-t-il chez vous ? Est-il décrit correctement ?
- Qui, avec quel outil, combien de minutes, combien de fois par semaine ?
- Quels problèmes (erreurs, retards, oublis) ?
- Gain attendu de l'application : temps, erreurs évitées, ventes en plus ?

## Finance

### 17. Facturation et encaissement

La remise de la commande (retrait ou livraison) lance la facture toute seule, le client est prévenu et la consulte dans son espace. La direction n’enregistre pas les paiements : ils sont constatés par l’application. Avoir et export pour le comptable restent à sa main.

Schéma : [17-facturation.svg](bpmn/17-facturation.svg) · 10 étapes : 4 dans l'application, 2 en partie, 3 pas encore, 1 hors application.

À développer ou à compléter :

- Détecter la remise et émettre la facture toute seule (en partie)
- Prévenir le client par e-mail : sa facture est dans son espace (sans pièce jointe) (en partie)
- Marquer la facture payée avec la confirmation du prestataire de paiement (pas encore)
- Relancer le client par e-mail : rappel à l’échéance, puis relances (pas encore)
- Constater le paiement sans saisie de la direction (par exemple en lisant le relevé bancaire) (pas encore)

À demander au client :

- Ce processus existe-t-il chez vous ? Est-il décrit correctement ?
- Qui, avec quel outil, combien de minutes, combien de fois par semaine ?
- Quels problèmes (erreurs, retards, oublis) ?
- Gain attendu de l'application : temps, erreurs évitées, ventes en plus ?

### 18. Statistiques : chiffres clés et ventes

La direction lit ce qu’elle vend, de quoi et combien, sur la période de son choix. Les données de commandes existent déjà.

Schéma : [18-stats-ventes.svg](bpmn/18-stats-ventes.svg) · 4 étapes : 0 dans l'application, 0 en partie, 4 pas encore, 0 hors application.

À développer ou à compléter :

- Choisir une période et un intervalle (jour, semaine, mois) (pas encore)
- Calculer le chiffre d’affaires, le nombre de commandes, le panier moyen, les devis acceptés (pas encore)
- Répartir les ventes par matière, coloris, modèle de pièce, sur mesure ou boutique (pas encore)
- Lire les chiffres, les courbes et le classement des références (pas encore)

À demander au client :

- Ce processus existe-t-il chez vous ? Est-il décrit correctement ?
- Qui, avec quel outil, combien de minutes, combien de fois par semaine ?
- Quels problèmes (erreurs, retards, oublis) ?
- Gain attendu de l'application : temps, erreurs évitées, ventes en plus ?

### 19. Statistiques : audience du site et entonnoir

La direction voit si le site attire et si les visiteurs deviennent clients. Rien n’est mesuré aujourd’hui : la collecte doit commencer dès la mise en production. Les robots sont écartés autant que possible ; seule l’action (devis, commande) prouve un vrai client.

Schéma : [19-stats-audience.svg](bpmn/19-stats-audience.svg) · 6 étapes : 0 dans l'application, 0 en partie, 6 pas encore, 0 hors application.

À développer ou à compléter :

- Compter les visites et les pages vues, sans cookie ni adresse IP conservée (pas encore)
- Écarter les robots : agents connus, requêtes sans navigateur réel, volume anormal (pas encore)
- Distinguer le visiteur anonyme du client connecté à son espace (pas encore)
- Enregistrer les abandons du configurateur et du panier, les devis refusés ou expirés et leur motif (pas encore)
- Calculer l’entonnoir : visite, configurateur, devis, commande (pas encore)
- Lire l’audience et l’entonnoir (pas encore)

À demander au client :

- Ce processus existe-t-il chez vous ? Est-il décrit correctement ?
- Qui, avec quel outil, combien de minutes, combien de fois par semaine ?
- Quels problèmes (erreurs, retards, oublis) ?
- Gain attendu de l'application : temps, erreurs évitées, ventes en plus ?

### 20. Statistiques : dépenses, entrées et marge

La direction suit l’argent qui entre et qui sort. Il manque les prix d’achat et les dépenses : ils se saisissent à la réception et par catégorie.

Schéma : [20-stats-finances.svg](bpmn/20-stats-finances.svg) · 5 étapes : 0 dans l'application, 0 en partie, 5 pas encore, 0 hors application.

À développer ou à compléter :

- Saisir le prix d’achat à la réception de chaque lot (pas encore)
- Saisir les autres dépenses par catégorie (pas encore)
- Calculer les entrées (paiements, factures), les sorties et le solde (pas encore)
- Calculer la marge par matière (pas encore)
- Lire les entrées, les sorties et la marge (pas encore)

À demander au client :

- Ce processus existe-t-il chez vous ? Est-il décrit correctement ?
- Qui, avec quel outil, combien de minutes, combien de fois par semaine ?
- Quels problèmes (erreurs, retards, oublis) ?
- Gain attendu de l'application : temps, erreurs évitées, ventes en plus ?

### 21. Statistiques : délais tenus et charge de l’atelier

La direction compare ce qu’elle annonce à ce qu’elle fait. Les dates estimée et réelle sont déjà enregistrées.

Schéma : [21-stats-atelier.svg](bpmn/21-stats-atelier.svg) · 4 étapes : 0 dans l'application, 0 en partie, 4 pas encore, 0 hors application.

À développer ou à compléter :

- Mesurer les délais validée, prête, livrée et les comparer à la date estimée (pas encore)
- Repérer les retards et la charge par semaine (pas encore)
- Calculer le rendement matière : feuilles commandées contre consommées, chutes (pas encore)
- Lire les délais, la charge et le rendement (pas encore)

À demander au client :

- Ce processus existe-t-il chez vous ? Est-il décrit correctement ?
- Qui, avec quel outil, combien de minutes, combien de fois par semaine ?
- Quels problèmes (erreurs, retards, oublis) ?
- Gain attendu de l'application : temps, erreurs évitées, ventes en plus ?

### 22. Statistiques : consommation et rotation du stock

La direction voit ce que l’atelier consomme et ce qui dort sur les étagères.

Schéma : [22-stats-stock.svg](bpmn/22-stats-stock.svg) · 4 étapes : 0 dans l'application, 0 en partie, 4 pas encore, 0 hors application.

À développer ou à compléter :

- Calculer la consommation par matière et coloris (pas encore)
- Calculer la rotation et repérer le stock dormant (pas encore)
- Repérer les ruptures (pas encore)
- Lire la consommation et le stock dormant (pas encore)

À demander au client :

- Ce processus existe-t-il chez vous ? Est-il décrit correctement ?
- Qui, avec quel outil, combien de minutes, combien de fois par semaine ?
- Quels problèmes (erreurs, retards, oublis) ?
- Gain attendu de l'application : temps, erreurs évitées, ventes en plus ?

### 23. Statistiques : comparer des périodes

La direction superpose deux périodes ou plus, pour le même chiffre (mois contre mois, année contre année).

Schéma : [23-stats-comparateur.svg](bpmn/23-stats-comparateur.svg) · 3 étapes : 0 dans l'application, 0 en partie, 3 pas encore, 0 hors application.

À développer ou à compléter :

- Choisir deux périodes ou plus et le chiffre à comparer (pas encore)
- Superposer les courbes (pas encore)
- Lire l’écart (pas encore)

À demander au client :

- Ce processus existe-t-il chez vous ? Est-il décrit correctement ?
- Qui, avec quel outil, combien de minutes, combien de fois par semaine ?
- Quels problèmes (erreurs, retards, oublis) ?
- Gain attendu de l'application : temps, erreurs évitées, ventes en plus ?

### 24. Statistiques : alertes sur le catalogue

L’application signale d’elle-même un produit qui ne se vend plus, avec une suggestion.

Schéma : [24-stats-alertes.svg](bpmn/24-stats-alertes.svg) · 4 étapes : 1 dans l'application, 0 en partie, 3 pas encore, 0 hors application.

À développer ou à compléter :

- Régler les règles d’alerte (par exemple : sans vente depuis N mois) (pas encore)
- Détecter un coloris ou une matière sans vente (pas encore)
- Notifier la direction dans la plateforme, avec une suggestion : désactiver, solder, ne plus réapprovisionner (pas encore)

À demander au client :

- Ce processus existe-t-il chez vous ? Est-il décrit correctement ?
- Qui, avec quel outil, combien de minutes, combien de fois par semaine ?
- Quels problèmes (erreurs, retards, oublis) ?
- Gain attendu de l'application : temps, erreurs évitées, ventes en plus ?

### 25. Statistiques : reprise de l’historique

L’entreprise a déjà des données (logiciel de facturation, tableurs) : les reprendre donne des courbes dès le départ.

Schéma : [25-stats-historique.svg](bpmn/25-stats-historique.svg) · 3 étapes : 0 dans l'application, 0 en partie, 3 pas encore, 0 hors application.

À développer ou à compléter :

- Choisir le fichier (CSV ou Excel) de l’ancien outil (pas encore)
- Contrôler puis importer l’historique (pas encore)
- Vérifier les courbes dès le départ (pas encore)

À demander au client :

- Ce processus existe-t-il chez vous ? Est-il décrit correctement ?
- Qui, avec quel outil, combien de minutes, combien de fois par semaine ?
- Quels problèmes (erreurs, retards, oublis) ?
- Gain attendu de l'application : temps, erreurs évitées, ventes en plus ?

## Organisation

### 26. Équipe : arrivée et départ d’un salarié

Fiche du salarié, compte personnel, droits par sections, puis désactivation au départ.

Schéma : [26-equipe.svg](bpmn/26-equipe.svg) · 7 étapes : 7 dans l'application, 0 en partie, 0 pas encore, 0 hors application.

À demander au client :

- Ce processus existe-t-il chez vous ? Est-il décrit correctement ?
- Qui, avec quel outil, combien de minutes, combien de fois par semaine ?
- Quels problèmes (erreurs, retards, oublis) ?
- Gain attendu de l'application : temps, erreurs évitées, ventes en plus ?

### 27. Paramétrage par la direction

Tarifs, catalogue, documents : ce que la direction règle sans développeur, en gardant simple ce qui change souvent.

Schéma : [27-parametrage.svg](bpmn/27-parametrage.svg) · 6 étapes : 4 dans l'application, 0 en partie, 2 pas encore, 0 hors application.

À développer ou à compléter :

- Régler les limites par matière, la quantité maximale et le délai selon la quantité (pas encore)
- Déclarer les jours fériés et les fermetures (pas encore)

À demander au client :

- Ce processus existe-t-il chez vous ? Est-il décrit correctement ?
- Qui, avec quel outil, combien de minutes, combien de fois par semaine ?
- Quels problèmes (erreurs, retards, oublis) ?
- Gain attendu de l'application : temps, erreurs évitées, ventes en plus ?

### 28. Paramétrer les machines de l’atelier

La direction décrit les machines (type, longueur et épaisseur maximales, cadence) : l’application s’en sert pour contrôler la faisabilité d’une pièce et estimer la charge. Les limites réelles sont à recueillir chez le client.

Schéma : [28-parametrage-machines.svg](bpmn/28-parametrage-machines.svg) · 4 étapes : 0 dans l'application, 0 en partie, 4 pas encore, 0 hors application.

À développer ou à compléter :

- Ajouter ou modifier une machine : type, longueur maximale, épaisseur par matière, cadence (pas encore)
- Mettre une machine hors service (panne, maintenance) ou la retirer (pas encore)
- Appliquer les limites des machines au contrôle du configurateur (pas encore)
- Calculer la capacité par jour pour la date estimée (pas encore)

À demander au client :

- Ce processus existe-t-il chez vous ? Est-il décrit correctement ?
- Qui, avec quel outil, combien de minutes, combien de fois par semaine ?
- Quels problèmes (erreurs, retards, oublis) ?
- Gain attendu de l'application : temps, erreurs évitées, ventes en plus ?

### 29. Faire vivre le site vitrine et la boutique

Produits de la boutique, photos, textes du site et alertes de la messagerie. Les pages légales ne se modifient pas : elles suivent les versions de l’application.

Schéma : [29-site-vitrine.svg](bpmn/29-site-vitrine.svg) · 6 étapes : 5 dans l'application, 0 en partie, 0 pas encore, 1 hors application.

À demander au client :

- Ce processus existe-t-il chez vous ? Est-il décrit correctement ?
- Qui, avec quel outil, combien de minutes, combien de fois par semaine ?
- Quels problèmes (erreurs, retards, oublis) ?
- Gain attendu de l'application : temps, erreurs évitées, ventes en plus ?

### 30. Messages envoyés aux clients

Les e-mails automatiques envoyés aux clients, qui ne se connectent pas souvent à leur espace : à quel moment, avec quelles règles. Jamais de publicité, jamais de document joint, jamais de mot de passe. La direction, elle, est notifiée dans la plateforme (voir « Notifications de la direction »).

Schéma : [30-messages.svg](bpmn/30-messages.svg) · 5 étapes : 4 dans l'application, 0 en partie, 1 pas encore, 0 hors application.

À développer ou à compléter :

- Commande prête, accusé de réception d’une demande de contact (pas encore)

À demander au client :

- Ce processus existe-t-il chez vous ? Est-il décrit correctement ?
- Qui, avec quel outil, combien de minutes, combien de fois par semaine ?
- Quels problèmes (erreurs, retards, oublis) ?
- Gain attendu de l'application : temps, erreurs évitées, ventes en plus ?

### 31. Notifications de la direction

Tout ce qui concerne la direction arrive dans la plateforme, en un seul endroit, pour chaque compte qui en a le droit. Un clic ouvre la page où traiter la demande. Si trop de notifications restent non lues, un e-mail d’alerte part.

Schéma : [31-notifications.svg](bpmn/31-notifications.svg) · 6 étapes : 1 dans l'application, 1 en partie, 4 pas encore, 0 hors application.

À développer ou à compléter :

- Créer la notification pour chaque compte de la direction qui en a le droit (en partie)
- Envoyer un e-mail d’alerte à la direction si trop de notifications restent non lues (pas encore)
- Voir le nombre de notifications non lues dans le menu (pas encore)
- Ouvrir la notification : arriver directement sur la page à traiter (pas encore)
- Marquer la notification comme lue, puis traitée (pas encore)

À demander au client :

- Ce processus existe-t-il chez vous ? Est-il décrit correctement ?
- Qui, avec quel outil, combien de minutes, combien de fois par semaine ?
- Quels problèmes (erreurs, retards, oublis) ?
- Gain attendu de l'application : temps, erreurs évitées, ventes en plus ?

## Mise en service et exploitation

### 32. Mise en service chez un client

Ce que nous installons et ce que le client renseigne avant de s’en servir : entreprise, numérotation, tarifs, équipe, références, stock de départ, site.

Schéma : [32-mise-en-service.svg](bpmn/32-mise-en-service.svg) · 11 étapes : 7 dans l'application, 2 en partie, 1 pas encore, 1 hors application.

À développer ou à compléter :

- Installer l’application, créer le compte administrateur, régler les secrets (e-mail, paiement) (en partie)
- Importer les clients et l’historique de l’ancien outil (pas encore)
- Brancher le prestataire de paiement du client et faire un paiement de test (en partie)

À demander au client :

- Ce processus existe-t-il chez vous ? Est-il décrit correctement ?
- Qui, avec quel outil, combien de minutes, combien de fois par semaine ?
- Quels problèmes (erreurs, retards, oublis) ?
- Gain attendu de l'application : temps, erreurs évitées, ventes en plus ?

### 33. Disponibilité et supervision du serveur

Le serveur du client (un Raspberry Pi) doit rester disponible : il relance seul ses services, se reconnecte au réseau, et remonte son état. La maintenance s’y connecte à distance. Un seul Raspberry ne garantit pas 100 % (coupure de courant, d’internet) : la disponibilité visée est à fixer avec le client.

Schéma : [33-exploitation.svg](bpmn/33-exploitation.svg) · 7 étapes : 0 dans l'application, 2 en partie, 4 pas encore, 1 hors application.

À développer ou à compléter :

- Relancer tout seul un service qui plante (en partie)
- Se reconnecter au réseau (wifi) après une coupure (pas encore)
- Redémarrer le Raspberry s’il ne répond plus (chien de garde) (pas encore)
- Remonter l’état du serveur et de chaque service (API, base, sauvegardes, disque, température) (pas encore)
- Alerter la maintenance (nous) (pas encore)
- Se connecter à distance et lire l’état (réseau privé, sans port ouvert) (en partie)

À demander au client :

- Ce processus existe-t-il chez vous ? Est-il décrit correctement ?
- Qui, avec quel outil, combien de minutes, combien de fois par semaine ?
- Quels problèmes (erreurs, retards, oublis) ?
- Gain attendu de l'application : temps, erreurs évitées, ventes en plus ?

### 34. Sauvegardes et test de restauration

La base est sauvegardée chaque nuit, copiée sur le NAS du client et chez nous, hors du site. Une sauvegarde qu’on n’a jamais restaurée ne vaut rien : la restauration est testée régulièrement.

Schéma : [34-exploitation-sauvegardes.svg](bpmn/34-exploitation-sauvegardes.svg) · 8 étapes : 3 dans l'application, 1 en partie, 4 pas encore, 0 hors application.

À développer ou à compléter :

- Copier la sauvegarde sur le NAS du client (pas encore)
- Copier une sauvegarde chez nous, hors du site (chiffrée) (pas encore)
- Tester la restauration : recréer une base depuis la dernière sauvegarde et la comparer (en partie)
- Tester de temps en temps un redémarrage complet de l’application depuis une sauvegarde, sur une autre machine (pas encore)
- Alerter la maintenance si une copie ou un test échoue (pas encore)

À demander au client :

- Ce processus existe-t-il chez vous ? Est-il décrit correctement ?
- Qui, avec quel outil, combien de minutes, combien de fois par semaine ?
- Quels problèmes (erreurs, retards, oublis) ?
- Gain attendu de l'application : temps, erreurs évitées, ventes en plus ?

### 35. Mises à jour du système et de l’application

Le système du Raspberry, les services et les dépendances du front et du back sont tenus à jour sans casser l’application : détection, tests, publication, retour arrière.

Schéma : [35-exploitation-mises-a-jour.svg](bpmn/35-exploitation-mises-a-jour.svg) · 6 étapes : 2 dans l'application, 0 en partie, 4 pas encore, 0 hors application.

À développer ou à compléter :

- Appliquer les mises à jour de sécurité du système du Raspberry, la nuit (pas encore)
- Redémarrer et vérifier que tout est reparti (pas encore)
- Publier la nouvelle version et la déployer sur le Raspberry (pas encore)
- Contrôler la santé après déploiement et revenir à la version précédente si besoin (pas encore)

À demander au client :

- Ce processus existe-t-il chez vous ? Est-il décrit correctement ?
- Qui, avec quel outil, combien de minutes, combien de fois par semaine ?
- Quels problèmes (erreurs, retards, oublis) ?
- Gain attendu de l'application : temps, erreurs évitées, ventes en plus ?
