# Recueil : machines, limites et capacité de l'atelier

À remplir avec l'atelier pendant l'entretien. Les réponses fixent les limites que l'application impose au configurateur, et la façon de calculer les délais. Le but est que **tout soit contrôlé automatiquement**, sans étape humaine de confirmation : le configurateur accompagne le client jusqu'à une commande faisable, ou le renvoie vers une demande de contact si elle dépasse ce que l'atelier peut absorber. Notez les chiffres tels que l'atelier les donne, avec l'unité, et demandez un exemple chiffré pour chacun.

## 1. La plieuse

- Marque et modèle ? Combien de machines ?
- Longueur maximale de pliage (mm) ?
- Épaisseur minimale et maximale, **par matière** (aluminium, acier galvanisé, inox, cuivre…) ?
- Pour chaque épaisseur : retour minimum (la plus petite aile possible, mm), et rayon de pliage ?
- Angles possibles (minimum, maximum), pince (pli à 0°) : oui ou non ?
- Nombre de plis maximum sur une pièce ?
- Largeur de développé maximale (mm) ?
- Outils disponibles (poinçons, matrices, longueurs) : lesquels, et que ne peut-on **pas** plier à cause d'eux (profil en U étroit, retour profond sur aile courte, profil qui se recoupe) ?
- Une longueur ou un poids à partir duquel il faut deux personnes ou une autre machine ?

## 2. La découpe

- Quelle machine (cisaille, poinçonneuse, laser…) ? Formats et épaisseurs maximum ?
- Formats de feuilles standard commandés au fournisseur (mm), par matière et épaisseur ?
- Découpe de pièces autres que des bandes (angles, encoches, perçages) : possible ou non ?

## 3. Cadence : combien de temps pour une pièce

Pour 3 ou 4 pièces **typiques** (bouchon, couvertine, bavette, bandeau), demandez :
- Le temps de **préparation** (changer d'outil, de matière, de réglage), une seule fois par lot.
- Le temps **par pièce** : par pli, ou au total.
- Le temps d'**emballage** et d'étiquetage.
- Combien de pièces par heure, ou par jour, dans un jour normal ?

C'est ce qui permet de compter en temps machine plutôt qu'en nombre de pièces.

## 4. Les gens et le calendrier

- Combien d'opérateurs sur la plieuse, sur la découpe ?
- Horaires d'ouverture, jours travaillés, fermetures annuelles et jours fériés non travaillés ?
- Qui peut remplacer qui en cas d'absence ? Combien de pièces par jour quand quelqu'un manque ?

## 5. Les commandes réelles

- Quantité **habituelle** d'une commande (le plus fréquent) et quantité **maximale** jamais acceptée ?
- Combien de commandes par semaine, et le pic de l'année ?
- Le délai annoncé aujourd'hui aux clients, et le délai réellement tenu ? Combien de retards sur un mois type ?
- Quels délais selon la quantité (par exemple 1 à 100 pièces : 2 jours, 100 à 300 : 4 jours) : confirmez les tranches et les durées.

## 5 bis. Les feuilles et le réapprovisionnement

L'estimation donnée au client doit tenir compte du stock : si les feuilles nécessaires manquent, la date s'allonge du temps de réapprovisionnement.

- Chez quel(s) fournisseur(s) commandent-ils les feuilles ? Par quel moyen (téléphone, e-mail, site) ?
- Le **délai de livraison** du fournisseur, par matière et par coloris : en jours ouvrés, avec le plus court et le plus long observé ?
- Y a-t-il des coloris ou des formats **toujours en stock** chez le fournisseur, et d'autres **sur commande** (délai plus long) ?
- À quel rythme commandent-ils (chaque semaine, à la demande, dès qu'un seuil est atteint) ?
- Un **minimum de commande** chez le fournisseur (nombre de feuilles, montant) ?
- Combien de feuilles gardent-ils en réserve pour les commandes urgentes ?

## 6. Ce qu'ils refusent aujourd'hui

- Quelles demandes refusent-ils ? Donnez 5 exemples réels (pièce infaisable, quantité trop grande, délai impossible).
- Qui décide, et sur quels critères ?
- Qu'arrive-t-il au client : devis refusé, proposition d'une autre solution, remboursement ?

## 7. Paiement en ligne et banque

Le client doit avoir un prestataire de paiement pour encaisser les cartes sur la boutique. L'application peut s'adapter à plusieurs (Stripe, Mollie, PayPlug, celui de la banque…) : il faut savoir lequel.

- Quelle est sa **banque** ? Propose-t-elle un service de paiement en ligne (par exemple Up2pay, PayPlug, CIC Paiement, Lyra) ?
- A-t-il déjà un **contrat de vente à distance** (paiement par carte à distance) ? Avec qui, et depuis quand ?
- Accepte-t-il de créer un compte chez un prestataire en ligne (Mollie, Stripe…) ? Préfère-t-il rester chez sa banque ?
- Quels **moyens de paiement** veut-il proposer : carte, virement, prélèvement SEPA, PayPal ?
- Quels **frais** accepte-t-il (pourcentage par paiement, abonnement mensuel) ? Demandez la grille de son prestataire actuel.
- Souhaite-t-il que ses données de paiement restent chez un prestataire **européen** ?
- Qui ouvrira le compte, avec quels documents (extrait Kbis, pièce d'identité du dirigeant, RIB) ?

## 8. Le serveur et le NAS

L'application tourne sur un petit serveur (Raspberry Pi) chez le client ; les sauvegardes, et éventuellement les documents, peuvent aller sur son NAS, sur le même réseau.

- Y a-t-il déjà un **NAS** ? Marque et modèle ? Combien d'espace libre ? Disques en RAID ?
- Par quels protocoles est-il joignable (partage Windows SMB, NFS, S3, SSH) ?
- Le NAS est-il **copié ailleurs** (autre site, nuage) ? Qui s'en occupe, à quelle fréquence ?
- Le serveur et le NAS sont-ils sur le **même réseau**, avec une adresse fixe ? Y a-t-il un onduleur ?
- Qui administre le réseau et le NAS, et peut créer un accès réservé à l'application ?
- Combien de temps garde-t-il aujourd'hui ses factures et ses devis (la loi impose 10 ans pour les factures) ?
- Faut-il pouvoir **consulter les documents depuis le NAS**, sans passer par l'application ?

## 9. Après l'entretien : ce qu'on en fait

| Réponse obtenue | Réglage dans l'application |
|---|---|
| Limites de la plieuse par matière et épaisseur | Façonnage et conditions : plis, angles, retour minimum, développé, longueur. Quand une limite est dépassée, le configurateur dit laquelle et propose une correction |
| Tranches de quantité et durées | Délai selon la quantité de pièces de la commande |
| Cadence et nombre d'opérateurs | Capacité par jour : le délai annoncé s'allonge selon la charge déjà en file |
| Délai de réapprovisionnement par matière et coloris | Estimation selon le stock : délai standard si les feuilles sont en stock, plus le délai du fournisseur sinon |
| Prestataire de paiement et moyens proposés | Réalisation du prestataire choisi (une centaine de lignes) puis clés dans `secrets/` ; essai en mode test avant l'ouverture |
| Plafond de pièces et délai maximal acceptable | Au-delà, le configurateur propose une demande de contact avec la fiche de la pièce, au lieu d'une commande |

Il n'y a pas de colonne « À confirmer » : une commande est soit acceptée automatiquement avec un délai honnête, soit corrigée par le client avec l'aide du configurateur, soit transformée en demande de contact.
