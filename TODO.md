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
- [x] Accessoires (prix HT à la pièce ou à la paire, modèles concernés, quantité proposée : fixe, par pièce ou par jonction)
- [x] Livraison (retrait atelier activable, zones par distance avec livraison offerte dès un montant, supplément pièces longues, distance par la route via l'IGN, simulateur d'adresse)
- [ ] Simulateur de prix (facultatif) : une pièce type dont le prix se recalcule quand on change un tarif

### Modèles de devis et de factures
- [x] Informations de l'entreprise : raison sociale, forme, capital, adresse, SIRET (clé vérifiée), RCS, TVA intracom, IBAN (clé vérifiée), BIC, logo PNG/JPEG
- [x] Éditeur de modèle commun : couleur, introduction, conditions de paiement, validité du devis, délai de paiement, notes, mentions légales, pied de page
- [x] PDF côté serveur (pdfkit) et aperçu en direct dans la page (pdf.js)
- [x] Numérotation D-2026-0001 / F-2026-0001 sans trou (compteur verrouillé), préfixes fixes, reprise de l'ancien logiciel possible jusqu'au premier document créé
- [ ] Mentions légales types à faire valider par leur comptable (pénalités, indemnité de 40 €, escompte)

### Clients et commandes
Les clients arriveront surtout par le panier du site (coordonnées saisies à la fin de la commande, puis espace client : suivi, dépenses, factures). En attendant, l'équipe peut créer une fiche à la main.
- [x] Fiches clients : particulier ou professionnel (SIRET, TVA vérifiés), coordonnées, adresse de facturation, adresses de chantier, origine, notes, archivage, e-mail unique
- [x] Commandes liées au client, suivi complet : Reçue → Validée → En fabrication → Prête → Livrée / retirée (+ Annulée), chaque étape datée et notée au journal
- [x] Lignes chiffrées avec le catalogue (modèle, matière, coloris, développé, plis, longueur, quantité, accessoires, remises, mise en route, livraison) : même calcul que le futur panier du site
- [x] Sur la fiche client : historique des commandes, total dépensé
- [x] Vue atelier « Fabrication » : commandes validées à prêtes, profil coté, sans client ni prix
- [ ] Commandes : remise exceptionnelle sur une commande, impression de la fiche de fabrication, devis et facture PDF depuis la commande
- [ ] Fidélité : remise pro, remises selon l'historique d'achat
- [ ] **RGPD, à trancher** : suppression du compte à la demande du client, ou conservation pendant une durée annoncée puis suppression. Les factures doivent de toute façon être gardées 10 ans : on pourrait anonymiser la fiche (nom, contact) en gardant les factures. À valider avec leur comptable.
- [x] Lecture seule pour la RH (permission `clients.read`)

### Fiches de fabrication (prochaine étape)
- [ ] Modèle de fiche de fabrication imprimable (PDF, comme les modèles de devis) : numéro, date prévue, pièces avec profil coté, plis et sens, quantités, accessoires, case « fait » par pièce. Jamais de client ni de prix.
- [ ] Bouton « Imprimer la fiche » dans Fabrication

### Stock et découpe (ensuite)
Le pliage commence par de la découpe : chaque pièce est une bande de « développé × longueur » prise dans une feuille.
- [ ] **Formats de feuilles paramétrables** par la direction (par matière : largeur × longueur, ex. 1250 × 3000 mm), plus les réglages de découpe (taille mini d'une chute gardée, perte par coupe, sens de laquage), avec des valeurs par défaut modifiables
- [ ] Feuilles en stock par matière, épaisseur, coloris et format ; chutes avec leurs dimensions ; accessoires
- [ ] **Achats de matière première** : fournisseurs, bons de commande (feuilles, accessoires), réception qui fait entrer le stock (quantité, prix d'achat), suivi « commandé / reçu » : on sait ce qu'on a et ce qui arrive
- [ ] Vue « Matières premières » : stock disponible, réservé par les commandes validées, en commande chez les fournisseurs
- [ ] **Plan de découpe calculé** (pas estimé) : placer les bandes de chaque commande dans les feuilles (découpe à la cisaille, en guillotine), nombre de feuilles nécessaires, schéma par feuille
- [ ] **Chutes** : chaque chute a ses dimensions. Au-dessus d'une taille minimum, elle est remise en stock et réutilisée en priorité par les plans suivants ; en dessous, elle est perdue. Taux de chute par commande et par mois.
- [ ] Décompte automatique quand une commande passe « en fabrication » (feuilles entamées, chutes créées), mouvements tracés, alertes de stock bas
- [ ] **Questions pour l'atelier** : formats de feuilles achetés par matière ; sens de laquage à respecter (pièces dans le sens de la longueur ?) ; taille minimum d'une chute réutilisable ; largeur perdue à chaque coupe

### Trésorerie
- [ ] Encaissements : factures payées, en attente, en retard ; relances
- [ ] Dépenses : achats de tôles, fournisseurs, frais
- [ ] Tableau de bord chiffré : chiffre d'affaires du mois et de l'année, marge estimée, prévisionnel

### Site vitrine (à la fin, remplace le WordPress actuel)
- [ ] Pages publiques : accueil, produits (couvertines, bavettes, bandeaux), réalisations, contact
- [ ] Éditeur de textes et de **photos** pour la direction (envoi d'images, redimensionnement, légendes)
- [ ] Référencement : titres, descriptions, plan du site, données structurées « entreprise locale »
- [ ] Récupérer les photos et les textes du site actuel (déjà copiés dans `entreprise/sources/`)

## 2. Espace Atelier
- [ ] Commandes à fabriquer, planning, fiche de fabrication

## 3. Espace client et site public
- [ ] Configurateur de pliage public (sans compte), prix en direct à partir du catalogue
- [ ] Comptes clients séparés des comptes de l'équipe : inscription, connexion, mot de passe oublié par e-mail
- [ ] Commander (compte obligatoire), suivre et gérer ses commandes, recommander à l'identique
- [ ] **Devis imprimable par le client** depuis son panier (PDF au modèle de devis, numéro D-…, valable N jours), transformable en commande
- [ ] **Espace client** : ses commandes (suivi des étapes), ses devis, ses factures en PDF, ses adresses de chantier

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
