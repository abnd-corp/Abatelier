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

### 9. Livraison et retrait

La commande prête est retirée à l’atelier ou livrée sur chantier.

Schéma : [09-livraison.svg](bpmn/09-livraison.svg) · 6 étapes : 2 dans l'application, 0 en partie, 3 pas encore, 1 hors application.

À développer ou à compléter :

- Planifier la tournée et livrer sur chantier (pas encore)
- Éditer le bon de livraison (pas encore)
- Signer la réception (pas encore)

À demander au client :

- Ce processus existe-t-il chez vous ? Est-il décrit correctement ?
- Qui, avec quel outil, combien de minutes, combien de fois par semaine ?
- Quels problèmes (erreurs, retards, oublis) ?
- Gain attendu de l'application : temps, erreurs évitées, ventes en plus ?

## Stock de feuilles

### 10. Définir les références de feuilles et leurs codes-barres

La direction décrit les feuilles que l’atelier reçoit (matière, coloris, format) et leurs codes-barres, pour que la réception les reconnaisse au scan.

Schéma : [10-materiaux.svg](bpmn/10-materiaux.svg) · 6 étapes : 5 dans l'application, 0 en partie, 1 pas encore, 0 hors application.

À développer ou à compléter :

- Importer toutes les références d’un coup (fichier) (pas encore)

À demander au client :

- Ce processus existe-t-il chez vous ? Est-il décrit correctement ?
- Qui, avec quel outil, combien de minutes, combien de fois par semaine ?
- Quels problèmes (erreurs, retards, oublis) ?
- Gain attendu de l'application : temps, erreurs évitées, ventes en plus ?

### 11. Réception de marchandise au scan

L’atelier reçoit des feuilles : il scanne le code-barres d’une feuille et indique le nombre reçu. Le stock monte, la réception est tracée.

Schéma : [11-reception.svg](bpmn/11-reception.svg) · 7 étapes : 5 dans l'application, 0 en partie, 0 pas encore, 2 hors application.

À demander au client :

- Ce processus existe-t-il chez vous ? Est-il décrit correctement ?
- Qui, avec quel outil, combien de minutes, combien de fois par semaine ?
- Quels problèmes (erreurs, retards, oublis) ?
- Gain attendu de l'application : temps, erreurs évitées, ventes en plus ?

### 12. Suivi du stock de feuilles

Voir ce qu’il reste, être prévenu quand le stock baisse, compter, et tenir les chutes à part des feuilles entières.

Schéma : [12-stock.svg](bpmn/12-stock.svg) · 7 étapes : 5 dans l'application, 0 en partie, 2 pas encore, 0 hors application.

À développer ou à compléter :

- Décompter automatiquement ce qu’une commande consomme (pas encore)
- Estimer la date d’une commande selon le stock disponible (pas encore)

À demander au client :

- Ce processus existe-t-il chez vous ? Est-il décrit correctement ?
- Qui, avec quel outil, combien de minutes, combien de fois par semaine ?
- Quels problèmes (erreurs, retards, oublis) ?
- Gain attendu de l'application : temps, erreurs évitées, ventes en plus ?

## Finance

### 13. Facturation et encaissement

De la commande livrée à la facture payée, avec avoir et export pour le comptable. Aucun document n’est joint aux e-mails.

Schéma : [13-facturation.svg](bpmn/13-facturation.svg) · 9 étapes : 7 dans l'application, 0 en partie, 1 pas encore, 1 hors application.

À développer ou à compléter :

- Relancer le client par e-mail (pas encore)

À demander au client :

- Ce processus existe-t-il chez vous ? Est-il décrit correctement ?
- Qui, avec quel outil, combien de minutes, combien de fois par semaine ?
- Quels problèmes (erreurs, retards, oublis) ?
- Gain attendu de l'application : temps, erreurs évitées, ventes en plus ?

### 14. Pilotage et statistiques

Lire l’activité dans la durée : ventes par groupe, visites du site, entrées et sorties d’argent, délais tenus, comparaison de périodes, règles d’alerte. Nécessite de la donnée collectée.

Schéma : [14-statistiques.svg](bpmn/14-statistiques.svg) · 7 étapes : 0 dans l'application, 0 en partie, 7 pas encore, 0 hors application.

À développer ou à compléter :

- Collecter les visites du site (anonymes, sans cookie) (pas encore)
- Saisir le prix d’achat à la réception et les autres dépenses (pas encore)
- Choisir une période et un intervalle (jour, semaine, mois) (pas encore)
- Calculer les ventes par matière, coloris, modèle ; le chiffre d’affaires, le panier moyen (pas encore)
- Comparer la date estimée et la date réelle de fin : délais tenus (pas encore)
- Comparer deux périodes (mois, années) (pas encore)
- Signaler un coloris ou une matière sans vente depuis longtemps (pas encore)

À demander au client :

- Ce processus existe-t-il chez vous ? Est-il décrit correctement ?
- Qui, avec quel outil, combien de minutes, combien de fois par semaine ?
- Quels problèmes (erreurs, retards, oublis) ?
- Gain attendu de l'application : temps, erreurs évitées, ventes en plus ?

## Organisation

### 15. Équipe : arrivée et départ d’un salarié

Fiche du salarié, compte personnel, droits par sections, puis désactivation au départ.

Schéma : [15-equipe.svg](bpmn/15-equipe.svg) · 7 étapes : 7 dans l'application, 0 en partie, 0 pas encore, 0 hors application.

À demander au client :

- Ce processus existe-t-il chez vous ? Est-il décrit correctement ?
- Qui, avec quel outil, combien de minutes, combien de fois par semaine ?
- Quels problèmes (erreurs, retards, oublis) ?
- Gain attendu de l'application : temps, erreurs évitées, ventes en plus ?

### 16. Paramétrage par la direction

Tarifs, catalogue, documents : ce que la direction règle sans développeur, en gardant simple ce qui change souvent.

Schéma : [16-parametrage.svg](bpmn/16-parametrage.svg) · 6 étapes : 4 dans l'application, 0 en partie, 2 pas encore, 0 hors application.

À développer ou à compléter :

- Régler les limites par matière, la quantité maximale et le délai selon la quantité (pas encore)
- Déclarer les jours fériés et les fermetures (pas encore)

À demander au client :

- Ce processus existe-t-il chez vous ? Est-il décrit correctement ?
- Qui, avec quel outil, combien de minutes, combien de fois par semaine ?
- Quels problèmes (erreurs, retards, oublis) ?
- Gain attendu de l'application : temps, erreurs évitées, ventes en plus ?

### 17. Faire vivre le site vitrine et la boutique

Produits de la boutique, photos, textes du site et alertes de la messagerie. Les pages légales ne se modifient pas : elles suivent les versions de l’application.

Schéma : [17-site-vitrine.svg](bpmn/17-site-vitrine.svg) · 6 étapes : 5 dans l'application, 0 en partie, 0 pas encore, 1 hors application.

À demander au client :

- Ce processus existe-t-il chez vous ? Est-il décrit correctement ?
- Qui, avec quel outil, combien de minutes, combien de fois par semaine ?
- Quels problèmes (erreurs, retards, oublis) ?
- Gain attendu de l'application : temps, erreurs évitées, ventes en plus ?

### 18. Messages envoyés par l’application

Les messages automatiques : par e-mail pour les clients, qui ne se connectent pas souvent ; dans la plateforme, en un seul endroit, pour la direction. Jamais de publicité, jamais de document joint, jamais de mot de passe.

Schéma : [18-messages.svg](bpmn/18-messages.svg) · 9 étapes : 5 dans l'application, 2 en partie, 2 pas encore, 0 hors application.

À développer ou à compléter :

- Commande prête, accusé de réception d’une demande de contact (pas encore)
- Notifier la direction dans la plateforme (commande, contact, devis) (en partie)
- Lire la notification et ouvrir la commande ou la demande (en partie)
- Envoyer un e-mail d’alerte à la direction si trop de notifications restent non lues (pas encore)

À demander au client :

- Ce processus existe-t-il chez vous ? Est-il décrit correctement ?
- Qui, avec quel outil, combien de minutes, combien de fois par semaine ?
- Quels problèmes (erreurs, retards, oublis) ?
- Gain attendu de l'application : temps, erreurs évitées, ventes en plus ?

## Mise en service et exploitation

### 19. Mise en service chez un client

Ce que nous installons et ce que le client renseigne avant de s’en servir : entreprise, numérotation, tarifs, équipe, références, stock de départ, site.

Schéma : [19-mise-en-service.svg](bpmn/19-mise-en-service.svg) · 11 étapes : 7 dans l'application, 2 en partie, 1 pas encore, 1 hors application.

À développer ou à compléter :

- Installer l’application, créer le compte administrateur, régler les secrets (e-mail, paiement) (en partie)
- Importer les clients et l’historique de l’ancien outil (pas encore)
- Brancher le prestataire de paiement du client et faire un paiement de test (en partie)

À demander au client :

- Ce processus existe-t-il chez vous ? Est-il décrit correctement ?
- Qui, avec quel outil, combien de minutes, combien de fois par semaine ?
- Quels problèmes (erreurs, retards, oublis) ?
- Gain attendu de l'application : temps, erreurs évitées, ventes en plus ?

### 20. Sauvegarde et exploitation

La sécurité des données et la maintenance au quotidien, sur le serveur du client.

Schéma : [20-exploitation.svg](bpmn/20-exploitation.svg) · 7 étapes : 3 dans l'application, 1 en partie, 3 pas encore, 0 hors application.

À développer ou à compléter :

- Copier la sauvegarde hors de la machine (NAS du client) (pas encore)
- Surveiller et alerter (e-mail, supervision) (pas encore)
- Se connecter à distance pour la maintenance (réseau privé, sans port ouvert) (en partie)
- Installer une nouvelle version, avec retour arrière possible (pas encore)

À demander au client :

- Ce processus existe-t-il chez vous ? Est-il décrit correctement ?
- Qui, avec quel outil, combien de minutes, combien de fois par semaine ?
- Quels problèmes (erreurs, retards, oublis) ?
- Gain attendu de l'application : temps, erreurs évitées, ventes en plus ?
