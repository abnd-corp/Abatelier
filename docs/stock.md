# Le stock de feuilles

## Ce que l'application apporte

Chez le client, les feuilles sont commandées dans un outil indépendant, et le stock n'est pas contrôlé. L'application ne remplace pas la commande au fournisseur. Elle apporte quatre choses :

1. **Définir** les références de feuilles et leurs codes-barres.
2. **Réceptionner** une livraison en scannant.
3. **Visualiser** ce qu'il y a en stock, et être prévenu quand il baisse.
4. **Décompter** le stock quand une commande est fabriquée, y compris les chutes.

Il n'y a ni commande fournisseur, ni lots, ni prix d'achat : on n'a pas assez d'informations sur la façon dont le client achète. On y reviendra.

## Les mots

- **Référence** : une matière avec son épaisseur, un coloris (ou « brut », sans laquage) et un format (largeur × longueur). Le stock d'une référence est un **nombre de feuilles**.
- **Chute** : un morceau récupéré d'une feuille entamée. C'est une **feuille partielle de la même matière et du même coloris**, avec ses dimensions réelles. Elle est comptée à part des feuilles entières.
- **Code-barres** : le code du fournisseur imprimé sur la feuille. **Un code désigne une référence.** Une même référence peut avoir plusieurs codes si le fournisseur en change.
- **Archiver** : une référence ne se supprime jamais, car l'historique s'y rapporte. Quand elle est à zéro, on l'archive : elle disparaît des listes, de la réception et des conseils de découpe, et se désarchive au besoin.

## Le processus

### 1. Définir les références (direction) : fait
Page **Direction > Matériaux**. On saisit librement la matière, l'épaisseur, le coloris et le format, avec un code-barres si on l'a. Ce qui n'existe pas encore au catalogue y est créé, inactif et à prix zéro : la direction le complète dans Tarifs et catalogue.

### 2. Réceptionner une livraison (atelier) : fait
Page **Atelier > Réception**, pensée pour le téléphone.
1. On scanne le code-barres d'une feuille de la livraison (caméra, ou saisie à la main).
2. L'application reconnaît la référence.
3. On indique le **nombre de feuilles** reçues, et une note si besoin (bon de livraison).
4. Le stock augmente, et l'entrée est tracée.

Un code inconnu n'est jamais ignoré : l'application le dit, et propose de l'associer à une référence existante ou d'en créer une.

### 3. Voir le stock (atelier et direction) : fait
Page **Atelier > Stock de feuilles** : une carte par référence, avec la quantité, l'état (vide, critique, bas, ok), un seuil d'alerte réglable, une note, des filtres, et l'historique des mouvements. Les chutes sont listées à part.

### 4. Fabriquer une commande : à faire
Aujourd'hui, la fiche de fabrication **conseille** la feuille à prendre (nombre de feuilles, perte), mais ne touche pas au stock : l'atelier le corrige à la main. Voici le fonctionnement proposé.

| Étape | Ce que fait l'opérateur | Ce que fait l'application |
|---|---|---|
| **Choisir la matière** | Ouvre la fiche, valide la feuille conseillée ou en choisit une autre | Propose les feuilles de la bonne matière et du bon coloris, les chutes d'abord |
| **Lancer** (passage à « En fabrication ») | Clique sur « Lancer » | **Décompte les feuilles** choisies, avec un mouvement « Fabrication » rattaché à la commande. Calcule les **chutes attendues** |
| **Découper** | Découpe selon la fiche | Rien |
| **Plier** | Plie selon la fiche | Rien |
| **Terminer** (passage à « Prête ») | **Confirme le nombre de chutes obtenues** | Ajoute ces chutes au stock, avec leurs dimensions |

Si la commande est annulée après le lancement, les feuilles reviennent au stock.

### 5. Inventaire, pertes : fait
Sur chaque carte, « Ajuster le stock » permet une entrée, une sortie (perte, chute, autre) ou un inventaire (on compte, l'application corrige). C'est aussi comme cela qu'on saisit le stock de départ.

## Points à trancher

1. **Moment du décompte** : au lancement (proposé) ou à la fin ? Au lancement, le stock reflète tout de suite ce qui est sorti de l'atelier.
2. **Stock insuffisant au lancement** : bloquer, ou prévenir et laisser l'opérateur continuer ? Le stock ne peut pas descendre sous zéro.
3. **Chute trop petite** : à partir de quelle taille une chute vaut-elle la peine d'être gardée ? L'opérateur indique 0 dans le cas contraire.
4. **Autres stocks** : accessoires, produits de la boutique. Aujourd'hui, seules les feuilles sont suivies.
