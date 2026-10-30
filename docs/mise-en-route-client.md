# Mise en route chez un client

Ce que nous faisons au déploiement, puis ce que le client doit renseigner avant de s'en servir. Le reste de l'application est fonctionnel dès que ces données existent.

## Notre part (déploiement)

- Installer l'application et créer le compte `admin`, qui sert uniquement à l'administration.
- Configurer les secrets : envoi d'e-mails, paiement en ligne, avis Google.
- Configurer la **connexion avec Google** de l'espace client, comme l'envoi d'e-mails : un « ID client OAuth » créé dans un projet Google Cloud **au nom de l'entreprise** (pas d'un compte personnel), avec l'adresse de retour du vrai domaine (`https://<domaine>/api/espace/google/retour`), l'écran de consentement passé de « Test » à « En production » (sinon seuls les testeurs listés peuvent entrer), puis `GOOGLE_OAUTH_PROVIDER=google` et `GOOGLE_OAUTH_CLIENT_ID` dans `.env`, et le secret dans `secrets/google_oauth_client_secret.txt`. Pas de Google : laisser `none`, le bouton disparaît et le mot de passe suffit. Détail dans `docs/connexion-google.md`.
- Renseigner l'hébergeur du site et le médiateur de la consommation (`LEGAL_HEBERGEUR`, `LEGAL_MEDIATEUR`) : ils apparaissent dans les mentions légales et les conditions de vente. Ces pages légales ne sont pas modifiables par le client : elles suivent les versions de l'application, et nous les mettons à jour.
- Le nom de domaine en HTTPS.
- Les sauvegardes nocturnes et leur vérification.
- Remettre au client son compte administrateur, avec un mot de passe provisoire.

## La part du client, dans l'ordre

| # | Quoi | Où dans l'application | Pourquoi dans cet ordre |
|---|---|---|---|
| 1 | **Équipe** : fiches des salariés, et leur compte de connexion s'ils en ont un | Équipe > Salariés (et Comptes) | Chacun doit pouvoir se connecter avec son compte, pas avec `admin` |
| 2 | **Entreprise** : raison sociale, SIRET, TVA, IBAN, logo | Direction > Modèles de documents > Entreprise | Ces informations s'impriment sur chaque devis et facture |
| 3 | **Modèle des documents** et **numérotation** | Modèles de documents > Modèle et Numérotation | Voir « La numérotation » ci-dessous |
| 4 | **Catalogue et tarifs** : matières et prix au m², coloris, modèles de pièces, accessoires, livraison, délais, remises, TVA | Direction > Tarifs et catalogue | Sans tarifs, aucun devis ne se calcule |
| 5 | **Matériaux** : les références de feuilles et leurs codes-barres | Direction > Matériaux | Sans références, la réception ne reconnaît aucun code |
| 6 | **Stock de départ** : compter les feuilles présentes à l'atelier | Atelier > Stock de feuilles (Ajuster, Compter) | Pour que les chiffres soient justes dès le premier jour |
| 7 | **Site vitrine** : textes, photos, pages légales (mentions légales obligatoires), produits de la boutique | Direction > Site vitrine et Boutique | Le site est public : il doit être complet avant d'être annoncé |

Ensuite, selon le client : importer ses clients et son historique de commandes. Cette étape est facultative.

## Salariés et comptes

Il y a deux pages, qui décrivent deux choses différentes.

- **Salariés** : la fiche de la personne (poste, contrat, dates).
- **Comptes** : la connexion (identifiant, sections, mot de passe, désactivation).

Un salarié a zéro ou un compte. Un compte peut exister sans salarié, comme `admin`.

Pour le client, le point d'entrée est la page **Salariés** : il crée la fiche et coche « Créer un compte pour accéder à l’application ». La page **Comptes** sert ensuite aux opérations techniques : réinitialiser un mot de passe, désactiver un accès, gérer un compte sans fiche.

Qui peut créer un compte de connexion : l'administrateur seulement. La direction gère les fiches des salariés, mais ne crée pas d'accès.

## La numérotation des factures

En France, les numéros de facture doivent se suivre sans trou ni doublon. L'application sait numéroter toute seule, il lui faut seulement savoir **par où commencer**.

- Entreprise qui n'a encore émis aucune facture : on commence à 1, il n'y a rien à faire.
- Entreprise qui avait déjà des factures avec un autre outil : on saisit le dernier numéro émis, et l'application continue à la suite. Sans cela, elle recommencerait à 1 et créerait des doublons avec les anciennes factures.

C'est un seul champ à remplir **avant la première facture** : après, on ne peut plus changer le point de départ. La question à poser au client est simple : « Quel est le dernier numéro de facture que vous avez émis ? » À confirmer avec son comptable.
