# Connexion avec Google (espace client)

Le client peut entrer dans son espace avec son compte Google. Le mot de passe reste possible.

## Essayer sans compte Google (développement)

En développement, `GOOGLE_OAUTH_PROVIDER` vaut `simulation` : le bouton « Continuer avec Google » est affiché, mais l'identité est donnée dans l'adresse.

```
http://localhost:5173/api/espace/google/debut?simule=marie@exemple.fr:Marie:Martin
```

`simule` se compose de `e-mail:prénom:nom`. Le faux Google est refusé au démarrage en production (sauf `ALLOW_FAKE_GOOGLE=true`, réservé à la pile jetable des tests de bout en bout).

## Brancher le vrai Google

1. Console Google Cloud (console.cloud.google.com) : créer un projet, puis **API et services › Identifiants › Créer des identifiants › ID client OAuth**, type « Application Web ».
2. **Écran de consentement** : nom de l'application, e-mail d'assistance, lien vers la politique de confidentialité du site. Les portées utilisées sont `openid`, `email` et `profile` : aucune validation spéciale de Google n'est demandée.
3. **URI de redirection autorisés** : `https://<le domaine>/api/espace/google/retour` (et `http://localhost:5173/api/espace/google/retour` pour essayer en local).
4. Dans `.env` : `GOOGLE_OAUTH_PROVIDER=google` et `GOOGLE_OAUTH_CLIENT_ID=<identifiant>`.
5. Le secret du client dans `secrets/google_oauth_client_secret.txt`, puis `docker compose up -d api`.

## Au déploiement chez le client

C'est un réglage de mise en service, au même titre que l'envoi d'e-mails.

- Le projet Google Cloud doit appartenir à l'entreprise, pas à un compte personnel du développeur.
- L'écran de consentement doit passer de « Test » à **« En production »** : en mode Test, seules les adresses listées comme testeurs peuvent se connecter.
- Ajouter l'adresse de retour du vrai domaine dans la console Google.
- Essayé le 30 octobre 2026 avec un vrai compte Google en local : rattachement à un espace existant et première visite.

Sans identifiant ni secret, l'API refuse de démarrer en mode `google` (message clair), et en mode `none` le bouton n'apparaît pas.

## Ce que fait l'application

- Redirection vers Google avec `state`, `nonce` et PKCE (S256), gardés dans un cookie HttpOnly signé de 10 minutes. Un retour sans cet état est refusé.
- Le jeton d'identité est reçu de Google par une connexion directe en HTTPS. L'émetteur, le destinataire, la durée, le `nonce` et **l'adresse e-mail vérifiée par Google** sont contrôlés. Aucun jeton Google n'est gardé.
- Adresse déjà connue : Google est rattaché à l'espace existant (journal `espace.google_linked`), sans doublon. Fiche créée par l'atelier sans espace : l'espace est ouvert, Google prouvant que l'adresse est la sienne.
- Première visite : le client choisit particulier ou professionnel et accepte l'usage de ses données, puis la fiche et l'espace sont créés, sans mot de passe. Il peut en choisir un avec « Mot de passe oublié ».
- La fermeture de l'espace se confirme avec l'adresse e-mail quand il n'y a pas de mot de passe.
- Le retour ne renvoie que vers une page de l'espace ou du parcours d'achat, jamais vers une adresse extérieure.
