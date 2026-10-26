// Groupes de tests e2e : chaque fichier de tests/ appartient à un groupe, et chaque groupe
// dit quels fichiers du dépôt le concernent. Sert à « make e2e GROUPE=… » et à la CI,
// qui ne rejoue que les groupes touchés par une PR (la suite complète tourne vers staging et main).
// `node select.mjs --verifier` (lancé par « make check ») refuse un test qui n'est dans aucun groupe.

export const GROUPES = {
  auth: {
    tests: ['login', 'account', 'users', 'roles', 'security'],
    sources: [/^api\/src\/(auth\/|routes\/(auth|users)\.ts)/, /^web\/src\/views\/(Login|Account|Users)View/, /^web\/src\/stores\//],
  },
  commandes: {
    tests: ['orders', 'pliage', 'suivi-fabrication', 'clients', 'modeles'],
    sources: [/^api\/src\/(quote|profile|geo|production-sheet)\.ts/, /^api\/src\/routes\/(orders|production|clients|delivery)\.ts/, /^web\/src\/views\/(Order|Production|Client)/, /^web\/src\/lib\/(orders|piece3d)/],
  },
  catalogue: {
    tests: ['catalog'],
    sources: [/^api\/src\/routes\/catalog\.ts/, /^web\/src\/(views\/Catalog|components\/(Catalog|Models))/],
  },
  facturation: {
    tests: ['billing', 'documents'],
    sources: [/^api\/src\/(billing|pdf|facturx|numbering)[^/]*\.ts/, /^api\/src\/routes\/(billing|documents)\.ts/, /^web\/src\/views\/(Billing|Documents)/],
  },
  stock: {
    tests: ['stock'],
    sources: [/^api\/src\/(stock|cutting)[^/]*\.ts/, /^api\/src\/routes\/stock\.ts/, /^web\/src\/views\/Stock/],
  },
  equipe: {
    tests: ['employees'],
    sources: [/^api\/src\/routes\/(employees|audit)\.ts/, /^web\/src\/views\/(Employee|Audit)/],
  },
  site: {
    tests: ['site', 'espace'],
    sources: [/^api\/src\/routes\/(public|site|espace|mail)\.ts/, /^web\/src\/views\/(site|SiteAdmin)/, /^web\/src\/components\/Public/],
  },
  boutique: {
    tests: ['boutique'],
    sources: [/^api\/src\/routes\/(boutique|paiement)\.ts/, /^web\/src\/views\/(Product|site\/(Boutique|Panier|Paiement))/],
  },
  responsive: {
    tests: ['responsive'],
    sources: [/^web\/src\/(style\.css|components\/(AppLayout|PublicLayout))/],
  },
}

// Un changement ici peut casser n'importe quel parcours : on rejoue tout.
export const TRANSVERSE = [
  /^api\/src\/(db\/|server|app|index|env|csrf|audit)[^/]*/,
  /^api\/package(-lock)?\.json/,
  /^web\/(package(-lock)?\.json|vite\.config|index\.html)/,
  /^web\/src\/(main|router|api)\.ts/,
  /^web\/src\/(App\.vue|components\/(App|Brand))/,
  /^e2e\/(?!groupes\.mjs$)[^/]+$/,
  /^e2e\/tests\/fixtures\.ts/,
  /^compose[^/]*\.ya?ml/,
  /^(api|web)\/(Dockerfile|nginx)/,
  /^\.github\/workflows\/ci\.yml/,
]
