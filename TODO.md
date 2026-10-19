# À faire

État au 19 octobre 2026. La vision d'ensemble est dans [docs/feuille-de-route.md](docs/feuille-de-route.md).

**Règle pour chaque élément** :
- tests API, tests de composants et parcours Playwright (Chromium et Firefox) ;
- vérifications de sécurité ;
- page ajoutée à `e2e/tests/responsive.spec.ts` et à `e2e/apercu/rendus.spec.ts` ;
- `make apercu` lancé et **captures regardées** sur téléphone, tablette (portrait et paysage) et ordinateur, en clair et en sombre.

## 1. Espace Direction (en cours)

### Tarifs et catalogue
- [x] Matières (épaisseur, prix au m², retour minimum)
- [x] Coloris (référence, teinte, majoration, délai)
- [x] Façonnage et conditions (pli, mise en route, minimum, remise pro, TVA, délai, remises quantité, limites machines)
- [ ] **Accessoires** : bouchons, éclisses, angles, embouts, avec prix unitaire et unité (pièce, paire), et les modèles auxquels chacun s'applique (couvertine, bavette, bandeau)
- [ ] **Livraison** : retrait à l'atelier (gratuit), zones de livraison (distance maximum, prix)
- [ ] Simulateur de prix (facultatif) : une pièce type dont le prix se recalcule quand on change un tarif

### Modèles de devis et de factures
- [ ] Informations de l'entreprise : raison sociale, adresse, SIRET, TVA intracommunautaire, IBAN, logo
- [ ] Éditeur de modèle : en-tête, mentions légales, conditions de paiement, validité du devis, pied de page
- [ ] Aperçu PDF en direct, puis génération PDF côté serveur
- [ ] Numérotation automatique (D-2026-0001, F-2026-0001) sans trou, conforme à la loi pour les factures

### Site vitrine (remplace le WordPress actuel)
- [ ] Pages publiques : accueil, produits (couvertines, bavettes, bandeaux), réalisations, contact
- [ ] Éditeur de textes et de **photos** pour la direction (envoi d'images, redimensionnement, légendes)
- [ ] Référencement : titres, descriptions, plan du site, données structurées « entreprise locale »
- [ ] Récupérer les photos et les textes du site actuel (déjà copiés dans `entreprise/sources/`)

### Clients
- [ ] Fiches clients : particulier ou professionnel, coordonnées, adresses de chantier
- [ ] Historique des devis et commandes, chiffre d'affaires par client
- [ ] Fidélité : remise pro, remises selon l'historique d'achat
- [ ] Lecture seule pour la RH (permission `clients.read`)

### Trésorerie
- [ ] Encaissements : factures payées, en attente, en retard ; relances
- [ ] Dépenses : achats de tôles, fournisseurs, frais
- [ ] Tableau de bord chiffré : chiffre d'affaires du mois et de l'année, marge estimée, prévisionnel

## 2. Espace Atelier
- [ ] Stock : articles (tôles par matière, épaisseur et coloris ; accessoires), mouvements tracés, alertes de stock bas
- [ ] Commandes à fabriquer, planning, fiche de fabrication

## 3. Espace client et site public
- [ ] Configurateur de pliage public (sans compte), prix en direct à partir du catalogue
- [ ] Comptes clients séparés des comptes de l'équipe : inscription, connexion, mot de passe oublié par e-mail
- [ ] Commander (compte obligatoire), suivre et gérer ses commandes, recommander à l'identique

## 4. Technique et administration
- [ ] **Recréer le dépôt GitHub** quand le réseau le permet :
  1. renommer l'ancien `Rxdy/patalu` en `patalu-ancien` et le passer en privé ;
  2. lancer `.depot-a-recreer/recreer-depot.sh` ;
  3. ouvrir les PR des branches locales vers `dev`, dans l'ordre : `feature/salaries`, `feature/roles`, `feature/catalogue`, `feature/faconnage`.
- [ ] Réseau : `sudo tailscale set --accept-dns=false` (sinon GitHub devient injoignable)
- [ ] Activer les comptes `admin` et `rudy` (mots de passe temporaires dans `secrets/comptes-a-activer.txt`), puis supprimer ce fichier
- [ ] Désactiver le compte de test `paul`
- [ ] Envoi d'e-mails (mot de passe oublié, devis, relances) : choisir un service (SMTP de l'hébergeur, Brevo…)
- [ ] Sauvegardes hors de la machine : copier `make backup-export` sur un autre support
- [ ] Déploiement sur le Raspberry Pi 5 « meliodas » : `make setup`, nom de domaine, `make prod`
- [ ] Promotions `dev → staging → main` une fois les PR mergées
