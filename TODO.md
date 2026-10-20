# À faire

État au 19 octobre 2026. La vision d'ensemble est dans [docs/feuille-de-route.md](docs/feuille-de-route.md).

**Règle pour chaque élément** :
- tests API, tests de composants et parcours Playwright (Chromium et Firefox) ;
- vérifications de sécurité ;
- page ajoutée à `e2e/tests/responsive.spec.ts` et à `e2e/apercu/rendus.spec.ts` ;
- `make apercu` lancé et **captures regardées** sur téléphone, tablette (portrait et paysage) et ordinateur, en clair et en sombre.

**Questions à poser à l'entreprise** (direction, atelier, comptable, domaine et e-mails, Google) : toutes dans `entreprise/questions-a-poser.md`, chacune avec son contexte et ce que la réponse change. À mettre à jour quand une nouvelle question apparaît.

## 1. Espace Direction (en cours)

### Tarifs et catalogue
- [x] Matières (épaisseur, prix au m², retour minimum)
- [x] Coloris (référence, teinte, majoration, délai)
- [x] Façonnage et conditions (pli, mise en route, minimum, remise pro, TVA, délai, remises quantité, limites machines)
- [x] Accessoires (prix HT à la pièce ou à la paire, modèles concernés, quantité proposée : fixe, par pièce ou par jonction)
- [x] **Modèles de pièces** gérés par la direction (onglet « Modèles de pièces ») : nom, forme de départ, nom des cotes, orientation du dessin, longueur et quantité proposées, accessoires liés ; une commande garde le nom et l'orientation du modèle
- [ ] Dessin 2D à l'écran (`ProfileSketch.vue`) : les étiquettes des petites cotes se chevauchent (ex. « 135° » sur « A 20 » de la couvertine) ; reprendre le décalage automatique déjà fait dans la fiche PDF
- [ ] Vue 3D ailleurs que dans la saisie de commande, si besoin : fiche commande, vue Fabrication, futur configurateur client
- [ ] Contrôles de collision avec la plieuse (profondeur d'un U ou d'un caisson, aile mini entre deux plis rapprochés) : après les réponses de l'atelier
- [ ] Jours fériés et fermetures de l'atelier (le délai ne saute aujourd'hui que les week-ends)
- [ ] Prix du pli par matière ou par épaisseur (aujourd'hui un seul prix)
- [x] Données de démonstration (`make demo`, base de dev vide uniquement) : 10 clients inventés, 16 commandes à toutes les étapes sur 2 mois, devis, factures payées / envoyées / en retard, un avoir, équipe et 3 comptes `demo-direction`, `demo-rh`, `demo-atelier`
- [ ] Démo : compléter quand de nouvelles pages arrivent (stock, achats, avis Google, vitrine) ; test automatique du script ; informations légales de l'entreprise (SIRET, IBAN) non remplies, pour que les PDF de démo soient complets
- [x] Limites de pliage : angle minimum / maximum, pince activable (saisie 0°, enregistrée ±1° pour garder le sens), refus d'un profil qui se referme sur lui-même
- [ ] **Questions pour l'atelier sur le pliage** : angle le plus fermé et le plus ouvert que fait la plieuse ; pinces faites ou non ; plus petite aile entre deux plis rapprochés ; profondeur maximale d'un U ou d'un caisson (collision avec la machine) ; longueur et plis maximum selon l'épaisseur
- [x] Livraison (retrait atelier activable, zones par distance avec livraison offerte dès un montant, supplément pièces longues, distance par la route via l'IGN, simulateur d'adresse)
- [ ] Simulateur de prix (facultatif) : une pièce type dont le prix se recalcule quand on change un tarif

### Modèles de devis et de factures
- [x] Informations de l'entreprise : raison sociale, forme, capital, adresse, SIRET (clé vérifiée), RCS, TVA intracom, IBAN (clé vérifiée), BIC, logo PNG/JPEG
- [x] Éditeur de modèle commun : couleur, introduction, conditions de paiement, validité du devis, délai de paiement, notes, mentions légales, pied de page
- [x] PDF côté serveur (pdfkit) et aperçu en direct dans la page (pdf.js)
- [x] Numérotation D-2026-0001 / F-2026-0001 sans trou (compteur verrouillé), préfixes fixes, reprise de l'ancien logiciel possible jusqu'au premier document créé
- [ ] Mentions légales types à faire valider par leur comptable (pénalités, indemnité de 40 €, escompte)

### Devis et factures
- [x] Table `billing_documents` (devis D-, factures F-, avoirs A-, numéros sans trou), créés depuis une commande, PDF au modèle commun conservé tel qu'émis
- [x] Document figé une fois émis : un déclencheur de la base refuse toute modification du contenu et toute suppression (conservation 10 ans) ; seul le suivi évolue
- [x] Avoir = annulation totale d'une facture (montants opposés, motif), puis nouvelle facture possible ; une commande facturée ne peut pas être annulée sans avoir
- [x] Suivi : devis émis / envoyé / accepté / refusé / expiré ; facture à envoyer / envoyée / en retard / payée (date et mode) / annulée
- [x] Page « Devis et factures » (onglets, chiffres clés, filtres, recherche), fiche d'un document, section sur la fiche commande ; réservé à la direction (`billing.manage`), invisible pour la RH (journal compris)
- [ ] Avoir partiel (une ligne, un montant)
- [ ] **Facturation électronique obligatoire** (réforme française) : les PDF actuels ne suffisent pas. À faire : PDF au format Factur-X (données structurées intégrées), connexion à une plateforme agréée (PDP) pour transmettre les factures, retour des statuts (déposée, rejetée, encaissée), e-reporting des ventes aux particuliers, mentions obligatoires (SIREN du client, adresse de livraison, nature de l'opération). Réception pour tous depuis le 1er septembre 2026 ; émission au 1er septembre 2027 pour une PME ou micro-entreprise. Dates et choix de la plateforme à valider avec leur comptable.
- [x] **Factur-X généré** : chaque facture et chaque avoir est un PDF/A-3 (police Inter incorporée) qui embarque son XML au profil EN 16931, repris à l'identique des montants du PDF ; XML gardé en base, figé par le déclencheur, téléchargeable sur la fiche du document ; mentions obligatoires (pénalités, indemnité de 40 €, escompte) dans le PDF et dans le XML ; carte « Facturation électronique » dans Modèles de documents et avertissement sur la commande avant de facturer (SIRET, TVA, adresse, e-mail du client). **Validé par le validateur officiel Mustang** (PDF/A-3, XML, règles EN 16931 et règles françaises) : `./scripts/facturx/valider.sh`, rejoué par la CI (job « Factures électroniques »)
- [ ] Factur-X : ajouter le job « Factures électroniques » aux contrôles obligatoires de GitHub ; mentions types à faire valider par le comptable ; refuser l'émission d'une facture non conforme à partir de la date d'obligation ; rien n'est encore envoyé à une plateforme agréée
- [ ] **Suite de la mise en conformité** (émission au 1er septembre 2027, à confirmer sur impots.gouv.fr) : (1) avec leur comptable, choisir la plateforme agréée et vérifier que l'API est comprise ; confirmer le régime de TVA et la nature des ventes ; (2) Patalu génère la facture Factur-X (PDF/A-3 + XML EN 16931), figée avec la facture et validée en CI ; (3) dépôt à la plateforme d'abord à la main, puis par l'API, avec retour des statuts dans le suivi ; (4) e-reporting des ventes aux particuliers et des paiements ; la réception des factures fournisseurs relève de la plateforme et du comptable
- [ ] Remise exceptionnelle sur une commande, relances des factures en retard (avec l'envoi d'e-mails)
- [ ] Mentions légales types à faire valider par leur comptable

### Clients et commandes
Les clients arriveront surtout par le panier du site (coordonnées saisies à la fin de la commande, puis espace client : suivi, dépenses, factures). En attendant, l'équipe peut créer une fiche à la main.
- [x] Fiches clients : particulier ou professionnel (SIRET, TVA vérifiés), coordonnées, adresse de facturation, adresses de chantier, origine, notes, archivage, e-mail unique
- [x] Commandes liées au client, suivi complet : Reçue → Validée → En fabrication → Prête → Livrée / retirée (+ Annulée), chaque étape datée et notée au journal
- [x] Lignes chiffrées avec le catalogue (modèle, matière, coloris, développé, plis, longueur, quantité, accessoires, remises, mise en route, livraison) : même calcul que le futur panier du site
- [x] Sur la fiche client : historique des commandes, total dépensé
- [x] Vue atelier « Fabrication » : commandes validées à prêtes, profil coté, sans client ni prix
- [x] Pièce en 3D dans la saisie de commande (three.js chargé à la demande, au coloris choisi, qu'on fait tourner) ; à réutiliser dans le futur configurateur client
- [x] Devis et facture PDF depuis la commande
- [ ] Commandes : remise exceptionnelle sur une commande
- [ ] Fidélité : remise pro, remises selon l'historique d'achat
- [ ] **RGPD, à trancher** : suppression du compte à la demande du client, ou conservation pendant une durée annoncée puis suppression. Les factures doivent de toute façon être gardées 10 ans : on pourrait anonymiser la fiche (nom, contact) en gardant les factures. À valider avec leur comptable.
- [x] Lecture seule pour la RH (permission `clients.read`)

### Fiches de fabrication
- [x] Modèle de fiche de fabrication imprimable (PDF, comme les modèles de devis) : numéro, date prévue, pièces avec profil coté, plis et sens, quantités, accessoires, case « fait » par pièce. Jamais de client ni de prix. Récapitulatif des accessoires à préparer, cases « Plié par / Contrôlé par / Date »
- [x] Bouton « Imprimer la fiche » dans Fabrication (liste et détail) et sur la commande côté Direction, impression notée au journal

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
- [x] Pages publiques : accueil (accroche, produits, étapes, réalisations, avis, pourquoi nous), Pliage aluminium, Contact avec envoi de plan, 4 pages légales, 404 ; aucun cookie ni script tiers (donc pas de bandeau)
- [x] Espace Direction « Site vitrine » (`site.manage`) : demandes reçues (plan en téléchargement, traitée / à traiter, suppression RGPD), textes modifiables avec rétablissement, photos (réduites dans le navigateur, emplacement, description, ordre)
- [x] Référencement : titre et description par page, robots.txt et plan du site générés avec l'adresse réelle, données « entreprise locale », atelier hors de l'index
- [x] Avis Google par l'API Places côté serveur (cache 6 h, repli sur un lien sans clé, jamais d'avis inventé)
- [ ] Brancher la clé API Google (`secrets/google_places_api_key.txt`) et **vérifier le Place ID** `GOOGLE_PLACE_ID` dans `.env` (déduit du lien Maps, jamais testé)
- [ ] Pages légales : remplir les « À COMPLÉTER » (hébergeur, médiateur de la consommation) et faire relire les CGV, la confidentialité et les mentions par leur comptable ; renseigner SIRET, téléphone et e-mail dans « Modèles de documents » (ils alimentent le site)
- [ ] Importer les vraies photos du site actuel (`entreprise/sources/images/`) par l'onglet Photos
- [ ] Demande de contact : bouton « Créer la fiche client », e-mail d'alerte à la direction (avec l'envoi d'e-mails), suppression automatique après 12 mois (annoncée dans la politique de confidentialité), pastille « à traiter » dans le tableau de bord
- [ ] Boutique en ligne (fiches produit par modèle et coloris, panier) : remplacée par le configurateur, voir section 3
- [ ] Fiche de pliage PDF téléchargeable de l'ancien site (à récupérer ou à remplacer par le configurateur)
- [ ] Horaires d'ouverture dans les données structurées Google, plan intégré sans traceur
- [ ] Récupérer les photos et les textes du site actuel (déjà copiés dans `entreprise/sources/`)

**Inventaire du site actuel (WordPress + WooCommerce, fait par Visicod) : on ne veut rien faire de moins bien**
- [ ] **Avis Google** : 10 avis affichés sur l'accueil (widget Trustindex « vérifié Google »). Choix : **récupération automatique par l'API Google Places** (clé dans `secrets/`, jamais dans le dépôt). Place ID de la fiche APS : `ChIJNa69EsWx9UcR_WhhkMI3aeQ` (déduit du lien Google Maps fourni, identifiant interne `0x47f5b1c512bdae35:0xe46937c2906168fd` ; **à vérifier** avec un premier appel dès que la clé sera là). Clé API : la direction la fournira plus tard, le code doit fonctionner sans (repli). À prévoir : une clé API restreinte (Places API New, champs `rating`, `userRatingCount`, `reviews`), appel côté serveur uniquement, cache court en base ou en mémoire (Google n'autorise pas de conserver les avis longtemps), note moyenne + nombre d'avis, attribution Google et lien « voir tous les avis », repli propre si l'API est indisponible. Limite : Google ne renvoie que 5 avis, pas les 10 actuels. Pas de cookie ni de script tiers côté visiteur.
- [ ] Accueil : accroche « Pliage d'aluminium / acier sur mesure », 3 catégories (couvertine, bavette d'appui, bandeau), réalisations en photos, produits les plus vendus, « Comment on fonctionne » en 4 étapes (plan, faisabilité, devis, production / retrait ou livraison), « Pourquoi choisir APS » (texte actuel à remplacer : c'est du lorem ipsum)
- [ ] Page « Pliage aluminium » : présentation par produit (couvertine jusqu'à 4 m, bavette avec ou sans rejingot, bandeau en L / U / retour, encadrement), types de pliage (Z, L, U, oméga, angles), conseils pour bien choisir
- [ ] Boutique avec fiches produit : une fiche par modèle et coloris, choix d'épaisseur / largeur / longueur, prix, accessoires associés, produits proches (les autres coloris). Le futur configurateur doit faire mieux : prix sur mesure en direct
- [ ] Fiche de pliage PDF à télécharger (à remplacer à terme par le configurateur, mais à garder en attendant)
- [ ] Contact : formulaire avec envoi de plan (PDF, photo), consentement RGPD, confirmation ; à améliorer : demande de devis reliée à la fiche client et à une commande
- [ ] Coordonnées, horaires, carte cliquable vers Google Maps (mieux : plan intégré sans traceur), recherche dans le site
- [ ] Pages légales : mentions légales, politique de confidentialité, gestion des cookies, CGV (à reprendre et à faire relire)
- [ ] À corriger par rapport à l'existant : deux SIRET différents sur la page contact (503 622 433 00061 et 994 800 167 000 11), largeur couvertine 270/320 incohérente avec le texte, description du bandeau copiée de la couvertine, fautes dans les textes

## 2. Espace Atelier
- [ ] Commandes à fabriquer, planning, fiche de fabrication

## 3. Espace client et site public
**Ce que fait leur boutique actuelle** (relevé du 20 octobre 2026, détail dans `entreprise/sources/boutique/`) : 52 articles standard à prix fixe par combinaison, panier et compte WooCommerce, paiement par carte selon leurs CGV, sur-mesure par fiche de pliage et devis. À reprendre dans Patalu :
- [ ] **Tailles standard** dans le configurateur : choisir « couvertine 320 mm, 3 m » ou « bavette 250 mm » en un clic, avant d'ajuster (couvertine 270 / 320 ; bavette 150 à 500 mm par 25 ; bandeau 200 à 350 mm par 25, en L ou en U)
- [ ] **Accessoires manquants** au catalogue : chapeau de pilier (carré 250 à 600 mm), angle 90° de couvertine, support de fixation ; épaisseur 0,8 mm pour les bandeaux
- [ ] **Calibrer les tarifs** sur leur grille (après réponse à la question A1b : TTC ou HT, prix fixes ou calculés, erreurs de leur grille)
- [ ] Coloris : sable / ivoire RAL 1015, brut, chêne doré (bandeaux seulement) à comparer avec notre catalogue ; majoration du noir sablé selon le produit

**Ordre retenu (octobre 2026)** : 1. configurateur public avec prix en direct, qui finit par « Demander un devis » (arrive chez la direction) ; 2. comptes clients séparés de ceux de l'équipe ; 3. commande par le client, validée par l'atelier ; 4. espace client ; 5. paiement en ligne, selon la réponse de la direction (question A6b : leur site actuel parle de paiement par carte, sans qu'on sache s'il marche).

- [x] **Configurateur de pliage public** (`/configurateur`, sans compte ni cookie) : mêmes pièces, mêmes limites de plieuse et même calcul de prix que l'atelier (un seul code), prix en direct, profil et 3D ; « Demander un devis » enregistre la demande avec les pièces et le prix **recalculé par le serveur**, prévient la direction par e-mail, et la direction crée la commande en un clic (fiche client créée ou retrouvée par e-mail, origine « site »)
- [ ] Configurateur : plusieurs pièces et livraison sont déjà gérées ; à ajouter : joindre un plan à la demande de devis, enregistrer sa configuration pour la reprendre plus tard (avec le compte client), prix pro quand le client est connecté, limites réelles de la plieuse (questions B1)
- [ ] Livraison dans le configurateur : le calcul de distance appelle un service extérieur (IGN) à chaque chiffrage avec une adresse ; limité à 60 chiffrages par minute et par adresse, à surveiller

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

## 5. Ce qui manque encore (audit du 20 octobre 2026)

### Avant la mise en ligne
- [ ] **Dépôt GitHub** : le dépôt local n'a plus de remote, donc ni PR ni CI ; voir la procédure en section 4. Les branches `feature/**` locales attendent
- [ ] **Nom de domaine**, DNS, serveur (Raspberry Pi), HTTPS, et un vrai serveur de recette (`staging`) avant la production
- [ ] **Envoi d'e-mails** (déjà noté) : choisir le service, une adresse sur leur domaine, SPF / DKIM / DMARC. Sert à : alerte à la direction à chaque demande de contact, devis, relances de factures, mot de passe oublié, espace client
- [ ] **Sauvegardes hors de la machine** et test de restauration sur une autre machine ; pour le Pi : disque fiable (SSD plutôt que carte SD), onduleur
- [ ] **Supervision** : alerte si le site tombe (sonde extérieure), si la sauvegarde échoue, si le disque se remplit ; journaux et erreurs de l'application consultables
- [x] **Export pour le comptable** (page Devis et factures, `billing.manage`) : CSV des factures et avoirs émis, ou des paiements encaissés, sur une période ; ouvert directement par Excel, formules neutralisées, noté au journal
- [ ] Export au format **FEC** (écritures comptables) : à faire avec leur comptable, qui donne le plan de comptes (clients 411, ventes 706, TVA 4457…)
- [ ] **Facturation électronique** (voir section 1) : aujourd'hui les factures sont des PDF, **pas** des factures électroniques au sens de la réforme
- [ ] Pages légales à compléter et à faire relire (voir « Site vitrine »)

### Sécurité et conformité
- [ ] Double authentification (TOTP) pour les comptes direction ; mot de passe oublié par e-mail
- [ ] Plans joints par les visiteurs : analyse antivirus (ClamAV) avant de les ouvrir ; anti-spam renforcé (CAPTCHA respectueux de la vie privée) si le piège à robots ne suffit pas
- [ ] RGPD : registre des traitements, purge automatique (demandes de contact 12 mois, clients inactifs), export et suppression des données d'un client
- [ ] Rotation des secrets documentée (base, clé Google, e-mails)

### Outillage de développement
- [ ] Aucun linter ni formateur (ESLint, Prettier) : à ajouter à la CI
- [ ] Tests d'accessibilité automatiques (axe-core dans Playwright) sur le site public et l'atelier
- [ ] Mesure des performances du site (Lighthouse en CI) : poids de l'accueil, images, chargement sur mobile
- [ ] Comparaison automatique des captures (`make apercu`) pour repérer les régressions visuelles
- [ ] Test de montée en charge simple (formulaire de contact, configurateur) avant l'ouverture au public

### Produit
- [ ] Image d'aperçu pour les réseaux sociaux (Open Graph) et logo officiel en vectoriel
- [ ] Choix du **paiement en ligne** (aucun pour l'instant : devis puis virement ou chèque) 
- [ ] Atelier : mode tablette (gros boutons, lisible à distance), étiquettes ou QR code par pièce, notification quand une commande est validée
- [ ] Planning de l'atelier (charge par jour, jours fériés, fermetures)

### Rôles et accès
- [x] La **direction a déjà tous les droits de la RH** (salariés, journal, clients) : un seul compte « gestion » suffit
- [ ] Usage prévu pour l'instant : deux comptes, **direction** (gestion) et **atelier**. Le rôle **RH** reste dans le code (`api/src/auth/permissions.ts`) pour une V2 qui séparera les rôles et les responsabilités ; ne pas le supprimer
- [x] Le rôle RH n'est plus proposé à la création ni au changement de rôle (un compte RH existant le garde) ; les routes et les permissions RH restent
