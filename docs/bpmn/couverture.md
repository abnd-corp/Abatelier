# Couverture des besoins métier

> Généré par `node scripts/bpmn/generer.mjs` à partir de `scripts/bpmn/processus.mjs`. Ne pas modifier à la main.

Les 36 processus de l’atelier sont décrits en BPMN (voir [README](README.md)). Chaque étape est classée selon ce que fait l’application aujourd’hui.

| Couverture | Étapes | Part |
|---|---|---|
| Dans l’application | 117 | 48 % |
| En partie | 19 | 8 % |
| Pas encore | 97 | 39 % |
| Hors application | 13 | 5 % |
| **Total** | **246** | |

## Ce qu’il reste à faire pour couvrir tout le besoin

- **Demande de contact** : Proposer d’abord les services en ligne et les réponses aux questions fréquentes (pas encore) : En tête de la page Contact : liens vers configurateur, devis, commande ; délais, matières, livraison
- **Demande de contact** : Enregistrer la demande et notifier la direction dans la plateforme (en partie) : Notification avec le plan, la pièce choisie dans le configurateur et un lien. Aujourd’hui par e-mail ; passe dans les notifications de la plateforme
- **Demande de contact** : Envoyer un accusé de réception au visiteur, avec les liens utiles (pas encore) : Aujourd’hui seule l’équipe est prévenue
- **Espace client : création, activation, mot de passe, fermeture** : Vérifier le SIRET dans l’annuaire officiel des entreprises (en activité, nom concordant) (pas encore) : Annuaire public et gratuit (recherche-entreprises.api.gouv.fr) ; le n° de TVA se contrôle avec VIES. Aujourd’hui la direction vérifie à la main
- **Configurateur : faisabilité contrôlée, prix et date estimée** : Vérifier la quantité et la charge de l’atelier (pas encore) : Plafond de quantité et capacité par jour : en attente des données de l’atelier
- **Configurateur : faisabilité contrôlée, prix et date estimée** : Calculer le prix, la livraison et la date estimée (en partie) : Date = jour + délai standard ; pas encore selon la quantité, le stock ni la charge
- **Devis depuis l’espace client** : Notifier la direction dans la plateforme : devis demandé (en partie) : Aujourd’hui par e-mail ; passe dans les notifications de la plateforme
- **Devis depuis l’espace client** : Valider la commande tout de suite, sans passer par la direction (pas encore) : Aujourd’hui la direction valide à la main (un clic depuis le devis) ; devis encore valable et prix inchangés
- **Devis depuis l’espace client** : Notifier la direction dans la plateforme : devis accepté, commande validée (en partie) : Aujourd’hui par e-mail ; passe dans les notifications de la plateforme ; le texte dit encore « attend votre validation »
- **Devis depuis l’espace client** : Annuler la commande toute seule (motif : devis refusé par le client) (pas encore) : Aujourd’hui la commande reste ouverte et la direction doit l’annuler à la main
- **Devis depuis l’espace client** : Notifier la direction dans la plateforme : devis refusé (en partie) : Avec un lien vers la commande, pour information. Aujourd’hui par e-mail ; passe dans les notifications de la plateforme
- **Commande payée en ligne (sur mesure ou boutique)** : Garder le panier dans le compte du client, retrouvé sur tous ses appareils (pas encore) : Aujourd’hui le panier reste dans le navigateur : il ne suit ni le compte ni l’appareil ; à la connexion, on fusionne les deux
- **Commande payée en ligne (sur mesure ou boutique)** : Contrôler et débiter la carte (en partie) : Essayé avec le mode test de Stripe ; le compte du client se branche à la mise en service
- **Commande payée en ligne (sur mesure ou boutique)** : Confirmer au client par e-mail et notifier la direction dans la plateforme (en partie) : E-mail client mis en page, sans publicité. Notification direction : aujourd’hui par e-mail
- **Commande saisie par la direction pour un client** : Éditer le devis numéroté et envoyer au client le lien d’accès à son espace (en partie) : Devis et lien d’activation existent ; l’envoi des deux ensemble, en un seul geste, est à faire
- **Commande saisie par la direction pour un client** : Valider la commande tout de suite, sans passer par la direction (pas encore) : Même règle que « Devis depuis l’espace client »
- **Commande saisie par la direction pour un client** : Annuler la commande toute seule (motif : devis refusé par le client) (pas encore) : Même règle que « Devis depuis l’espace client »
- **Commande saisie par la direction pour un client** : Notifier la direction dans la plateforme : devis refusé (en partie) : Avec un lien vers la commande, pour information. Aujourd’hui par e-mail ; passe dans les notifications de la plateforme
- **Refus d’une commande payée et remboursement** : Rembourser la carte du client (en partie) : Vérifié avec le mode test de Stripe
- **Fabrication à l’atelier** : Décompter les feuilles utilisées du stock (pas encore) : Aujourd’hui saisi à la main dans Stock de feuilles
- **Fabrication à l’atelier** : Confirmer les chutes obtenues et les remettre au stock (pas encore) : Décidé : le nombre de chutes se confirme à la fin de la fabrication
- **Fabrication à l’atelier** : Prévenir le client par e-mail que sa commande est prête (pas encore) : Aujourd’hui il le voit seulement dans son espace
- **Écran d’affichage de l’atelier** : Servir la page seulement depuis le réseau interne, jamais depuis internet (pas encore) : Restriction au niveau du réseau (pas seulement dans l’application : l’adresse d’un visiteur peut être falsifiée derrière un relais)
- **Écran d’affichage de l’atelier** : Afficher les commandes en colonnes : À lancer, En fabrication, Prêtes (pas encore) : Lecture seule, sans menu ni bouton, lisible de loin (grands caractères, thème sombre)
- **Écran d’affichage de l’atelier** : Montrer le numéro, les pièces, la date prévue et les retards, jamais le nom du client (pas encore) : Règle de l’atelier : on voit la commande, jamais le client
- **Écran d’affichage de l’atelier** : Se rafraîchir toute seule et signaler une coupure (pas encore) : Un message clair si la connexion au serveur est perdue, pour ne pas lire une information périmée
- **Écran d’affichage de l’atelier** : Regarder l’écran pour savoir quoi lancer et ce qui est en retard (pas encore) : Rien à saisir : les gestes se font sur la page Fabrication, avec connexion
- **Plan visuel de l’atelier dans l’application** : Ouvrir le plan dans le menu de l’atelier (pas encore) : Page réservée à la direction (nouvelle permission) ; lisible sur téléphone et tablette
- **Plan visuel de l’atelier dans l’application** : Placer chaque commande dans son lieu : à lancer, sur une machine, prête, à retirer (pas encore) : Lecture des commandes réelles ; le nom du client n’apparaît pas
- **Plan visuel de l’atelier dans l’application** : Montrer le stock sur les racks et signaler les références sous leur seuil (pas encore) : Lecture du stock réel et des seuils déjà réglés
- **Plan visuel de l’atelier dans l’application** : Montrer les arrivages : le camion de feuilles sur le parking pendant la réception (pas encore) : Lit les réceptions en cours
- **Plan visuel de l’atelier dans l’application** : Cliquer une commande ou un rack pour ouvrir sa page (pas encore) : Mène à la commande, ou à la référence de feuille
- **Plan visuel de l’atelier dans l’application** : Placer les machines, les racks et les pièces sur le plan (une fois) (pas encore) : Dépend de la liste des machines et du plan fourni par le client
- **Livraison et retrait** : Générer le code-barres du colis et l’étiquette à imprimer (pas encore) : Un code par colis (ou par commande, à cadrer) ; l’atelier imprime l’étiquette et la colle sur le colis
- **Livraison et retrait** : Grouper les colis et préparer la tournée du salarié livreur (pas encore) : Les livraisons sont faites par des salariés avec le camion de l’entreprise ; groupes de pièces et ordre de passage à définir avec le client
- **Livraison et retrait** : Éditer le bon de livraison (pas encore) : Prévu : nouveau type de document ; gardé avec la commande une fois signé
- **Livraison et retrait** : Scanner le code-barres du colis à la remise (caméra du téléphone) (pas encore) : Comme pour la réception des feuilles ; sans le scan, la remise n’est pas validée
- **Livraison et retrait** : Signer la réception sur l’écran du salarié (pas encore) : Signature gardée avec la commande ; que faire d’un client absent est à définir
- **Livraison et retrait** : Valider la remise : la commande passe à « Livrée » ou « Retirée » (en partie) : Aujourd’hui un bouton « Marquer livrée » ou « Marquer retirée » ; avec le scan et la signature, plus de bouton à presser
- **Faire vivre les références de feuilles (facultatif)** : Importer toutes les références d’un coup (fichier) (pas encore) : Décidé : plus tard
- **Commande de feuilles au fournisseur** : Enregistrer la commande passée : fournisseur, références, nombre de feuilles de chaque lot, date de livraison prévue (pas encore) : À étudier : voir d’abord comment l’atelier commande, puis importer la commande (fichier ou e-mail du fournisseur) plutôt que la ressaisir
- **Commande de feuilles au fournisseur** : Afficher « en commande » sur chaque référence et préparer les quantités attendues à la réception (pas encore) : Permet la comparaison entre commandé et reçu
- **Commande de feuilles au fournisseur** : Notifier la direction si la livraison n’arrive pas à la date prévue (pas encore) : Notification dans la plateforme
- **Réception de marchandise au scan** : Ouvrir la commande fournisseur attendue (pas encore) : Reprend aussi une réception laissée en attente
- **Réception de marchandise au scan** : Comparer à la commande : ce qui reste à recevoir (pas encore) : Dépend de « Commande de feuilles au fournisseur »
- **Réception de marchandise au scan** : Clore la commande fournisseur (pas encore) : Les feuilles attendues disparaissent de « en commande »
- **Réception de marchandise au scan** : Notifier la direction de l’écart (manque ou surplus) (pas encore) : Notification dans la plateforme
- **Réception de marchandise au scan** : Suspendre la réception, la reprendre au camion suivant (pas encore) : Livraison en plusieurs camions : on sort de la réception sans perdre ce qui est scanné
- **Suivi du stock de feuilles** : Décompter automatiquement ce qu’une commande consomme (pas encore) : Décidé : au lancement, avec confirmation des chutes à la fin
- **Suivi du stock de feuilles** : Estimer la date d’une commande selon le stock disponible (pas encore) : Si les feuilles manquent : délai standard + délai du fournisseur (données à recueillir)
- **Facturation et encaissement** : Détecter la remise et émettre la facture toute seule (en partie) : Aujourd’hui la direction clique sur « Facturer » ; numérotation F-AAAA-NNNN sans trou
- **Facturation et encaissement** : Prévenir le client par e-mail : sa facture est dans son espace (sans pièce jointe) (en partie) : Le message existe ; il part aujourd’hui sur geste de la direction
- **Facturation et encaissement** : Marquer la facture payée avec la confirmation du prestataire de paiement (pas encore) : Le paiement en ligne est déjà enregistré ; la facture n’est pas encore marquée payée toute seule
- **Facturation et encaissement** : Relancer le client par e-mail : rappel à l’échéance, puis relances (pas encore) : Pas de relance automatique ni de liste des impayés
- **Facturation et encaissement** : Constater le paiement sans saisie de la direction (par exemple en lisant le relevé bancaire) (pas encore) : À définir avec le client ; aujourd’hui la direction enregistre le paiement à la main
- **Statistiques : chiffres clés et ventes** : Choisir une période et un intervalle (jour, semaine, mois) (pas encore) : Sélecteur commun à toutes les vues de statistiques
- **Statistiques : chiffres clés et ventes** : Calculer le chiffre d’affaires, le nombre de commandes, le panier moyen, les devis acceptés (pas encore) : Les données de commandes existent déjà
- **Statistiques : chiffres clés et ventes** : Répartir les ventes par matière, coloris, modèle de pièce, sur mesure ou boutique (pas encore) : Les lignes de commande gardent déjà ces informations
- **Statistiques : chiffres clés et ventes** : Lire les chiffres, les courbes et le classement des références (pas encore) : Accès réservé à la direction (permission stats.read) ; lisible sur téléphone
- **Statistiques : audience du site et entonnoir** : Compter les visites et les pages vues, sans cookie ni adresse IP conservée (pas encore) : Compteur anonyme agrégé par jour et par page, à valider côté RGPD / CNIL
- **Statistiques : audience du site et entonnoir** : Écarter les robots : agents connus, requêtes sans navigateur réel, volume anormal (pas encore) : Aucun filtre n’est parfait : on obtient un bon ordre de grandeur, pas un chiffre exact
- **Statistiques : audience du site et entonnoir** : Distinguer le visiteur anonyme du client connecté à son espace (pas encore) : Seule la session de l’espace client le permet ; un visiteur anonyme le reste, sans cookie ni suivi
- **Statistiques : audience du site et entonnoir** : Enregistrer les abandons du configurateur et du panier, les devis refusés ou expirés et leur motif (pas encore) : Sert au taux de conversion ; un robot ne demande ni devis ni paiement
- **Statistiques : audience du site et entonnoir** : Calculer l’entonnoir : visite, configurateur, devis, commande (pas encore) : Aussi les demandes de contact
- **Statistiques : audience du site et entonnoir** : Lire l’audience et l’entonnoir (pas encore) : Accès réservé à la direction (permission stats.read) ; lisible sur téléphone
- **Statistiques : dépenses, entrées et marge** : Saisir le prix d’achat à la réception de chaque lot (pas encore) : Aucun prix d’achat dans l’application aujourd’hui
- **Statistiques : dépenses, entrées et marge** : Saisir les autres dépenses par catégorie (pas encore) : Les catégories de dépenses sont à définir avec la direction
- **Statistiques : dépenses, entrées et marge** : Calculer les entrées (paiements, factures), les sorties et le solde (pas encore) : Les paiements et factures sont déjà horodatés
- **Statistiques : dépenses, entrées et marge** : Calculer la marge par matière (pas encore) : Dépend du prix d’achat
- **Statistiques : dépenses, entrées et marge** : Lire les entrées, les sorties et la marge (pas encore) : Accès réservé à la direction (permission stats.read) ; lisible sur téléphone
- **Statistiques : délais tenus et charge de l’atelier** : Mesurer les délais validée, prête, livrée et les comparer à la date estimée (pas encore) : Les dates sont déjà enregistrées
- **Statistiques : délais tenus et charge de l’atelier** : Repérer les retards et la charge par semaine (pas encore) : Aucun classement de salariés : des agrégats seulement
- **Statistiques : délais tenus et charge de l’atelier** : Calculer le rendement matière : feuilles commandées contre consommées, chutes (pas encore) : Dépend du décompte automatique du stock
- **Statistiques : délais tenus et charge de l’atelier** : Lire les délais, la charge et le rendement (pas encore) : Accès réservé à la direction (permission stats.read) ; lisible sur téléphone
- **Statistiques : consommation et rotation du stock** : Calculer la consommation par matière et coloris (pas encore) : Dépend du décompte automatique du stock
- **Statistiques : consommation et rotation du stock** : Calculer la rotation et repérer le stock dormant (pas encore) : Les mouvements de stock sont déjà horodatés
- **Statistiques : consommation et rotation du stock** : Repérer les ruptures (pas encore) : Complète l’alerte « stock bas »
- **Statistiques : consommation et rotation du stock** : Lire la consommation et le stock dormant (pas encore) : Accès réservé à la direction (permission stats.read) ; lisible sur téléphone
- **Statistiques : comparer des périodes** : Choisir deux périodes ou plus et le chiffre à comparer (pas encore) : Mêmes chiffres que les autres statistiques
- **Statistiques : comparer des périodes** : Superposer les courbes (pas encore) : Courbes lisibles sur téléphone, thème clair et sombre
- **Statistiques : comparer des périodes** : Lire l’écart (pas encore) : Accès réservé à la direction (permission stats.read) ; lisible sur téléphone
- **Statistiques : alertes sur le catalogue** : Régler les règles d’alerte (par exemple : sans vente depuis N mois) (pas encore) : À définir avec la direction : quelles actions déclenchent une alerte
- **Statistiques : alertes sur le catalogue** : Détecter un coloris ou une matière sans vente (pas encore) : Règles réglables
- **Statistiques : alertes sur le catalogue** : Notifier la direction dans la plateforme, avec une suggestion : désactiver, solder, ne plus réapprovisionner (pas encore) : Dans le centre de notifications
- **Statistiques : reprise de l’historique** : Choisir le fichier (CSV ou Excel) de l’ancien outil (pas encore) : À recueillir : quelles données existent et sous quelle forme
- **Statistiques : reprise de l’historique** : Contrôler puis importer l’historique (pas encore) : Les données personnelles ne sont pas reprises dans les statistiques
- **Statistiques : reprise de l’historique** : Vérifier les courbes dès le départ (pas encore) : Accès réservé à la direction (permission stats.read) ; lisible sur téléphone
- **Paramétrage par la direction** : Régler les limites par matière, la quantité maximale et le délai selon la quantité (pas encore) : En attente des données des machines de l’atelier
- **Paramétrer les machines de l’atelier** : Ajouter ou modifier une machine : type, longueur maximale, épaisseur par matière, cadence (pas encore) : Données à recueillir chez le client (limites des machines)
- **Paramétrer les machines de l’atelier** : Mettre une machine hors service (panne, maintenance) ou la retirer (pas encore) : La capacité baisse tant qu’elle est arrêtée
- **Paramétrer les machines de l’atelier** : Appliquer les limites des machines au contrôle du configurateur (pas encore) : Plafond de quantité, longueur et épaisseur maximales
- **Paramétrer les machines de l’atelier** : Calculer la capacité par jour pour la date estimée (pas encore) : Dépend du recensement des machines et de leurs cadences
- **Messages envoyés aux clients** : Commande prête, accusé de réception d’une demande de contact (pas encore) : Pas encore envoyés au client
- **Notifications de la direction** : Créer la notification pour chaque compte de la direction qui en a le droit (en partie) : Aujourd’hui des e-mails aux adresses réglées pour l’équipe
- **Notifications de la direction** : Envoyer un e-mail d’alerte à la direction si trop de notifications restent non lues (pas encore) : Seuil réglable ; seul cas où la direction reçoit un e-mail
- **Notifications de la direction** : Voir le nombre de notifications non lues dans le menu (pas encore) : Pastille sur une cloche, dans le menu de gauche
- **Notifications de la direction** : Ouvrir la notification : arriver directement sur la page à traiter (pas encore) : Commande, demande de contact, devis, stock : la page exacte, pas la liste
- **Notifications de la direction** : Marquer la notification comme lue, puis traitée (pas encore) : Lue pour tous les comptes ou pour chacun : à définir avec le client
- **Mise en service chez un client** : Installer l’application, créer le compte administrateur, régler les secrets (e-mail, paiement) (en partie) : Docker prêt ; domaine HTTPS et serveur chez le client à finaliser
- **Mise en service chez un client** : Importer les clients et l’historique de l’ancien outil (pas encore) : Facultatif ; dépend de la forme des données existantes
- **Mise en service chez un client** : Brancher le prestataire de paiement du client et faire un paiement de test (en partie) : Stripe essayé en test ; le choix du prestataire se fait avec le client
- **Disponibilité et supervision du serveur** : Relancer tout seul un service qui plante (en partie) : Redémarrage automatique des conteneurs prévu ; à vérifier sur le Raspberry
- **Disponibilité et supervision du serveur** : Se reconnecter au réseau (wifi) après une coupure (pas encore) : Prévu avec le déploiement
- **Disponibilité et supervision du serveur** : Redémarrer le Raspberry s’il ne répond plus (chien de garde) (pas encore) : Prévu avec le déploiement
- **Disponibilité et supervision du serveur** : Remonter l’état du serveur et de chaque service (API, base, sauvegardes, disque, température) (pas encore) : Prévu avec le déploiement
- **Disponibilité et supervision du serveur** : Alerter la maintenance (nous) (pas encore) : Prévu avec le déploiement
- **Disponibilité et supervision du serveur** : Se connecter à distance et lire l’état (réseau privé, sans port ouvert) (en partie) : Raspberry Pi et accès à distance prévus
- **Sauvegardes et test de restauration** : Copier la sauvegarde sur le NAS du client (pas encore) : Prévu avec le déploiement
- **Sauvegardes et test de restauration** : Copier une sauvegarde chez nous, hors du site (chiffrée) (pas encore) : Protège contre un vol, un incendie ou une panne sur place
- **Sauvegardes et test de restauration** : Tester la restauration : recréer une base depuis la dernière sauvegarde et la comparer (en partie) : La commande de vérification existe ; il reste à la lancer automatiquement et à alerter si elle échoue
- **Sauvegardes et test de restauration** : Tester de temps en temps un redémarrage complet de l’application depuis une sauvegarde, sur une autre machine (pas encore) : Calendrier à fixer
- **Sauvegardes et test de restauration** : Alerter la maintenance si une copie ou un test échoue (pas encore) : Prévu avec le déploiement
- **Mises à jour du système et de l’application** : Appliquer les mises à jour de sécurité du système du Raspberry, la nuit (pas encore) : Prévu avec le déploiement
- **Mises à jour du système et de l’application** : Redémarrer et vérifier que tout est reparti (pas encore) : Utilise la supervision du serveur
- **Mises à jour du système et de l’application** : Publier la nouvelle version et la déployer sur le Raspberry (pas encore) : Versions et déploiement (tickets D1 à D9)
- **Mises à jour du système et de l’application** : Contrôler la santé après déploiement et revenir à la version précédente si besoin (pas encore) : Retour arrière automatique

## 1. Demande de contact

Dernier recours : le visiteur ne passe par la direction que si le configurateur, le devis et la commande en ligne ne suffisent pas (pièce hors limites, question, cas particulier). Le reste se fait seul.

Schéma : [image](01-contact.svg) · [fichier BPMN](01-contact.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Proposer d’abord les services en ligne et les réponses aux questions fréquentes | Application (automatique) | Pas encore | En tête de la page Contact : liens vers configurateur, devis, commande ; délais, matières, livraison |
| Utiliser le configurateur, le devis ou la commande en ligne | Visiteur / Client | Dans l’application | Voir « Configurateur », « Devis » et « Commande payée en ligne » |
| Remplir le formulaire de contact (plan joint possible) | Visiteur / Client | Dans l’application | Site public › Contact (consentement RGPD demandé) |
| Enregistrer la demande et notifier la direction dans la plateforme | Application (automatique) | En partie | Notification avec le plan, la pièce choisie dans le configurateur et un lien. Aujourd’hui par e-mail ; passe dans les notifications de la plateforme |
| Envoyer un accusé de réception au visiteur, avec les liens utiles | Application (automatique) | Pas encore | Aujourd’hui seule l’équipe est prévenue |
| Retrouver ou créer la fiche client depuis la demande | Application (automatique) | Dans l’application | Bouton « Fiche client » sur la demande : retrouvée par l’adresse e-mail, sinon créée, sans doublon |
| Lire la demande et télécharger le plan | Direction | Dans l’application | Site vitrine › Demandes reçues |
| Répondre au client (téléphone ou e-mail) | Direction | Hors application | La réponse part de la messagerie habituelle |
| Marquer la demande comme traitée | Direction | Dans l’application | Site vitrine › Demandes reçues |
| Supprimer la demande au bout de 12 mois | Application (automatique) | Dans l’application | Purge automatique chaque heure des demandes de plus de 12 mois sans commande, notée au journal ; suppression à la demande de la personne aussi |

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

## 3. Connexion à l’espace client avec Google

Le client entre dans son espace en un clic avec son compte Google : l’application le reconnaît par son adresse e-mail vérifiée par Google, sans doublon, ou crée son espace après le choix particulier ou professionnel. Le mot de passe reste possible.

Schéma : [image](03-connexion-google.svg) · [fichier BPMN](03-connexion-google.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Cliquer sur « Continuer avec Google » | Visiteur / Client | Dans l’application | Pages Connexion et Créer mon espace ; bouton affiché seulement si Google est configuré |
| Envoyer le client chez Google (état, nonce et clé PKCE gardés dans un cookie signé de 10 minutes) | Application (automatique) | Dans l’application | Aucun script de Google sur le site : une simple redirection |
| Choisir son compte Google et accepter | Visiteur / Client | Hors application | Écran de Google |
| Échanger le code avec Google et contrôler le jeton (émetteur, destinataire, durée, nonce, e-mail vérifié) | Application (automatique) | Dans l’application | Au moindre doute : retour à la connexion avec un message clair, noté au journal |
| Ouvrir la session de l’espace existant | Application (automatique) | Dans l’application | Rattachement automatique de Google à l’espace qui a la même adresse, sans doublon ; noté au journal |
| Ouvrir l’espace d’une fiche créée par l’atelier | Application (automatique) | Dans l’application | Google prouve que l’adresse est la sienne : pas besoin du lien d’activation |
| Indiquer particulier ou professionnel (raison sociale) et accepter l’utilisation de ses données | Visiteur / Client | Dans l’application | Une étape après Google, mêmes règles que l’inscription |
| Créer la fiche client et l’espace sans mot de passe, envoyer le message de bienvenue | Application (automatique) | Dans l’application | Nom, prénom et e-mail repris de Google ; mot de passe possible plus tard avec « Mot de passe oublié » |
| Retrouver ses devis, commandes et factures | Visiteur / Client | Dans l’application | Espace client ; fermeture de l’espace confirmée par l’adresse e-mail faute de mot de passe |

## 4. Configurateur : faisabilité contrôlée, prix et date estimée

Le client dessine sa pièce. L’application vérifie tout, l’aide à corriger, calcule le prix et une date estimée ; au-delà de ses limites, il passe par une demande de contact.

Schéma : [image](04-configurateur.svg) · [fichier BPMN](04-configurateur.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Choisir ou dessiner la pièce, la matière, le coloris, la longueur, la quantité | Visiteur / Client | Dans l’application | Site public › Configurateur (prix en direct, vue 3D) |
| Vérifier les limites : plis, angles, cote minimale, développé, longueur | Application (automatique) | Dans l’application | Limites paramétrables dans « Façonnage et conditions » |
| Dire quelle limite est dépassée, sur le champ concerné | Application (automatique) | Dans l’application | Message précis ; la proposition de correction chiffrée reste à faire |
| Vérifier la quantité et la charge de l’atelier | Application (automatique) | Pas encore | Plafond de quantité et capacité par jour : en attente des données de l’atelier |
| Calculer le prix, la livraison et la date estimée | Application (automatique) | En partie | Date = jour + délai standard ; pas encore selon la quantité, le stock ni la charge |
| Envoyer une demande de contact avec sa pièce | Visiteur / Client | Dans l’application | La pièce choisie est jointe à la demande (voir « Demande de contact ») |
| Traiter la demande hors limites | Direction | Dans l’application | Site vitrine › Demandes reçues |

## 5. Devis depuis l’espace client

Le client enregistre son devis numéroté, l’accepte ou le refuse en ligne. L’acceptation valide la commande toute seule ; la direction est seulement prévenue, dans les deux cas.

Schéma : [image](05-devis-en-ligne.svg) · [fichier BPMN](05-devis-en-ligne.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Enregistrer son devis depuis le configurateur (compte nécessaire) | Visiteur / Client | Dans l’application | Voir « Espace client » ; la pièce est conservée |
| Créer la commande et éditer le devis PDF numéroté | Application (automatique) | Dans l’application | Numérotation continue D-AAAA-NNNN |
| Notifier la direction dans la plateforme : devis demandé | Application (automatique) | En partie | Aujourd’hui par e-mail ; passe dans les notifications de la plateforme |
| Accepter le devis dans son espace | Visiteur / Client | Dans l’application | Espace client › commande › Accepter le devis |
| Valider la commande tout de suite, sans passer par la direction | Application (automatique) | Pas encore | Aujourd’hui la direction valide à la main (un clic depuis le devis) ; devis encore valable et prix inchangés |
| Notifier la direction dans la plateforme : devis accepté, commande validée | Application (automatique) | En partie | Aujourd’hui par e-mail ; passe dans les notifications de la plateforme ; le texte dit encore « attend votre validation » |
| Refuser le devis | Visiteur / Client | Dans l’application | La commande reste, avec la réponse du client |
| Annuler la commande toute seule (motif : devis refusé par le client) | Application (automatique) | Pas encore | Aujourd’hui la commande reste ouverte et la direction doit l’annuler à la main |
| Notifier la direction dans la plateforme : devis refusé | Application (automatique) | En partie | Avec un lien vers la commande, pour information. Aujourd’hui par e-mail ; passe dans les notifications de la plateforme |

## 6. Commande payée en ligne (sur mesure ou boutique)

Le client paie par carte avant que la commande n’existe : elle naît validée, avec une date estimée, sans intervention de l’atelier.

Schéma : [image](06-commande-en-ligne.svg) · [fichier BPMN](06-commande-en-ligne.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Se connecter et lancer le paiement | Visiteur / Client | Dans l’application | Compte nécessaire ; prix recalculé par le serveur, jamais envoyé par le navigateur |
| Garder le panier dans le compte du client, retrouvé sur tous ses appareils | Application (automatique) | Pas encore | Aujourd’hui le panier reste dans le navigateur : il ne suit ni le compte ni l’appareil ; à la connexion, on fusionne les deux |
| Figer le panier et ouvrir la page de paiement hébergée | Application (automatique) | Dans l’application | Aucune donnée de carte ne passe par l’application |
| Payer par carte sur la page du prestataire | Visiteur / Client | Dans l’application | Authentification de la banque si elle la demande |
| Contrôler et débiter la carte | Prestataire de paiement | En partie | Essayé avec le mode test de Stripe ; le compte du client se branche à la mise en service |
| Recevoir la confirmation signée du prestataire | Application (automatique) | Dans l’application | Seule preuve du paiement ; une notification falsifiée ou rejouée est ignorée |
| Créer la commande déjà validée avec sa date estimée | Application (automatique) | Dans l’application | Elle n’existe qu’après le paiement |
| Confirmer au client par e-mail et notifier la direction dans la plateforme | Application (automatique) | En partie | E-mail client mis en page, sans publicité. Notification direction : aujourd’hui par e-mail |
| Fabriquer (voir « Fabrication ») | Atelier | Dans l’application | Arrive dans « À lancer » |
| Ne rien créer, garder le panier | Application (automatique) | Dans l’application | Message au retour sur le site : paiement annulé, aucune somme débitée |
| Suivre sa commande dans son espace | Visiteur / Client | Dans l’application | Étapes, date estimée, paiement |

## 7. Commande saisie par la direction pour un client

Exception à la commande en ligne : un client qui ne peut ou ne veut pas le faire seul (téléphone, visite). La direction saisit la commande dans l’application, mais le devis, son envoi, l’accès à l’espace et la validation se font tout seuls : le client décide dans son espace.

Schéma : [image](07-commande-direction.svg) · [fichier BPMN](07-commande-direction.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Retrouver ou créer la fiche client | Direction | Dans l’application | Clients (particulier ou professionnel, chantiers) |
| Saisir ou modifier les pièces dans l’application (cotes, angles, matière, coloris, accessoires) | Direction | Dans l’application | Commandes › Nouvelle commande |
| Chiffrer, calculer le délai et les frais de livraison (distance par la route) | Application (automatique) | Dans l’application | Remise quantité et remise pro automatiques |
| Éditer le devis numéroté et envoyer au client le lien d’accès à son espace | Application (automatique) | En partie | Devis et lien d’activation existent ; l’envoi des deux ensemble, en un seul geste, est à faire |
| Accepter le devis dans son espace | Visiteur / Client | Dans l’application | Espace client › commande › Accepter le devis |
| Noter l’acceptation donnée par téléphone (exception) | Direction | Dans l’application | Devis › Accepté par le client |
| Valider la commande tout de suite, sans passer par la direction | Application (automatique) | Pas encore | Même règle que « Devis depuis l’espace client » |
| Annuler la commande toute seule (motif : devis refusé par le client) | Application (automatique) | Pas encore | Même règle que « Devis depuis l’espace client » |
| Notifier la direction dans la plateforme : devis refusé | Application (automatique) | En partie | Avec un lien vers la commande, pour information. Aujourd’hui par e-mail ; passe dans les notifications de la plateforme |

## 8. Refus d’une commande payée et remboursement

Cas exceptionnel : une commande déjà payée ne peut pas être réalisée. La direction la refuse, le client est remboursé en totalité et prévenu.

Schéma : [image](08-refus-remboursement.svg) · [fichier BPMN](08-refus-remboursement.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Refuser la commande en notant le motif | Direction | Dans l’application | Commande › Refuser et rembourser |
| Demander le remboursement intégral au prestataire | Application (automatique) | Dans l’application | Remboursement sur le moyen de paiement utilisé |
| Rembourser la carte du client | Prestataire de paiement | En partie | Vérifié avec le mode test de Stripe |
| Émettre l’avoir correspondant | Application (automatique) | Dans l’application | Numérotation continue |
| Passer la commande à « annulée » et tenir le journal | Application (automatique) | Dans l’application | Qui, quand, pourquoi |
| Prévenir le client avec le motif et le délai d’arrivée des fonds | Application (automatique) | Dans l’application | E-mail mis en page |
| Recevoir le remboursement sur son compte | Visiteur / Client | Hors application | Quelques jours selon sa banque |

## 9. Fabrication à l’atelier

L’atelier voit les commandes en quatre colonnes, en prend une en charge, fabrique, puis la marque prête. Chaque carte montre le client, les pièces et les retards.

Schéma : [image](09-fabrication.svg) · [fichier BPMN](09-fabrication.bpmn)

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

## 10. Écran d’affichage de l’atelier

Un écran fixé dans l’atelier montre en permanence les commandes en cours, en lecture seule : pas de menu, pas de bouton, rien à toucher. La page n’est servie que depuis le réseau interne de l’atelier ; tout le reste de l’application exige une connexion.

Schéma : [image](10-ecran-atelier.svg) · [fichier BPMN](10-ecran-atelier.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Brancher l’écran et ouvrir la page d’affichage en plein écran (mode kiosque) | Maintenance (nous) | Hors application | Sur le Raspberry lui-même (HDMI) ou sur un petit boîtier du réseau de l’atelier |
| Servir la page seulement depuis le réseau interne, jamais depuis internet | Application (automatique) | Pas encore | Restriction au niveau du réseau (pas seulement dans l’application : l’adresse d’un visiteur peut être falsifiée derrière un relais) |
| Afficher les commandes en colonnes : À lancer, En fabrication, Prêtes | Application (automatique) | Pas encore | Lecture seule, sans menu ni bouton, lisible de loin (grands caractères, thème sombre) |
| Montrer le numéro, les pièces, la date prévue et les retards, jamais le nom du client | Application (automatique) | Pas encore | Règle de l’atelier : on voit la commande, jamais le client |
| Se rafraîchir toute seule et signaler une coupure | Application (automatique) | Pas encore | Un message clair si la connexion au serveur est perdue, pour ne pas lire une information périmée |
| Regarder l’écran pour savoir quoi lancer et ce qui est en retard | Atelier | Pas encore | Rien à saisir : les gestes se font sur la page Fabrication, avec connexion |

## 11. Plan visuel de l’atelier dans l’application

La direction ouvre un plan du bâtiment, dans l’application, où les commandes se déplacent de lieu en lieu et où le stock se lit sur les racks. Le plan lit les vraies données ; l’emplacement des machines et des racks se règle une fois.

Schéma : [image](11-plan-atelier.svg) · [fichier BPMN](11-plan-atelier.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Ouvrir le plan dans le menu de l’atelier | Direction | Pas encore | Page réservée à la direction (nouvelle permission) ; lisible sur téléphone et tablette |
| Placer chaque commande dans son lieu : à lancer, sur une machine, prête, à retirer | Application (automatique) | Pas encore | Lecture des commandes réelles ; le nom du client n’apparaît pas |
| Montrer le stock sur les racks et signaler les références sous leur seuil | Application (automatique) | Pas encore | Lecture du stock réel et des seuils déjà réglés |
| Montrer les arrivages : le camion de feuilles sur le parking pendant la réception | Application (automatique) | Pas encore | Lit les réceptions en cours |
| Cliquer une commande ou un rack pour ouvrir sa page | Direction | Pas encore | Mène à la commande, ou à la référence de feuille |
| Placer les machines, les racks et les pièces sur le plan (une fois) | Direction | Pas encore | Dépend de la liste des machines et du plan fourni par le client |

## 12. Livraison et retrait

La commande prête est retirée à l’atelier, ou livrée sur chantier par un salarié avec le camion de l’entreprise. Chaque colis porte une étiquette code-barres : la remise se valide en la scannant et en faisant signer le client sur l’écran. La remise lance ensuite la facture.

Schéma : [image](12-livraison.svg) · [fichier BPMN](12-livraison.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Générer le code-barres du colis et l’étiquette à imprimer | Application (automatique) | Pas encore | Un code par colis (ou par commande, à cadrer) ; l’atelier imprime l’étiquette et la colle sur le colis |
| Venir chercher la commande à l’atelier | Visiteur / Client | Hors application | Le mode « retrait » est choisi à la commande |
| Fournir l’adresse, la distance et les frais de livraison | Application (automatique) | Dans l’application | Calculés à la commande (distance par la route) |
| Grouper les colis et préparer la tournée du salarié livreur | Atelier | Pas encore | Les livraisons sont faites par des salariés avec le camion de l’entreprise ; groupes de pièces et ordre de passage à définir avec le client |
| Éditer le bon de livraison | Application (automatique) | Pas encore | Prévu : nouveau type de document ; gardé avec la commande une fois signé |
| Scanner le code-barres du colis à la remise (caméra du téléphone) | Atelier | Pas encore | Comme pour la réception des feuilles ; sans le scan, la remise n’est pas validée |
| Signer la réception sur l’écran du salarié | Visiteur / Client | Pas encore | Signature gardée avec la commande ; que faire d’un client absent est à définir |
| Valider la remise : la commande passe à « Livrée » ou « Retirée » | Application (automatique) | En partie | Aujourd’hui un bouton « Marquer livrée » ou « Marquer retirée » ; avec le scan et la signature, plus de bouton à presser |

## 13. Créer une référence de feuille

La direction décrit une feuille que l’atelier reçoit (matière, épaisseur, coloris, format) et son code-barres. Dès lors, la réception la reconnaît au scan. Rien d’autre n’est nécessaire.

Schéma : [image](13-materiaux.svg) · [fichier BPMN](13-materiaux.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Saisir la matière, l’épaisseur, le coloris, le format et le code-barres | Direction | Dans l’application | Direction › Matériaux (champs libres, suggestions du catalogue) |
| Les créer au catalogue, inactifs et à prix zéro | Application (automatique) | Dans l’application | Jamais vendables à zéro euro : la direction les complète dans Tarifs et catalogue |
| Créer la référence à zéro en stock, avec son code | Application (automatique) | Dans l’application | Un code désigne une référence ; un code déjà pris est refusé |

## 14. Faire vivre les références de feuilles (facultatif)

Ce qui n’est pas nécessaire pour qu’une référence soit prête : ajouter ou retirer des codes-barres, archiver une référence qui n’est plus utilisée, importer un fichier.

Schéma : [image](14-materiaux-gestion.svg) · [fichier BPMN](14-materiaux-gestion.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Ajouter ou retirer des codes-barres, chercher une référence | Direction | Dans l’application | Plusieurs codes possibles pour une référence ; scan ou saisie |
| Archiver une référence qui n’est plus utilisée | Direction | Dans l’application | Jamais supprimée : l’historique s’y rapporte ; possible seulement à zéro |
| Importer toutes les références d’un coup (fichier) | Direction | Pas encore | Décidé : plus tard |

## 15. Commande de feuilles au fournisseur

La commande passée au fournisseur est enregistrée dans la plateforme avec ses feuilles : la réception sait ce qu’elle doit scanner et compare avec ce qui arrive.

Schéma : [image](15-commande-fournisseur.svg) · [fichier BPMN](15-commande-fournisseur.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Notifier la direction dans la plateforme : stock bas | Application (automatique) | Dans l’application | Seuil réglable sur chaque référence |
| Passer la commande au fournisseur (téléphone, e-mail, site du fournisseur) | Direction | Hors application | Le fournisseur n’est pas relié à l’application ; à recueillir : qui commande, à qui, comment |
| Enregistrer la commande passée : fournisseur, références, nombre de feuilles de chaque lot, date de livraison prévue | Direction | Pas encore | À étudier : voir d’abord comment l’atelier commande, puis importer la commande (fichier ou e-mail du fournisseur) plutôt que la ressaisir |
| Afficher « en commande » sur chaque référence et préparer les quantités attendues à la réception | Application (automatique) | Pas encore | Permet la comparaison entre commandé et reçu |
| Notifier la direction si la livraison n’arrive pas à la date prévue | Application (automatique) | Pas encore | Notification dans la plateforme |

## 16. Réception de marchandise au scan

L’atelier reçoit des feuilles : il scanne le code-barres d’une feuille et indique, sur la plateforme, le nombre reçu. Le stock monte et la réception est comparée à la commande passée au fournisseur. Elle peut être suspendue et reprise au camion suivant.

Schéma : [image](16-reception.svg) · [fichier BPMN](16-reception.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Ouvrir la commande fournisseur attendue | Atelier | Pas encore | Reprend aussi une réception laissée en attente |
| Décharger et contrôler la livraison | Atelier | Hors application | Contrôle sur place |
| Scanner le code-barres d’une feuille (caméra du téléphone) ou le saisir | Atelier | Dans l’application | Atelier › Réception ; la caméra demande une connexion sécurisée (HTTPS) |
| Associer le code à une référence ou en créer une | Atelier | Dans l’application | Le code est reconnu aux réceptions suivantes |
| Indiquer le nombre de feuilles reçues et une note (bon de livraison) | Atelier | Dans l’application | Un code = une feuille ; on scanne une fois et on indique la quantité |
| Augmenter le stock et tracer l’entrée (qui, quand, quelle note) | Application (automatique) | Dans l’application | Dernières réceptions affichées à côté |
| Comparer à la commande : ce qui reste à recevoir | Application (automatique) | Pas encore | Dépend de « Commande de feuilles au fournisseur » |
| Passer au code suivant | Atelier | Dans l’application | La caméra est prête pour la feuille suivante |
| Clore la commande fournisseur | Application (automatique) | Pas encore | Les feuilles attendues disparaissent de « en commande » |
| Notifier la direction de l’écart (manque ou surplus) | Application (automatique) | Pas encore | Notification dans la plateforme |
| Suspendre la réception, la reprendre au camion suivant | Atelier | Pas encore | Livraison en plusieurs camions : on sort de la réception sans perdre ce qui est scanné |

## 17. Suivi du stock de feuilles

Voir ce qu’il reste, être prévenu quand le stock baisse, compter, et tenir les chutes à part des feuilles entières.

Schéma : [image](17-stock.svg) · [fichier BPMN](17-stock.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Voir les feuilles par matière, coloris, format ou état | Atelier | Dans l’application | Atelier › Stock de feuilles (filtres, état vide / critique / bas / ok) |
| Notifier la direction dans la plateforme quand le stock est bas (seuil par référence, aucune alerte sur une chute) | Application (automatique) | Dans l’application | Seuil réglable sur chaque carte ; à ranger dans le centre de notifications |
| Ajuster : entrée, sortie, perte, chute récupérée | Atelier | Dans l’application | Chaque mouvement garde qui, quand et pourquoi |
| Faire l’inventaire (quantité comptée) | Atelier | Dans l’application | Sert aussi à saisir le stock de départ |
| Décompter automatiquement ce qu’une commande consomme | Application (automatique) | Pas encore | Décidé : au lancement, avec confirmation des chutes à la fin |
| Consulter l’historique des mouvements | Direction | Dans l’application | Stock de feuilles › Historique |
| Estimer la date d’une commande selon le stock disponible | Application (automatique) | Pas encore | Si les feuilles manquent : délai standard + délai du fournisseur (données à recueillir) |

## 18. Facturation et encaissement

La remise de la commande (retrait ou livraison) lance la facture toute seule, le client est prévenu et la consulte dans son espace. La direction n’enregistre pas les paiements : ils sont constatés par l’application. Avoir et export pour le comptable restent à sa main.

Schéma : [image](18-facturation.svg) · [fichier BPMN](18-facturation.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Détecter la remise et émettre la facture toute seule | Application (automatique) | En partie | Aujourd’hui la direction clique sur « Facturer » ; numérotation F-AAAA-NNNN sans trou |
| Éditer la facture PDF, avec le fichier Factur-X | Application (automatique) | Dans l’application | Checklist des mentions obligatoires, QR code du site |
| Prévenir le client par e-mail : sa facture est dans son espace (sans pièce jointe) | Application (automatique) | En partie | Le message existe ; il part aujourd’hui sur geste de la direction |
| Consulter et télécharger sa facture dans son espace | Visiteur / Client | Dans l’application | Espace client › Factures |
| Marquer la facture payée avec la confirmation du prestataire de paiement | Application (automatique) | Pas encore | Le paiement en ligne est déjà enregistré ; la facture n’est pas encore marquée payée toute seule |
| Relancer le client par e-mail : rappel à l’échéance, puis relances | Application (automatique) | Pas encore | Pas de relance automatique ni de liste des impayés |
| Payer (virement, chèque…) | Visiteur / Client | Hors application | À recueillir : quelles commandes partent sans paiement préalable, et comment elles sont réglées |
| Constater le paiement sans saisie de la direction (par exemple en lisant le relevé bancaire) | Application (automatique) | Pas encore | À définir avec le client ; aujourd’hui la direction enregistre le paiement à la main |
| Faire un avoir (total) | Direction | Dans l’application | Facture › Faire un avoir ; l’avoir partiel est à faire |
| Exporter les ventes et encaissements pour le comptable | Direction | Dans l’application | Devis et factures › Exporter pour le comptable (CSV) |

## 19. Statistiques : chiffres clés et ventes

La direction lit ce qu’elle vend, de quoi et combien, sur la période de son choix. Les données de commandes existent déjà.

Schéma : [image](19-stats-ventes.svg) · [fichier BPMN](19-stats-ventes.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Choisir une période et un intervalle (jour, semaine, mois) | Direction | Pas encore | Sélecteur commun à toutes les vues de statistiques |
| Calculer le chiffre d’affaires, le nombre de commandes, le panier moyen, les devis acceptés | Application (automatique) | Pas encore | Les données de commandes existent déjà |
| Répartir les ventes par matière, coloris, modèle de pièce, sur mesure ou boutique | Application (automatique) | Pas encore | Les lignes de commande gardent déjà ces informations |
| Lire les chiffres, les courbes et le classement des références | Direction | Pas encore | Accès réservé à la direction (permission stats.read) ; lisible sur téléphone |

## 20. Statistiques : audience du site et entonnoir

La direction voit si le site attire et si les visiteurs deviennent clients. Rien n’est mesuré aujourd’hui : la collecte doit commencer dès la mise en production. Les robots sont écartés autant que possible ; seule l’action (devis, commande) prouve un vrai client.

Schéma : [image](20-stats-audience.svg) · [fichier BPMN](20-stats-audience.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Compter les visites et les pages vues, sans cookie ni adresse IP conservée | Application (automatique) | Pas encore | Compteur anonyme agrégé par jour et par page, à valider côté RGPD / CNIL |
| Écarter les robots : agents connus, requêtes sans navigateur réel, volume anormal | Application (automatique) | Pas encore | Aucun filtre n’est parfait : on obtient un bon ordre de grandeur, pas un chiffre exact |
| Distinguer le visiteur anonyme du client connecté à son espace | Application (automatique) | Pas encore | Seule la session de l’espace client le permet ; un visiteur anonyme le reste, sans cookie ni suivi |
| Enregistrer les abandons du configurateur et du panier, les devis refusés ou expirés et leur motif | Application (automatique) | Pas encore | Sert au taux de conversion ; un robot ne demande ni devis ni paiement |
| Calculer l’entonnoir : visite, configurateur, devis, commande | Application (automatique) | Pas encore | Aussi les demandes de contact |
| Lire l’audience et l’entonnoir | Direction | Pas encore | Accès réservé à la direction (permission stats.read) ; lisible sur téléphone |

## 21. Statistiques : dépenses, entrées et marge

La direction suit l’argent qui entre et qui sort. Il manque les prix d’achat et les dépenses : ils se saisissent à la réception et par catégorie.

Schéma : [image](21-stats-finances.svg) · [fichier BPMN](21-stats-finances.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Saisir le prix d’achat à la réception de chaque lot | Atelier | Pas encore | Aucun prix d’achat dans l’application aujourd’hui |
| Saisir les autres dépenses par catégorie | Direction | Pas encore | Les catégories de dépenses sont à définir avec la direction |
| Calculer les entrées (paiements, factures), les sorties et le solde | Application (automatique) | Pas encore | Les paiements et factures sont déjà horodatés |
| Calculer la marge par matière | Application (automatique) | Pas encore | Dépend du prix d’achat |
| Lire les entrées, les sorties et la marge | Direction | Pas encore | Accès réservé à la direction (permission stats.read) ; lisible sur téléphone |

## 22. Statistiques : délais tenus et charge de l’atelier

La direction compare ce qu’elle annonce à ce qu’elle fait. Les dates estimée et réelle sont déjà enregistrées.

Schéma : [image](22-stats-atelier.svg) · [fichier BPMN](22-stats-atelier.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Mesurer les délais validée, prête, livrée et les comparer à la date estimée | Application (automatique) | Pas encore | Les dates sont déjà enregistrées |
| Repérer les retards et la charge par semaine | Application (automatique) | Pas encore | Aucun classement de salariés : des agrégats seulement |
| Calculer le rendement matière : feuilles commandées contre consommées, chutes | Application (automatique) | Pas encore | Dépend du décompte automatique du stock |
| Lire les délais, la charge et le rendement | Direction | Pas encore | Accès réservé à la direction (permission stats.read) ; lisible sur téléphone |

## 23. Statistiques : consommation et rotation du stock

La direction voit ce que l’atelier consomme et ce qui dort sur les étagères.

Schéma : [image](23-stats-stock.svg) · [fichier BPMN](23-stats-stock.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Calculer la consommation par matière et coloris | Application (automatique) | Pas encore | Dépend du décompte automatique du stock |
| Calculer la rotation et repérer le stock dormant | Application (automatique) | Pas encore | Les mouvements de stock sont déjà horodatés |
| Repérer les ruptures | Application (automatique) | Pas encore | Complète l’alerte « stock bas » |
| Lire la consommation et le stock dormant | Direction | Pas encore | Accès réservé à la direction (permission stats.read) ; lisible sur téléphone |

## 24. Statistiques : comparer des périodes

La direction superpose deux périodes ou plus, pour le même chiffre (mois contre mois, année contre année).

Schéma : [image](24-stats-comparateur.svg) · [fichier BPMN](24-stats-comparateur.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Choisir deux périodes ou plus et le chiffre à comparer | Direction | Pas encore | Mêmes chiffres que les autres statistiques |
| Superposer les courbes | Application (automatique) | Pas encore | Courbes lisibles sur téléphone, thème clair et sombre |
| Lire l’écart | Direction | Pas encore | Accès réservé à la direction (permission stats.read) ; lisible sur téléphone |

## 25. Statistiques : alertes sur le catalogue

L’application signale d’elle-même un produit qui ne se vend plus, avec une suggestion.

Schéma : [image](25-stats-alertes.svg) · [fichier BPMN](25-stats-alertes.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Régler les règles d’alerte (par exemple : sans vente depuis N mois) | Direction | Pas encore | À définir avec la direction : quelles actions déclenchent une alerte |
| Détecter un coloris ou une matière sans vente | Application (automatique) | Pas encore | Règles réglables |
| Notifier la direction dans la plateforme, avec une suggestion : désactiver, solder, ne plus réapprovisionner | Application (automatique) | Pas encore | Dans le centre de notifications |
| Désactiver au catalogue si elle le décide | Direction | Dans l’application | Tarifs et catalogue › désactiver |

## 26. Statistiques : reprise de l’historique

L’entreprise a déjà des données (logiciel de facturation, tableurs) : les reprendre donne des courbes dès le départ.

Schéma : [image](26-stats-historique.svg) · [fichier BPMN](26-stats-historique.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Choisir le fichier (CSV ou Excel) de l’ancien outil | Direction | Pas encore | À recueillir : quelles données existent et sous quelle forme |
| Contrôler puis importer l’historique | Application (automatique) | Pas encore | Les données personnelles ne sont pas reprises dans les statistiques |
| Vérifier les courbes dès le départ | Direction | Pas encore | Accès réservé à la direction (permission stats.read) ; lisible sur téléphone |

## 27. Équipe : arrivée et départ d’un salarié

Fiche du salarié, compte personnel, droits par sections, puis désactivation au départ.

Schéma : [image](27-equipe.svg) · [fichier BPMN](27-equipe.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Créer la fiche du salarié (contrat, dates, contact) | Direction | Dans l’application | Équipe › Salariés (la direction y a accès) |
| Créer son compte personnel et cocher ses sections : Ventes, Atelier, Direction | Direction | Dans l’application | Seul l’administrateur crée des comptes ; sections cumulables |
| Générer un mot de passe temporaire, à changer à la première connexion | Application (automatique) | Dans l’application | Le salarié ne peut rien faire d’autre avant ; jamais envoyé par e-mail |
| Se connecter et choisir son mot de passe | Atelier | Dans l’application | Indicateur de robustesse |
| Changer ses droits ou lui donner un nouveau mot de passe temporaire | Direction | Dans l’application | Administration › Comptes |
| Enregistrer le départ : désactiver le compte | Direction | Dans l’application | Déconnexion immédiate de tous ses appareils |
| Garder l’historique et noter chaque action au journal | Application (automatique) | Dans l’application | Journal d’activité (qui, quoi, quand) |

## 28. Paramétrage par la direction

Tarifs, catalogue, documents : ce que la direction règle sans développeur, en gardant simple ce qui change souvent.

Schéma : [image](28-parametrage.svg) · [fichier BPMN](28-parametrage.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Régler matières, coloris, façonnage, accessoires, livraison | Direction | Dans l’application | Tarifs et catalogue (désactivable sans effacer) ; prix de la boutique en TTC, du sur-mesure en HT |
| Régler les limites de pliage et les modèles de pièces | Direction | Dans l’application | Catalogue › Modèles de pièces |
| Régler l’entreprise, le modèle des documents, la numérotation | Direction | Dans l’application | Modèles de documents (la numérotation se verrouille au premier document) |
| Régler les limites par matière, la quantité maximale et le délai selon la quantité | Direction | Pas encore | En attente des données des machines de l’atelier |
| Déclarer les jours fériés et les fermetures | Direction | Dans l’application | Tarifs et catalogue > Fermetures : les délais sautent ces jours et le site les annonce dans un bandeau |
| Appliquer tout de suite aux prochains devis, commandes et au site | Application (automatique) | Dans l’application | Les documents déjà émis ne changent pas |

## 29. Paramétrer les machines de l’atelier

La direction décrit les machines (type, longueur et épaisseur maximales, cadence) : l’application s’en sert pour contrôler la faisabilité d’une pièce et estimer la charge. Les limites réelles sont à recueillir chez le client.

Schéma : [image](29-parametrage-machines.svg) · [fichier BPMN](29-parametrage-machines.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Ajouter ou modifier une machine : type, longueur maximale, épaisseur par matière, cadence | Direction | Pas encore | Données à recueillir chez le client (limites des machines) |
| Mettre une machine hors service (panne, maintenance) ou la retirer | Direction | Pas encore | La capacité baisse tant qu’elle est arrêtée |
| Appliquer les limites des machines au contrôle du configurateur | Application (automatique) | Pas encore | Plafond de quantité, longueur et épaisseur maximales |
| Calculer la capacité par jour pour la date estimée | Application (automatique) | Pas encore | Dépend du recensement des machines et de leurs cadences |

## 30. Faire vivre le site vitrine et la boutique

Produits de la boutique, photos, textes du site et alertes de la messagerie. Les pages légales ne se modifient pas : elles suivent les versions de l’application.

Schéma : [image](30-site-vitrine.svg) · [fichier BPMN](30-site-vitrine.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Créer le produit, ses déclinaisons, ses prix TTC et sa photo | Direction | Dans l’application | Produits (import de catalogue, copie, prix en lot) |
| Modifier les textes principaux et ranger les photos du site | Direction | Dans l’application | Site vitrine › Textes et Photos (rétablissement du texte d’origine possible) |
| Publier tout de suite sur le site | Application (automatique) | Dans l’application | Sans redéploiement |
| Lire et traiter les demandes de contact reçues | Direction | Dans l’application | Site vitrine › Demandes reçues |
| Voir les messages envoyés et leur aperçu, s’envoyer un exemple | Direction | Dans l’application | Site vitrine › E-mails |
| Mettre à jour les pages légales avec les versions de l’application | Maintenance (nous) | Hors application | Mentions légales, confidentialité, cookies, conditions de vente ; hébergeur et médiateur réglés à l’installation |

## 31. Messages envoyés aux clients

Les e-mails automatiques envoyés aux clients, qui ne se connectent pas souvent à leur espace : à quel moment, avec quelles règles. Jamais de publicité, jamais de document joint, jamais de mot de passe. La direction, elle, est notifiée dans la plateforme (voir « Notifications de la direction »).

Schéma : [image](31-messages.svg) · [fichier BPMN](31-messages.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Bienvenue, activation de l’espace, mot de passe oublié, mot de passe modifié | Application (automatique) | Dans l’application | Liens à usage unique ; message de sécurité à chaque changement de mot de passe |
| Commande confirmée, commande refusée et remboursée | Application (automatique) | Dans l’application | Récapitulatif, date estimée, bouton vers l’espace client |
| Devis, facture ou avoir disponible dans l’espace client | Application (automatique) | Dans l’application | Aucune pièce jointe ; texte modifiable |
| Commande prête, accusé de réception d’une demande de contact | Application (automatique) | Pas encore | Pas encore envoyés au client |
| Lire le message (rappel de sécurité et lien vers son espace) | Visiteur / Client | Dans l’application | Version mise en page et version texte |

## 32. Notifications de la direction

Tout ce qui concerne la direction arrive dans la plateforme, en un seul endroit, pour chaque compte qui en a le droit. Un clic ouvre la page où traiter la demande. Si trop de notifications restent non lues, un e-mail d’alerte part.

Schéma : [image](32-notifications.svg) · [fichier BPMN](32-notifications.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Créer la notification pour chaque compte de la direction qui en a le droit | Application (automatique) | En partie | Aujourd’hui des e-mails aux adresses réglées pour l’équipe |
| Envoyer un e-mail d’alerte à la direction si trop de notifications restent non lues | Application (automatique) | Pas encore | Seuil réglable ; seul cas où la direction reçoit un e-mail |
| Voir le nombre de notifications non lues dans le menu | Direction | Pas encore | Pastille sur une cloche, dans le menu de gauche |
| Ouvrir la notification : arriver directement sur la page à traiter | Direction | Pas encore | Commande, demande de contact, devis, stock : la page exacte, pas la liste |
| Traiter la demande dans l’application | Direction | Dans l’application | Les pages existent déjà (commandes, demandes reçues, stock) |
| Marquer la notification comme lue, puis traitée | Application (automatique) | Pas encore | Lue pour tous les comptes ou pour chacun : à définir avec le client |

## 33. Mise en service chez un client

Ce que nous installons et ce que le client renseigne avant de s’en servir : entreprise, numérotation, tarifs, équipe, références, stock de départ, site.

Schéma : [image](33-mise-en-service.svg) · [fichier BPMN](33-mise-en-service.bpmn)

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

## 34. Disponibilité et supervision du serveur

Le serveur du client (un Raspberry Pi) doit rester disponible : il relance seul ses services, se reconnecte au réseau, et remonte son état. La maintenance s’y connecte à distance. Un seul Raspberry ne garantit pas 100 % (coupure de courant, d’internet) : la disponibilité visée est à fixer avec le client.

Schéma : [image](34-exploitation.svg) · [fichier BPMN](34-exploitation.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Relancer tout seul un service qui plante | Application (automatique) | En partie | Redémarrage automatique des conteneurs prévu ; à vérifier sur le Raspberry |
| Se reconnecter au réseau (wifi) après une coupure | Application (automatique) | Pas encore | Prévu avec le déploiement |
| Redémarrer le Raspberry s’il ne répond plus (chien de garde) | Application (automatique) | Pas encore | Prévu avec le déploiement |
| Remonter l’état du serveur et de chaque service (API, base, sauvegardes, disque, température) | Application (automatique) | Pas encore | Prévu avec le déploiement |
| Alerter la maintenance (nous) | Application (automatique) | Pas encore | Prévu avec le déploiement |
| Se connecter à distance et lire l’état (réseau privé, sans port ouvert) | Maintenance (nous) | En partie | Raspberry Pi et accès à distance prévus |
| Réparer ou intervenir | Maintenance (nous) | Hors application | Depuis chez nous, ou sur place si besoin |

## 35. Sauvegardes et test de restauration

La base est sauvegardée chaque nuit, copiée sur le NAS du client et chez nous, hors du site. Une sauvegarde qu’on n’a jamais restaurée ne vaut rien : la restauration est testée régulièrement.

Schéma : [image](35-exploitation-sauvegardes.svg) · [fichier BPMN](35-exploitation-sauvegardes.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Sauvegarder la base de données (documents compris) | Application (automatique) | Dans l’application | Les PDF, photos et références sont dans la base |
| Vérifier que la sauvegarde est lisible | Application (automatique) | Dans l’application | Toutes les tables sont contrôlées |
| Copier la sauvegarde sur le NAS du client | Application (automatique) | Pas encore | Prévu avec le déploiement |
| Copier une sauvegarde chez nous, hors du site (chiffrée) | Application (automatique) | Pas encore | Protège contre un vol, un incendie ou une panne sur place |
| Tester la restauration : recréer une base depuis la dernière sauvegarde et la comparer | Application (automatique) | En partie | La commande de vérification existe ; il reste à la lancer automatiquement et à alerter si elle échoue |
| Tester de temps en temps un redémarrage complet de l’application depuis une sauvegarde, sur une autre machine | Maintenance (nous) | Pas encore | Calendrier à fixer |
| Alerter la maintenance si une copie ou un test échoue | Application (automatique) | Pas encore | Prévu avec le déploiement |
| Restaurer la base en cas d’incident | Maintenance (nous) | Dans l’application | Commande de restauration documentée |

## 36. Mises à jour du système et de l’application

Le système du Raspberry, les services et les dépendances du front et du back sont tenus à jour sans casser l’application : détection, tests, publication, retour arrière.

Schéma : [image](36-exploitation-mises-a-jour.svg) · [fichier BPMN](36-exploitation-mises-a-jour.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Appliquer les mises à jour de sécurité du système du Raspberry, la nuit | Application (automatique) | Pas encore | Prévu avec le déploiement |
| Redémarrer et vérifier que tout est reparti | Application (automatique) | Pas encore | Utilise la supervision du serveur |
| Détecter les dépendances et les images à mettre à jour (front, back) | Application (automatique) | Dans l’application | Dependabot ouvre ses demandes chaque lundi, le bot prévient |
| Relire, tester (API, composants, parcours complets) et fusionner | Maintenance (nous) | Dans l’application | La CI rejoue tous les tests avant fusion |
| Publier la nouvelle version et la déployer sur le Raspberry | Maintenance (nous) | Pas encore | Versions et déploiement (tickets D1 à D9) |
| Contrôler la santé après déploiement et revenir à la version précédente si besoin | Application (automatique) | Pas encore | Retour arrière automatique |
