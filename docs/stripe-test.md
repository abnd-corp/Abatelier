# Essayer le paiement en ligne avec Stripe (mode test)

Le code de paiement est prêt (page de paiement hébergée par Stripe, notifications signées, remboursement). Il ne manque que les clés d'un compte Stripe. En mode test, **aucun argent ne bouge** et Stripe ne demande ni vérification d'entreprise ni coordonnées bancaires.

Par défaut, le développement utilise un **faux paiement** (`PAYMENT_PROVIDER=simulation`). Les étapes ci-dessous basculent sur le vrai Stripe, en test.

## 1. Créer le compte et récupérer la clé

1. Créer un compte gratuit sur https://dashboard.stripe.com/register.
2. Rester en **mode test** (interrupteur « Mode test » en haut du tableau de bord).
3. Développeurs > Clés API : copier la **clé secrète** (elle commence par `sk_test_`).
4. La coller seule, sans espace ni retour à la ligne superflu, dans `secrets/stripe_secret_key.txt`.

Ne jamais mettre cette clé dans `.env` ni dans un message : `secrets/` n'est pas versionné.

## 2. Recevoir les notifications de Stripe

Stripe confirme un paiement par une notification envoyée à l'application : c'est la seule preuve qu'un paiement a eu lieu. En développement, l'application n'est pas joignable depuis internet : on utilise l'outil en ligne de commande de Stripe, qui relaie les notifications.

```
make stripe-ecoute
```

La commande ne relaie que les quatre événements dont l'application a besoin (paiement réussi, échoué ou expiré). Elle affiche `Ready! Your webhook signing secret is whsec_…`. Copier ce secret dans `secrets/stripe_webhook_secret.txt`, puis laisser la commande tourner pendant les essais (elle affiche chaque notification reçue).

## 3. Activer Stripe dans l'application

Dans `.env`, ajouter :

```
PAYMENT_PROVIDER=stripe
```

Puis relancer l'API pour qu'elle relise les secrets :

```
docker compose up -d api
```

Si une clé manque, l'API refuse de démarrer et le dit dans ses journaux (`make logs`).

## 4. Faire un paiement de test

1. Sur le site, créer un espace client et ajouter un article de la boutique au panier.
2. Payer : le navigateur ouvre la page de Stripe. Utiliser la carte de test **4242 4242 4242 4242**, une date d'expiration future et un code à trois chiffres quelconque. D'autres cartes simulent un refus (par exemple `4000 0000 0000 0002`).
3. Au retour sur le site, la commande est payée et arrive dans Fabrication, dans « À lancer ».
4. Dans la fenêtre de `make stripe-ecoute`, la notification `checkout.session.completed` apparaît avec la réponse `200`.

## 5. Essayer le remboursement

Dans l'application, côté direction, ouvrir la commande payée en ligne et la **refuser** : le client est remboursé intégralement chez Stripe et un avoir est émis. Le remboursement apparaît dans le tableau de bord Stripe (mode test), sous Paiements.

## Revenir au faux paiement

Retirer `PAYMENT_PROVIDER=stripe` de `.env` puis `docker compose up -d api`.

## En production

Les clés de production (`sk_live_…`) et un secret de notification propre au domaine se créent dans le tableau de bord Stripe (Développeurs > Webhooks, adresse `https://<domaine>/api/paiement/stripe`, événements `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, `checkout.session.async_payment_failed`). Cette étape se fait avec le client, sur son compte, avec la vérification de son entreprise.
