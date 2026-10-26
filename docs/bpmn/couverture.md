# Couverture des besoins métier

> Généré par `node scripts/bpmn/generer.mjs` à partir de `scripts/bpmn/processus.mjs`. Ne pas modifier à la main.

Les 12 processus de l’atelier sont décrits en BPMN (voir [README](README.md)). Chaque étape est classée selon ce que fait l’application aujourd’hui.

| Couverture | Étapes | Part |
|---|---|---|
| Dans l’application | 69 | 76 % |
| En partie | 2 | 2 % |
| Pas encore | 14 | 15 % |
| Hors application | 6 | 7 % |
| **Total** | **91** | |

## Ce qu’il reste à faire pour couvrir tout le besoin

- **Demande de contact** : Créer la fiche client depuis la demande (pas encore) : Aujourd’hui la fiche se crée à la main dans Clients
- **Demande de contact** : Supprimer la demande au bout de 12 mois (pas encore) : Suppression à la demande de la personne : faite ; purge automatique : à faire
- **Espace client : inscription, accès, fermeture** : Confirmer l’adresse e-mail (pas encore) : Prévu (M6) : lien de confirmation envoyé par e-mail
- **Espace client : inscription, accès, fermeture** : Envoyer un lien pour choisir un nouveau mot de passe (pas encore) : Prévu (M6)
- **Fabrication à l’atelier** : Mettre à jour le stock : feuilles utilisées, chute récupérée (en partie) : Saisie à la main dans Stock de feuilles : pas de décompte automatique
- **Livraison et retrait** : Planifier la tournée et livrer sur chantier (pas encore) : Pas de planning de tournées dans l’application
- **Livraison et retrait** : Éditer le bon de livraison (pas encore) : Prévu : nouveau type de document
- **Livraison et retrait** : Signer la réception (pas encore) : Pas de signature de réception
- **Facturation et encaissement** : Relancer le client par e-mail (pas encore) : Pas de relance automatique ni de liste des impayés
- **Boutique en ligne : achat d’un article standard** : Se connecter et payer par carte (en partie) : Faux prestataire en test ; Stripe en mode test à brancher (M5)
- **Stock de feuilles** : Commander des feuilles au fournisseur (pas encore) : Pas de fournisseurs ni de bons de commande dans l’application
- **Stock de feuilles** : Scanner le code-barres du fournisseur (pas encore) : Prévu : catalogue de références, lots et codes-barres
- **Équipe : arrivée et départ d’un salarié** : Droits sur mesure : sections cumulables (Ventes, Atelier, Direction) (pas encore) : Prévu (R5) : aujourd’hui un seul rôle par compte
- **Paramétrage par la direction** : Déclarer les jours fériés et les fermetures (pas encore) : Le délai annoncé saute les week-ends, pas les jours fériés
- **Sauvegarde et exploitation** : Copier la sauvegarde hors de la machine (pas encore) : Prévu avec le déploiement (M3)
- **Sauvegarde et exploitation** : Surveiller et alerter (e-mail, supervision) (pas encore) : Prévu avec le déploiement (M3)

## 1. Demande de contact

Un visiteur écrit à l’atelier depuis le site, avec ou sans plan.

Schéma : [image](01-contact.svg) · [fichier BPMN](01-contact.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Remplir le formulaire de contact (plan joint possible) | Visiteur / Client | Dans l’application | Site public › Contact (consentement RGPD demandé) |
| Enregistrer la demande et prévenir la direction par e-mail | Application (automatique) | Dans l’application | Alerte e-mail, historique des envois |
| Lire la demande et télécharger le plan | Direction | Dans l’application | Site vitrine › Demandes reçues |
| Créer la fiche client depuis la demande | Direction | Pas encore | Aujourd’hui la fiche se crée à la main dans Clients |
| Répondre au client (téléphone ou e-mail) | Direction | Hors application | La réponse part de la messagerie habituelle |
| Marquer la demande comme traitée | Direction | Dans l’application | Site vitrine › Demandes reçues |
| Supprimer la demande au bout de 12 mois | Application (automatique) | Pas encore | Suppression à la demande de la personne : faite ; purge automatique : à faire |

## 2. Espace client : inscription, accès, fermeture

Création du compte d’un particulier ou d’un professionnel, validation du statut pro, fermeture du compte.

Schéma : [image](02-espace-client.svg) · [fichier BPMN](02-espace-client.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Créer son espace (particulier ou professionnel, consentement) | Visiteur / Client | Dans l’application | Site public › Créer mon espace client |
| Créer le compte et la fiche client, ouvrir la session | Application (automatique) | Dans l’application | Mot de passe contrôlé (12 caractères, pas de mot de passe courant) |
| Confirmer l’adresse e-mail | Application (automatique) | Pas encore | Prévu (M6) : lien de confirmation envoyé par e-mail |
| Compléter « Mes informations » (SIRET, TVA, adresse de facturation) | Visiteur / Client | Dans l’application | Espace client › Mes informations |
| Vérifier puis valider le statut professionnel | Direction | Dans l’application | Clients › fiche › Valider le statut professionnel |
| Appliquer la remise professionnelle aux devis suivants | Application (automatique) | Dans l’application | Seulement après validation |
| Retrouver ses devis, commandes et factures | Visiteur / Client | Dans l’application | Espace client |
| Envoyer un lien pour choisir un nouveau mot de passe | Application (automatique) | Pas encore | Prévu (M6) |
| Fermer son espace (mot de passe demandé) | Visiteur / Client | Dans l’application | Espace client › Fermer mon espace |
| Anonymiser la fiche, garder les factures, libérer l’adresse | Application (automatique) | Dans l’application | Les factures sont conservées 10 ans (obligation légale) |

## 3. Devis en ligne avec le configurateur

Le client dessine sa pièce, voit le prix, reçoit un devis numéroté et l’accepte ou le refuse.

Schéma : [image](03-devis-en-ligne.svg) · [fichier BPMN](03-devis-en-ligne.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Choisir ou dessiner la pièce, la matière, le coloris, la longueur | Visiteur / Client | Dans l’application | Site public › Configurateur (prix en direct, vue 3D) |
| Vérifier les limites de pliage et calculer le prix | Application (automatique) | Dans l’application | Limites de la plieuse paramétrables |
| Créer son espace (la pièce est conservée) | Visiteur / Client | Dans l’application | Voir « Espace client » |
| Créer la commande et éditer le devis PDF numéroté | Application (automatique) | Dans l’application | Numérotation continue D-AAAA-NNNN |
| Prévenir la direction par e-mail | Application (automatique) | Dans l’application |  |
| Accepter le devis dans son espace | Visiteur / Client | Dans l’application | Espace client › commande › Accepter le devis |
| Valider la commande | Direction | Dans l’application | Commandes › Valider la commande |
| Refuser le devis | Visiteur / Client | Dans l’application | La commande reste, la direction le voit |

## 4. Commande sur mesure saisie par la direction

Un client appelle ou écrit ; la direction saisit la commande, fait le devis, la fait valider ou l’annule.

Schéma : [image](04-commande-sur-mesure.svg) · [fichier BPMN](04-commande-sur-mesure.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Retrouver ou créer la fiche client | Direction | Dans l’application | Clients (particulier ou professionnel, chantiers) |
| Saisir les pièces (cotes, angles, matière, coloris, accessoires) | Direction | Dans l’application | Commandes › Nouvelle commande |
| Chiffrer, calculer le délai et les frais de livraison (distance par la route) | Application (automatique) | Dans l’application | Remise quantité et remise pro automatiques |
| Faire le devis PDF et l’envoyer au client | Direction | Dans l’application | Commande › Devis et factures › e-mail depuis l’application |
| Noter l’acceptation du devis | Direction | Dans l’application | Devis › Accepté par le client |
| Modifier les pièces si besoin (avant validation) | Direction | Dans l’application | Commande › Modifier les pièces |
| Valider la commande | Direction | Dans l’application | La commande part chez l’atelier |
| Annuler la commande en notant la raison | Direction | Dans l’application | Commande › Annuler (la raison est gardée) |

## 5. Fabrication à l’atelier

L’atelier prend la commande validée, choisit la feuille, plie, puis la remet au client. Il ne voit jamais le client ni les prix.

Schéma : [image](05-fabrication.svg) · [fichier BPMN](05-fabrication.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Voir la commande dans Fabrication (sans client, sans prix) | Atelier | Dans l’application | Fabrication (les plus urgentes d’abord) |
| Imprimer la fiche de fabrication (QR code du site, option) | Atelier | Dans l’application | Fabrication › Imprimer la fiche (PDF) |
| Conseiller la feuille à prendre : chutes d’abord, moins de perte | Application (automatique) | Dans l’application | Fabrication › Feuilles à prendre |
| Lancer la fabrication | Atelier | Dans l’application | Bouton « Lancer la fabrication » |
| Découper et plier les pièces | Atelier | Hors application | Travail sur machine |
| Mettre à jour le stock : feuilles utilisées, chute récupérée | Atelier | En partie | Saisie à la main dans Stock de feuilles : pas de décompte automatique |
| Contrôler les pièces (cotes, angles) | Atelier | Hors application | Aucun contrôle qualité enregistré |
| Marquer la commande prête | Atelier | Dans l’application | Le client voit « Prête » dans son espace |
| Mettre le suivi du client à jour, avec qui et quand | Application (automatique) | Dans l’application | Journal d’activité |

## 6. Livraison et retrait

La commande prête est retirée à l’atelier ou livrée sur chantier.

Schéma : [image](06-livraison.svg) · [fichier BPMN](06-livraison.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Venir chercher la commande à l’atelier | Visiteur / Client | Hors application | Le mode « retrait » est choisi à la commande |
| Fournir l’adresse, la distance et les frais de livraison | Application (automatique) | Dans l’application | Calculés à la commande (distance par la route) |
| Planifier la tournée et livrer sur chantier | Direction | Pas encore | Pas de planning de tournées dans l’application |
| Éditer le bon de livraison | Direction | Pas encore | Prévu : nouveau type de document |
| Signer la réception | Visiteur / Client | Pas encore | Pas de signature de réception |
| Marquer la commande livrée / retirée | Atelier | Dans l’application | Elle quitte la liste de fabrication |

## 7. Facturation et encaissement

De la commande livrée à la facture payée, avec avoir et export pour le comptable.

Schéma : [image](07-facturation.svg) · [fichier BPMN](07-facturation.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Facturer la commande | Direction | Dans l’application | Commande › Facturer (numérotation F-AAAA-NNNN sans trou) |
| Éditer la facture PDF, avec le fichier Factur-X | Application (automatique) | Dans l’application | Checklist des mentions obligatoires, QR code du site |
| Envoyer la facture par e-mail | Direction | Dans l’application | Facture › Envoyer |
| Consulter et télécharger sa facture | Visiteur / Client | Dans l’application | Espace client › Factures |
| Payer (virement, chèque, espèces, carte) | Visiteur / Client | Hors application | Le règlement se fait hors de l’application |
| Enregistrer le paiement (date, mode) | Direction | Dans l’application | Facture › Enregistrer le paiement (annulable) |
| Relancer le client par e-mail | Direction | Pas encore | Pas de relance automatique ni de liste des impayés |
| Faire un avoir (total) | Direction | Dans l’application | Facture › Faire un avoir ; l’avoir partiel est à faire |
| Exporter les ventes et encaissements pour le comptable | Direction | Dans l’application | Devis et factures › Exporter pour le comptable (CSV) |

## 8. Boutique en ligne : achat d’un article standard

Le client achète un article du catalogue (couvertine, bavette, accessoire), le paie et suit sa commande.

Schéma : [image](08-boutique.svg) · [fichier BPMN](08-boutique.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Créer le produit, ses déclinaisons, ses prix et sa photo | Direction | Dans l’application | Produits (import de catalogue, copie, prix en lot) |
| Choisir un article et l’ajouter au panier | Visiteur / Client | Dans l’application | Site public › Boutique › Panier |
| Se connecter et payer par carte | Visiteur / Client | En partie | Faux prestataire en test ; Stripe en mode test à brancher (M5) |
| Créer la commande déjà validée | Application (automatique) | Dans l’application | La commande n’existe qu’après le paiement |
| Préparer l’article (voir « Fabrication ») | Atelier | Dans l’application | Même suivi que le sur-mesure |
| Garder le panier, ne rien débiter | Application (automatique) | Dans l’application | Message clair au client |
| Refuser et rembourser (la raison est gardée) | Direction | Dans l’application | Commande › Refuser et rembourser |

## 9. Stock de feuilles

Le suivi des feuilles entières et des chutes, de la réception à l’alerte de stock bas.

Schéma : [image](09-stock.svg) · [fichier BPMN](09-stock.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Commander des feuilles au fournisseur | Direction | Pas encore | Pas de fournisseurs ni de bons de commande dans l’application |
| Réceptionner et contrôler la livraison | Atelier | Hors application | Contrôle sur place |
| Enregistrer l’entrée : matière, coloris, format, quantité | Atelier | Dans l’application | Stock de feuilles › Ajuster le stock |
| Enregistrer une sortie ou une chute récupérée | Atelier | Dans l’application | Les chutes restent à part des feuilles entières |
| Faire l’inventaire (quantité comptée) | Atelier | Dans l’application | Chaque mouvement garde qui, quand et pourquoi |
| Signaler le stock bas (seuil par référence, aucune alerte sur une chute) | Application (automatique) | Dans l’application | État vide / critique / bas / ok |
| Scanner le code-barres du fournisseur | Atelier | Pas encore | Prévu : catalogue de références, lots et codes-barres |

## 10. Équipe : arrivée et départ d’un salarié

Fiche du salarié, compte personnel, rôle, puis désactivation au départ.

Schéma : [image](10-equipe.svg) · [fichier BPMN](10-equipe.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Créer la fiche du salarié (contrat, dates, contact) | Direction | Dans l’application | Équipe › Salariés |
| Créer son compte personnel et choisir son rôle | Direction | Dans l’application | Direction ou Atelier ; rôle RH existant gardé |
| Générer un mot de passe temporaire, à changer à la première connexion | Application (automatique) | Dans l’application | Le salarié ne peut rien faire d’autre avant |
| Se connecter et choisir son mot de passe | Atelier | Dans l’application | Indicateur de robustesse |
| Changer le rôle ou donner un nouveau mot de passe temporaire | Direction | Dans l’application | Administration › Comptes |
| Droits sur mesure : sections cumulables (Ventes, Atelier, Direction) | Direction | Pas encore | Prévu (R5) : aujourd’hui un seul rôle par compte |
| Enregistrer le départ : désactiver le compte | Direction | Dans l’application | Déconnexion immédiate de tous ses appareils |
| Garder l’historique et noter chaque action au journal | Application (automatique) | Dans l’application | Journal d’activité (qui, quoi, quand) |

## 11. Paramétrage par la direction

Tarifs, catalogue, documents et site vitrine : tout ce que la direction règle sans développeur.

Schéma : [image](11-parametrage.svg) · [fichier BPMN](11-parametrage.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Régler matières, coloris, façonnage, accessoires, livraison | Direction | Dans l’application | Tarifs et catalogue (désactivable sans effacer) |
| Régler les limites de pliage et les modèles de pièces | Direction | Dans l’application | Catalogue › Modèles de pièces |
| Régler l’entreprise, le modèle des documents, la numérotation | Direction | Dans l’application | Modèles de documents (la numérotation se verrouille au premier document) |
| Modifier les textes, les pages légales et les photos du site | Direction | Dans l’application | Site vitrine (rétablissement du texte d’origine possible) |
| Régler l’envoi d’e-mails et le tester | Direction | Dans l’application | Site vitrine › E-mails |
| Déclarer les jours fériés et les fermetures | Direction | Pas encore | Le délai annoncé saute les week-ends, pas les jours fériés |
| Appliquer tout de suite aux prochains devis, commandes et au site | Application (automatique) | Dans l’application | Les documents déjà émis ne changent pas |

## 12. Sauvegarde et exploitation

La sécurité des données au quotidien.

Schéma : [image](12-exploitation.svg) · [fichier BPMN](12-exploitation.bpmn)

| Étape | Qui | Couverture | Où dans l’application, ou précision |
|---|---|---|---|
| Sauvegarder la base de données | Application (automatique) | Dans l’application | Container de sauvegarde |
| Vérifier que la sauvegarde est lisible | Application (automatique) | Dans l’application | Toutes les tables sont contrôlées |
| Copier la sauvegarde hors de la machine | Application (automatique) | Pas encore | Prévu avec le déploiement (M3) |
| Restaurer la base | Direction | Dans l’application | Commande de restauration documentée |
| Surveiller et alerter (e-mail, supervision) | Application (automatique) | Pas encore | Prévu avec le déploiement (M3) |
