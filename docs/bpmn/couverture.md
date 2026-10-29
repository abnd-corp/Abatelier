# Couverture des besoins métier

> Généré par `node scripts/bpmn/generer.mjs` à partir de `scripts/bpmn/processus.mjs`. Ne pas modifier à la main.

Les 20 processus de l’atelier sont décrits en BPMN (voir [README](README.md)). Chaque étape est classée selon ce que fait l’application aujourd’hui.

| Couverture | Étapes | Part |
|---|---|---|
| Dans l’application | 113 | 71 % |
| En partie | 7 | 4 % |
| Pas encore | 30 | 19 % |
| Hors application | 10 | 6 % |
| **Total** | **160** | |

## Ce qu’il reste à faire pour couvrir tout le besoin

- **Demande de contact** : Envoyer un accusé de réception au visiteur (pas encore) : Aujourd’hui seule l’équipe est prévenue
- **Demande de contact** : Créer la fiche client depuis la demande (pas encore) : Aujourd’hui la fiche se crée à la main dans Clients
- **Demande de contact** : Supprimer la demande au bout de 12 mois (pas encore) : Suppression à la demande de la personne : faite ; purge automatique : à faire
- **Espace client : création, activation, mot de passe, fermeture** : Vérifier le SIRET dans l’annuaire officiel des entreprises (en activité, nom concordant) (pas encore) : Annuaire public et gratuit (recherche-entreprises.api.gouv.fr) ; le n° de TVA se contrôle avec VIES. Aujourd’hui la direction vérifie à la main
- **Configurateur : faisabilité contrôlée, prix et date estimée** : Vérifier la quantité et la charge de l’atelier (pas encore) : Plafond de quantité et capacité par jour : en attente des données de l’atelier
- **Configurateur : faisabilité contrôlée, prix et date estimée** : Calculer le prix, la livraison et la date estimée (en partie) : Date = jour + délai standard ; pas encore selon la quantité, le stock ni la charge
- **Devis depuis l’espace client** : Valider la commande tout de suite, sans passer par la direction (pas encore) : Aujourd’hui la direction valide à la main (un clic depuis le devis) ; devis encore valable et prix inchangés
- **Devis depuis l’espace client** : Prévenir la direction : devis accepté, commande validée (en partie) : Alerte envoyée, mais elle dit encore « attend votre validation »
- **Commande payée en ligne (sur mesure ou boutique)** : Contrôler et débiter la carte (en partie) : Essayé avec le mode test de Stripe ; le compte du client se branche à la mise en service
- **Refus d’une commande payée et remboursement** : Rembourser la carte du client (en partie) : Vérifié avec le mode test de Stripe
- **Fabrication à l’atelier** : Décompter les feuilles utilisées du stock (pas encore) : Aujourd’hui saisi à la main dans Stock de feuilles
- **Fabrication à l’atelier** : Confirmer les chutes obtenues et les remettre au stock (pas encore) : Décidé : le nombre de chutes se confirme à la fin de la fabrication
- **Fabrication à l’atelier** : Prévenir le client par e-mail que sa commande est prête (pas encore) : Aujourd’hui il le voit seulement dans son espace
- **Livraison et retrait** : Planifier la tournée et livrer sur chantier (pas encore) : Pas de planning de tournées dans l’application
- **Livraison et retrait** : Éditer le bon de livraison (pas encore) : Prévu : nouveau type de document
- **Livraison et retrait** : Signer la réception (pas encore) : Pas de signature de réception
- **Définir les références de feuilles et leurs codes-barres** : Importer toutes les références d’un coup (fichier) (pas encore) : Décidé : plus tard
- **Suivi du stock de feuilles** : Décompter automatiquement ce qu’une commande consomme (pas encore) : Décidé : au lancement, avec confirmation des chutes à la fin
- **Suivi du stock de feuilles** : Estimer la date d’une commande selon le stock disponible (pas encore) : Si les feuilles manquent : délai standard + délai du fournisseur (données à recueillir)
- **Facturation et encaissement** : Relancer le client par e-mail (pas encore) : Pas de relance automatique ni de liste des impayés
- **Pilotage et statistiques** : Collecter les visites du site (anonymes, sans cookie) (pas encore) : Rien n’est mesuré aujourd’hui (ticket Statistiques)
- **Pilotage et statistiques** : Saisir le prix d’achat à la réception et les autres dépenses (pas encore) : Aucun prix d’achat ni dépense dans l’application
- **Pilotage et statistiques** : Choisir une période et un intervalle (jour, semaine, mois) (pas encore) : Une seule vue commune à tous les écrans
- **Pilotage et statistiques** : Calculer les ventes par matière, coloris, modèle ; le chiffre d’affaires, le panier moyen (pas encore) : Les données de commandes existent déjà
- **Pilotage et statistiques** : Comparer la date estimée et la date réelle de fin : délais tenus (pas encore) : Les deux dates sont déjà enregistrées
- **Pilotage et statistiques** : Comparer deux périodes (mois, années) (pas encore) : Superposition de courbes
- **Pilotage et statistiques** : Signaler un coloris ou une matière sans vente depuis longtemps (pas encore) : Règles d’alerte réglables ; suggestion de désactiver ou solder
- **Paramétrage par la direction** : Régler les limites par matière, la quantité maximale et le délai selon la quantité (pas encore) : En attente des données des machines de l’atelier
- **Paramétrage par la direction** : Déclarer les jours fériés et les fermetures (pas encore) : Le délai annoncé saute les week-ends, pas les jours fériés
- **Messages envoyés par l’application** : Commande prête, accusé de réception d’une demande de contact (pas encore) : Pas encore envoyés au client
- **Mise en service chez un client** : Installer l’application, créer le compte administrateur, régler les secrets (e-mail, paiement) (en partie) : Docker prêt ; domaine HTTPS et serveur chez le client à finaliser
- **Mise en service chez un client** : Importer les clients et l’historique de l’ancien outil (pas encore) : Facultatif ; dépend de la forme des données existantes
- **Mise en service chez un client** : Brancher le prestataire de paiement du client et faire un paiement de test (en partie) : Stripe essayé en test ; le choix du prestataire se fait avec le client
- **Sauvegarde et exploitation** : Copier la sauvegarde hors de la machine (NAS du client) (pas encore) : Prévu avec le déploiement (M3)
- **Sauvegarde et exploitation** : Surveiller et alerter (e-mail, supervision) (pas encore) : Prévu avec le déploiement (M3)
- **Sauvegarde et exploitation** : Se connecter à distance pour la maintenance (réseau privé, sans port ouvert) (en partie) : Raspberry Pi et accès à distance prévus
- **Sauvegarde et exploitation** : Installer une nouvelle version, avec retour arrière possible (pas encore) : Versions et déploiement (tickets D1 à D9)

## 1. Demande de contact

Un visiteur écrit à l’atelier depuis le site, avec ou sans plan.

Schéma : [image](01-contact.svg) · [fichier BPMN](01-contact.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Remplir le formulaire de contact (plan joint possible) | Visiteur / Client | Dans l’application | Site public › Contact (consentement RGPD demandé) |
| Enregistrer la demande et prévenir la direction par e-mail | Application (automatique) | Dans l’application | Alerte avec le plan, la pièce choisie dans le configurateur et un lien |
| Envoyer un accusé de réception au visiteur | Application (automatique) | Pas encore | Aujourd’hui seule l’équipe est prévenue |
| Lire la demande et télécharger le plan | Direction | Dans l’application | Site vitrine › Demandes reçues |
| Créer la fiche client depuis la demande | Direction | Pas encore | Aujourd’hui la fiche se crée à la main dans Clients |
| Répondre au client (téléphone ou e-mail) | Direction | Hors application | La réponse part de la messagerie habituelle |
| Marquer la demande comme traitée | Direction | Dans l’application | Site vitrine › Demandes reçues |
| Supprimer la demande au bout de 12 mois | Application (automatique) | Pas encore | Suppression à la demande de la personne : faite ; purge automatique : à faire |

## 2. Espace client : création, activation, mot de passe, fermeture

Création de l’espace d’un particulier ou d’un professionnel, activation sur une fiche existante, mot de passe oublié, vérification automatique du statut pro auprès de l’annuaire officiel, fermeture.

Schéma : [image](02-espace-client.svg) · [fichier BPMN](02-espace-client.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Créer son espace (particulier ou professionnel, consentement) | Visiteur / Client | Dans l’application | Site public › Créer mon espace client |
| Créer l’espace et la fiche, ouvrir la session | Application (automatique) | Dans l’application | Mot de passe contrôlé (12 caractères, pas de mot de passe courant) |
| Envoyer le message de bienvenue | Application (automatique) | Dans l’application | Sans publicité : seulement les messages utiles au compte |
| Envoyer un lien d’activation à l’adresse de la fiche existante | Application (automatique) | Dans l’application | Valable 7 jours, usage unique ; une adresse déjà active ne peut pas être réclamée |
| Choisir son mot de passe avec le lien reçu | Visiteur / Client | Dans l’application | Seul le propriétaire de l’adresse peut le faire |
| Rattacher l’espace à la fiche existante, ouvrir la session | Application (automatique) | Dans l’application | Aucun doublon : ses devis et factures y sont déjà |
| Compléter « Mes informations » (SIRET, TVA, adresse de facturation) | Visiteur / Client | Dans l’application | Espace client › Mes informations |
| Vérifier le SIRET dans l’annuaire officiel des entreprises (en activité, nom concordant) | Application (automatique) | Pas encore | Annuaire public et gratuit (recherche-entreprises.api.gouv.fr) ; le n° de TVA se contrôle avec VIES. Aujourd’hui la direction vérifie à la main |
| Examiner à la main seulement si la vérification échoue | Direction | Dans l’application | Clients › fiche › Valider le statut professionnel (exception) |
| Appliquer la remise professionnelle aux devis suivants | Application (automatique) | Dans l’application | Seulement après validation |
| Retrouver ses devis, commandes et factures | Visiteur / Client | Dans l’application | Espace client |
| Envoyer un lien valable 1 heure pour choisir un nouveau mot de passe | Application (automatique) | Dans l’application | Réponse identique que l’adresse existe ou non |
| Choisir un nouveau mot de passe | Visiteur / Client | Dans l’application | Déconnecte les autres appareils et prévient le client par e-mail |
| Fermer son espace (mot de passe demandé) | Visiteur / Client | Dans l’application | Espace client › Fermer mon espace |
| Anonymiser la fiche, garder les factures, libérer l’adresse | Application (automatique) | Dans l’application | Les factures sont conservées 10 ans (obligation légale) |

## 3. Configurateur : faisabilité contrôlée, prix et date estimée

Le client dessine sa pièce. L’application vérifie tout, l’aide à corriger, calcule le prix et une date estimée ; au-delà de ses limites, il passe par une demande de contact.

Schéma : [image](03-configurateur.svg) · [fichier BPMN](03-configurateur.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Choisir ou dessiner la pièce, la matière, le coloris, la longueur, la quantité | Visiteur / Client | Dans l’application | Site public › Configurateur (prix en direct, vue 3D) |
| Vérifier les limites : plis, angles, cote minimale, développé, longueur | Application (automatique) | Dans l’application | Limites paramétrables dans « Façonnage et conditions » |
| Dire quelle limite est dépassée, sur le champ concerné | Application (automatique) | Dans l’application | Message précis ; la proposition de correction chiffrée reste à faire |
| Vérifier la quantité et la charge de l’atelier | Application (automatique) | Pas encore | Plafond de quantité et capacité par jour : en attente des données de l’atelier |
| Calculer le prix, la livraison et la date estimée | Application (automatique) | En partie | Date = jour + délai standard ; pas encore selon la quantité, le stock ni la charge |
| Envoyer une demande de contact avec sa pièce | Visiteur / Client | Dans l’application | La pièce choisie est jointe à la demande (voir « Demande de contact ») |
| Traiter la demande hors limites | Direction | Dans l’application | Site vitrine › Demandes reçues |

## 4. Devis depuis l’espace client

Le client enregistre son devis numéroté, l’accepte ou le refuse en ligne. L’acceptation valide la commande toute seule ; la direction est seulement prévenue, dans les deux cas.

Schéma : [image](04-devis-en-ligne.svg) · [fichier BPMN](04-devis-en-ligne.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Enregistrer son devis depuis le configurateur (compte nécessaire) | Visiteur / Client | Dans l’application | Voir « Espace client » ; la pièce est conservée |
| Créer la commande et éditer le devis PDF numéroté | Application (automatique) | Dans l’application | Numérotation continue D-AAAA-NNNN |
| Prévenir la direction par e-mail | Application (automatique) | Dans l’application | Alerte « Devis demandé depuis l’espace client » |
| Accepter le devis dans son espace | Visiteur / Client | Dans l’application | Espace client › commande › Accepter le devis |
| Valider la commande tout de suite, sans passer par la direction | Application (automatique) | Pas encore | Aujourd’hui la direction valide à la main (un clic depuis le devis) ; devis encore valable et prix inchangés |
| Prévenir la direction : devis accepté, commande validée | Application (automatique) | En partie | Alerte envoyée, mais elle dit encore « attend votre validation » |
| Refuser le devis | Visiteur / Client | Dans l’application | La commande reste, avec la réponse du client |
| Prévenir la direction du refus par e-mail | Application (automatique) | Dans l’application | Alerte « Devis refusé par … » avec un lien vers la commande |

## 5. Commande payée en ligne (sur mesure ou boutique)

Le client paie par carte avant que la commande n’existe : elle naît validée, avec une date estimée, sans intervention de l’atelier.

Schéma : [image](05-commande-en-ligne.svg) · [fichier BPMN](05-commande-en-ligne.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Se connecter et lancer le paiement | Visiteur / Client | Dans l’application | Compte nécessaire ; prix recalculé par le serveur, jamais envoyé par le navigateur |
| Figer le panier et ouvrir la page de paiement hébergée | Application (automatique) | Dans l’application | Aucune donnée de carte ne passe par l’application |
| Payer par carte sur la page du prestataire | Visiteur / Client | Dans l’application | Authentification de la banque si elle la demande |
| Contrôler et débiter la carte | Prestataire de paiement | En partie | Essayé avec le mode test de Stripe ; le compte du client se branche à la mise en service |
| Recevoir la confirmation signée du prestataire | Application (automatique) | Dans l’application | Seule preuve du paiement ; une notification falsifiée ou rejouée est ignorée |
| Créer la commande déjà validée avec sa date estimée | Application (automatique) | Dans l’application | Elle n’existe qu’après le paiement |
| Envoyer la confirmation au client et l’alerte à la direction | Application (automatique) | Dans l’application | E-mails mis en page, sans publicité |
| Fabriquer (voir « Fabrication ») | Atelier | Dans l’application | Arrive dans « À lancer » |
| Ne rien créer, garder le panier | Application (automatique) | Dans l’application | Message au retour sur le site : paiement annulé, aucune somme débitée |
| Suivre sa commande dans son espace | Visiteur / Client | Dans l’application | Étapes, date estimée, paiement |

## 6. Commande saisie par la direction

Un client appelle ou écrit ; la direction saisit la commande, fait le devis, la fait valider ou l’annule.

Schéma : [image](06-commande-direction.svg) · [fichier BPMN](06-commande-direction.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Retrouver ou créer la fiche client | Direction | Dans l’application | Clients (particulier ou professionnel, chantiers) |
| Saisir les pièces (cotes, angles, matière, coloris, accessoires) | Direction | Dans l’application | Commandes › Nouvelle commande |
| Chiffrer, calculer le délai et les frais de livraison (distance par la route) | Application (automatique) | Dans l’application | Remise quantité et remise pro automatiques |
| Faire le devis PDF et l’envoyer au client | Direction | Dans l’application | Message sans pièce jointe : le devis se retrouve dans l’espace client |
| Noter l’acceptation et valider la commande en un clic | Direction | Dans l’application | Devis › Accepté par le client |
| Modifier les pièces si besoin (avant validation) | Direction | Dans l’application | Commande › Modifier les pièces |
| Annuler la commande en notant la raison | Direction | Dans l’application | Commande › Annuler (la raison est gardée) |

## 7. Refus d’une commande payée et remboursement

Cas exceptionnel : une commande déjà payée ne peut pas être réalisée. La direction la refuse, le client est remboursé en totalité et prévenu.

Schéma : [image](07-refus-remboursement.svg) · [fichier BPMN](07-refus-remboursement.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Refuser la commande en notant le motif | Direction | Dans l’application | Commande › Refuser et rembourser |
| Demander le remboursement intégral au prestataire | Application (automatique) | Dans l’application | Remboursement sur le moyen de paiement utilisé |
| Rembourser la carte du client | Prestataire de paiement | En partie | Vérifié avec le mode test de Stripe |
| Émettre l’avoir correspondant | Application (automatique) | Dans l’application | Numérotation continue |
| Passer la commande à « annulée » et tenir le journal | Application (automatique) | Dans l’application | Qui, quand, pourquoi |
| Prévenir le client avec le motif et le délai d’arrivée des fonds | Application (automatique) | Dans l’application | E-mail mis en page |
| Recevoir le remboursement sur son compte | Visiteur / Client | Hors application | Quelques jours selon sa banque |

## 8. Fabrication à l’atelier

L’atelier voit les commandes en quatre colonnes, en prend une en charge, fabrique, puis la marque prête. Chaque carte montre le client, les pièces et les retards.

Schéma : [image](08-fabrication.svg) · [fichier BPMN](08-fabrication.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Voir les commandes par étape : à lancer, en fabrication, prêtes à retirer, prêtes à livrer | Atelier | Dans l’application | Fabrication ; retards signalés par une pastille et un compteur |
| Prendre la commande en charge, ou annuler / reprendre celle d’un collègue | Atelier | Dans l’application | Rien ne lie une commande à un salarié |
| Imprimer la fiche de fabrication (QR code du site, option) | Atelier | Dans l’application | Fabrication › Imprimer la fiche (PDF) : nom du client, jamais l’adresse ni les prix |
| Conseiller la feuille à prendre : chutes d’abord, moins de perte | Application (automatique) | Dans l’application | Fabrication › Feuilles à prendre |
| Lancer la fabrication | Atelier | Dans l’application | Bouton « Lancer la fabrication » : prend aussi la commande en charge |
| Décompter les feuilles utilisées du stock | Application (automatique) | Pas encore | Aujourd’hui saisi à la main dans Stock de feuilles |
| Découper et plier les pièces | Atelier | Hors application | Travail sur machine |
| Confirmer les chutes obtenues et les remettre au stock | Atelier | Pas encore | Décidé : le nombre de chutes se confirme à la fin de la fabrication |
| Contrôler les pièces (cotes, angles) | Atelier | Hors application | Aucun contrôle qualité enregistré |
| Marquer la commande prête | Atelier | Dans l’application | Le client voit « Prête » dans son espace |
| Prévenir le client par e-mail que sa commande est prête | Application (automatique) | Pas encore | Aujourd’hui il le voit seulement dans son espace |

## 9. Livraison et retrait

La commande prête est retirée à l’atelier ou livrée sur chantier.

Schéma : [image](09-livraison.svg) · [fichier BPMN](09-livraison.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Venir chercher la commande à l’atelier | Visiteur / Client | Hors application | Le mode « retrait » est choisi à la commande |
| Fournir l’adresse, la distance et les frais de livraison | Application (automatique) | Dans l’application | Calculés à la commande (distance par la route) |
| Planifier la tournée et livrer sur chantier | Direction | Pas encore | Pas de planning de tournées dans l’application |
| Éditer le bon de livraison | Direction | Pas encore | Prévu : nouveau type de document |
| Signer la réception | Visiteur / Client | Pas encore | Pas de signature de réception |
| Marquer la commande retirée ou livrée | Atelier | Dans l’application | Le bouton dit « Marquer retirée » ou « Marquer livrée » selon le mode ; elle quitte Fabrication |

## 10. Définir les références de feuilles et leurs codes-barres

La direction décrit les feuilles que l’atelier reçoit (matière, coloris, format) et leurs codes-barres, pour que la réception les reconnaisse au scan.

Schéma : [image](10-materiaux.svg) · [fichier BPMN](10-materiaux.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Saisir la matière, l’épaisseur, le coloris, le format et le code-barres | Direction | Dans l’application | Direction › Matériaux (champs libres, suggestions du catalogue) |
| Les créer au catalogue, inactifs et à prix zéro | Application (automatique) | Dans l’application | Jamais vendables à zéro euro : la direction les complète dans Tarifs et catalogue |
| Créer la référence à zéro en stock, avec son code | Application (automatique) | Dans l’application | Un code désigne une référence ; un code déjà pris est refusé |
| Ajouter ou retirer des codes-barres, chercher une référence | Direction | Dans l’application | Plusieurs codes possibles pour une référence ; scan ou saisie |
| Archiver une référence qui n’est plus utilisée | Direction | Dans l’application | Jamais supprimée : l’historique s’y rapporte ; possible seulement à zéro |
| Importer toutes les références d’un coup (fichier) | Direction | Pas encore | Décidé : plus tard |

## 11. Réception de marchandise au scan

L’atelier reçoit des feuilles : il scanne le code-barres d’une feuille et indique le nombre reçu. Le stock monte, la réception est tracée.

Schéma : [image](11-reception.svg) · [fichier BPMN](11-reception.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Décharger et contrôler la livraison | Atelier | Hors application | Contrôle sur place |
| Scanner le code-barres d’une feuille (caméra du téléphone) ou le saisir | Atelier | Dans l’application | Atelier › Réception ; la caméra demande une connexion sécurisée (HTTPS) |
| Associer le code à une référence ou en créer une | Atelier | Dans l’application | Le code est reconnu aux réceptions suivantes |
| Indiquer le nombre de feuilles reçues et une note (bon de livraison) | Atelier | Dans l’application | Un code = une feuille ; on scanne une fois et on indique la quantité |
| Augmenter le stock et tracer l’entrée (qui, quand, quelle note) | Application (automatique) | Dans l’application | Dernières réceptions affichées à côté |
| Passer au code suivant | Atelier | Dans l’application | La caméra est prête pour la feuille suivante |
| Commander des feuilles au fournisseur | Atelier | Hors application | Reste dans l’outil indépendant du client : l’application ne gère pas les commandes fournisseur |

## 12. Suivi du stock de feuilles

Voir ce qu’il reste, être prévenu quand le stock baisse, compter, et tenir les chutes à part des feuilles entières.

Schéma : [image](12-stock.svg) · [fichier BPMN](12-stock.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Voir les feuilles par matière, coloris, format ou état | Atelier | Dans l’application | Atelier › Stock de feuilles (filtres, état vide / critique / bas / ok) |
| Signaler le stock bas (seuil par référence, aucune alerte sur une chute) | Application (automatique) | Dans l’application | Seuil réglable sur chaque carte |
| Ajuster : entrée, sortie, perte, chute récupérée | Atelier | Dans l’application | Chaque mouvement garde qui, quand et pourquoi |
| Faire l’inventaire (quantité comptée) | Atelier | Dans l’application | Sert aussi à saisir le stock de départ |
| Décompter automatiquement ce qu’une commande consomme | Application (automatique) | Pas encore | Décidé : au lancement, avec confirmation des chutes à la fin |
| Consulter l’historique des mouvements | Direction | Dans l’application | Stock de feuilles › Historique |
| Estimer la date d’une commande selon le stock disponible | Application (automatique) | Pas encore | Si les feuilles manquent : délai standard + délai du fournisseur (données à recueillir) |

## 13. Facturation et encaissement

De la commande livrée à la facture payée, avec avoir et export pour le comptable. Aucun document n’est joint aux e-mails.

Schéma : [image](13-facturation.svg) · [fichier BPMN](13-facturation.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Facturer la commande | Direction | Dans l’application | Commande › Facturer (numérotation F-AAAA-NNNN sans trou) |
| Éditer la facture PDF, avec le fichier Factur-X | Application (automatique) | Dans l’application | Checklist des mentions obligatoires, QR code du site |
| Prévenir le client par e-mail (sans pièce jointe) | Direction | Dans l’application | Le message renvoie vers l’espace client, ou l’invite à l’activer |
| Consulter et télécharger sa facture dans son espace | Visiteur / Client | Dans l’application | Espace client › Factures |
| Payer (virement, chèque, espèces, carte) | Visiteur / Client | Hors application | Le règlement hors ligne se fait hors de l’application |
| Enregistrer le paiement (date, mode) | Direction | Dans l’application | Facture › Enregistrer le paiement (annulable) |
| Relancer le client par e-mail | Direction | Pas encore | Pas de relance automatique ni de liste des impayés |
| Faire un avoir (total) | Direction | Dans l’application | Facture › Faire un avoir ; l’avoir partiel est à faire |
| Exporter les ventes et encaissements pour le comptable | Direction | Dans l’application | Devis et factures › Exporter pour le comptable (CSV) |

## 14. Pilotage et statistiques

Lire l’activité dans la durée : ventes par groupe, visites du site, entrées et sorties d’argent, délais tenus, comparaison de périodes, règles d’alerte. Nécessite de la donnée collectée.

Schéma : [image](14-statistiques.svg) · [fichier BPMN](14-statistiques.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Collecter les visites du site (anonymes, sans cookie) | Application (automatique) | Pas encore | Rien n’est mesuré aujourd’hui (ticket Statistiques) |
| Saisir le prix d’achat à la réception et les autres dépenses | Atelier | Pas encore | Aucun prix d’achat ni dépense dans l’application |
| Choisir une période et un intervalle (jour, semaine, mois) | Direction | Pas encore | Une seule vue commune à tous les écrans |
| Calculer les ventes par matière, coloris, modèle ; le chiffre d’affaires, le panier moyen | Application (automatique) | Pas encore | Les données de commandes existent déjà |
| Comparer la date estimée et la date réelle de fin : délais tenus | Application (automatique) | Pas encore | Les deux dates sont déjà enregistrées |
| Comparer deux périodes (mois, années) | Direction | Pas encore | Superposition de courbes |
| Signaler un coloris ou une matière sans vente depuis longtemps | Application (automatique) | Pas encore | Règles d’alerte réglables ; suggestion de désactiver ou solder |

## 15. Équipe : arrivée et départ d’un salarié

Fiche du salarié, compte personnel, droits par sections, puis désactivation au départ.

Schéma : [image](15-equipe.svg) · [fichier BPMN](15-equipe.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Créer la fiche du salarié (contrat, dates, contact) | Direction | Dans l’application | Équipe › Salariés (la direction y a accès) |
| Créer son compte personnel et cocher ses sections : Ventes, Atelier, Direction | Direction | Dans l’application | Seul l’administrateur crée des comptes ; sections cumulables |
| Générer un mot de passe temporaire, à changer à la première connexion | Application (automatique) | Dans l’application | Le salarié ne peut rien faire d’autre avant ; jamais envoyé par e-mail |
| Se connecter et choisir son mot de passe | Atelier | Dans l’application | Indicateur de robustesse |
| Changer ses droits ou lui donner un nouveau mot de passe temporaire | Direction | Dans l’application | Administration › Comptes |
| Enregistrer le départ : désactiver le compte | Direction | Dans l’application | Déconnexion immédiate de tous ses appareils |
| Garder l’historique et noter chaque action au journal | Application (automatique) | Dans l’application | Journal d’activité (qui, quoi, quand) |

## 16. Paramétrage par la direction

Tarifs, catalogue, documents : ce que la direction règle sans développeur, en gardant simple ce qui change souvent.

Schéma : [image](16-parametrage.svg) · [fichier BPMN](16-parametrage.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Régler matières, coloris, façonnage, accessoires, livraison | Direction | Dans l’application | Tarifs et catalogue (désactivable sans effacer) ; prix de la boutique en TTC, du sur-mesure en HT |
| Régler les limites de pliage et les modèles de pièces | Direction | Dans l’application | Catalogue › Modèles de pièces |
| Régler l’entreprise, le modèle des documents, la numérotation | Direction | Dans l’application | Modèles de documents (la numérotation se verrouille au premier document) |
| Régler les limites par matière, la quantité maximale et le délai selon la quantité | Direction | Pas encore | En attente des données des machines de l’atelier |
| Déclarer les jours fériés et les fermetures | Direction | Pas encore | Le délai annoncé saute les week-ends, pas les jours fériés |
| Appliquer tout de suite aux prochains devis, commandes et au site | Application (automatique) | Dans l’application | Les documents déjà émis ne changent pas |

## 17. Faire vivre le site vitrine et la boutique

Produits de la boutique, photos, textes du site et alertes de la messagerie. Les pages légales ne se modifient pas : elles suivent les versions de l’application.

Schéma : [image](17-site-vitrine.svg) · [fichier BPMN](17-site-vitrine.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Créer le produit, ses déclinaisons, ses prix TTC et sa photo | Direction | Dans l’application | Produits (import de catalogue, copie, prix en lot) |
| Modifier les textes principaux et ranger les photos du site | Direction | Dans l’application | Site vitrine › Textes et Photos (rétablissement du texte d’origine possible) |
| Publier tout de suite sur le site | Application (automatique) | Dans l’application | Sans redéploiement |
| Lire et traiter les demandes de contact reçues | Direction | Dans l’application | Site vitrine › Demandes reçues |
| Voir les messages envoyés et leur aperçu, s’envoyer un exemple | Direction | Dans l’application | Site vitrine › E-mails |
| Mettre à jour les pages légales avec les versions de l’application | Maintenance (nous) | Hors application | Mentions légales, confidentialité, cookies, conditions de vente ; hébergeur et médiateur réglés à l’installation |

## 18. Messages envoyés par l’application

Les e-mails automatiques : à qui, quand, avec quelles règles. Jamais de publicité, jamais de document joint, jamais de mot de passe.

Schéma : [image](18-messages.svg) · [fichier BPMN](18-messages.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Bienvenue, activation de l’espace, mot de passe oublié, mot de passe modifié | Application (automatique) | Dans l’application | Liens à usage unique ; message de sécurité à chaque changement de mot de passe |
| Commande confirmée, commande refusée et remboursée | Application (automatique) | Dans l’application | Récapitulatif, date estimée, bouton vers l’espace client |
| Devis, facture ou avoir disponible dans l’espace client | Application (automatique) | Dans l’application | Aucune pièce jointe ; envoyé par la direction, texte modifiable |
| Commande prête, accusé de réception d’une demande de contact | Application (automatique) | Pas encore | Pas encore envoyés au client |
| Lire le message (rappel de sécurité et lien vers son espace) | Visiteur / Client | Dans l’application | Version mise en page et version texte |
| Alerter l’équipe : commande payée, demande de contact, devis demandé ou répondu | Application (automatique) | Dans l’application | Alertes envoyées aux adresses réglées pour l’équipe |
| Lire l’alerte et ouvrir la commande ou la demande | Direction | Dans l’application | Bouton direct dans le message |
| Vérifier le rendu de chaque message et se l’envoyer | Direction | Dans l’application | Site vitrine › E-mails › Aperçu des messages (13 modèles) |

## 19. Mise en service chez un client

Ce que nous installons et ce que le client renseigne avant de s’en servir : entreprise, numérotation, tarifs, équipe, références, stock de départ, site.

Schéma : [image](19-mise-en-service.svg) · [fichier BPMN](19-mise-en-service.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Installer l’application, créer le compte administrateur, régler les secrets (e-mail, paiement) | Maintenance (nous) | En partie | Docker prêt ; domaine HTTPS et serveur chez le client à finaliser |
| Renseigner l’hébergeur et le médiateur des pages légales | Maintenance (nous) | Dans l’application | Deux réglages d’installation |
| Saisir l’entreprise, le logo, le modèle des documents, la numérotation de départ | Direction | Dans l’application | Le dernier numéro de facture de l’ancien outil se saisit avant le premier document |
| Saisir les tarifs, matières, coloris, modèles de pièces, accessoires, livraison | Direction | Dans l’application | Tarifs et catalogue |
| Créer les salariés et leurs comptes | Direction | Dans l’application | Équipe › Salariés, Administration › Comptes |
| Définir les références de feuilles et leurs codes-barres | Direction | Dans l’application | Direction › Matériaux |
| Compter les feuilles présentes (stock de départ) | Atelier | Dans l’application | Stock de feuilles › Compter |
| Remplir le site : produits, textes, photos | Direction | Dans l’application | Produits, Site vitrine |
| Importer les clients et l’historique de l’ancien outil | Direction | Pas encore | Facultatif ; dépend de la forme des données existantes |
| Brancher le prestataire de paiement du client et faire un paiement de test | Maintenance (nous) | En partie | Stripe essayé en test ; le choix du prestataire se fait avec le client |
| Former les utilisateurs | Maintenance (nous) | Hors application | Se fait sur place avec les écrans réels |

## 20. Sauvegarde et exploitation

La sécurité des données et la maintenance au quotidien, sur le serveur du client.

Schéma : [image](20-exploitation.svg) · [fichier BPMN](20-exploitation.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Sauvegarder la base de données (documents compris) | Application (automatique) | Dans l’application | Les PDF, photos et références sont dans la base |
| Vérifier que la sauvegarde est lisible | Application (automatique) | Dans l’application | Toutes les tables sont contrôlées |
| Copier la sauvegarde hors de la machine (NAS du client) | Application (automatique) | Pas encore | Prévu avec le déploiement (M3) |
| Restaurer la base | Maintenance (nous) | Dans l’application | Commande de restauration documentée |
| Surveiller et alerter (e-mail, supervision) | Application (automatique) | Pas encore | Prévu avec le déploiement (M3) |
| Se connecter à distance pour la maintenance (réseau privé, sans port ouvert) | Maintenance (nous) | En partie | Raspberry Pi et accès à distance prévus |
| Installer une nouvelle version, avec retour arrière possible | Maintenance (nous) | Pas encore | Versions et déploiement (tickets D1 à D9) |
