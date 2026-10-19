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
- [x] Numérotation D-2026-0001 / F-2026-0001 sans trou (compteur verrouillé), reprise d'une numérotation existante
- [ ] Mentions légales types à faire valider par leur comptable (pénalités, indemnité de 40 €, escompte)
- [ ] Numérotation : préfixes D / F à fixer dans le code, et « prochain numéro » à verrouiller dès le premier document créé (il ne sert qu'à reprendre la suite de l'ancien logiciel)

### Clients et commandes (prochaine étape)
Les clients arriveront surtout par le panier du site (coordonnées saisies à la fin de la commande, puis espace client : suivi, dépenses, factures). En attendant, l'équipe peut créer une fiche à la main.
- [ ] Fiches clients : particulier ou professionnel, coordonnées, adresses de chantier, origine (site, atelier, téléphone)
- [ ] Commandes liées au client, suivi complet : Reçue → Validée → En fabrication → Prête → Livrée / retirée (+ Annulée), chaque étape datée et notée au journal
- [ ] Lignes chiffrées avec le catalogue (modèle, matière, coloris, développé, plis, longueur, quantité, accessoires, remises, mise en route, livraison) : même calcul que le futur panier du site
- [ ] Sur la fiche client : historique des commandes, total dépensé
- [ ] Fidélité : remise pro, remises selon l'historique d'achat
- [ ] Lecture seule pour la RH (permission `clients.read`)

### Stock (ensuite)
- [ ] Articles : tôles par matière, épaisseur et coloris ; accessoires
- [ ] Décompte automatique quand une commande passe « en fabrication », mouvements tracés, alertes de stock bas

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
