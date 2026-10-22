#!/usr/bin/env bash
# Remonte la base de DÉVELOPPEMENT de zéro, dans l'un de ces états :
#
#   scripts/bdd.sh minimale   rien que le nécessaire : schéma, catalogue de départ (matières, coloris, modèles,
#                             accessoires, tarifs, livraison, documents) et le compte admin
#   scripts/bdd.sh demo       la base de démonstration : équipe, clients, commandes à toutes les étapes, devis, factures,
#                             avoir, boutique en ligne avec photos et stock de feuilles
#
# Une sauvegarde est faite d'abord (« make backups », « make restore »). Jamais en production.
#   --oui          ne demande pas confirmation
# Pour essayer sans toucher à la base de dev : BDD_NOM=patalu_essai scripts/bdd.sh demo --oui
set -euo pipefail
cd "$(dirname "$0")/.."

mode="${1:-}"
case "$mode" in minimale | demo) ;; *)
  sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
  ;;
esac
oui="${2:-}"
nom="${BDD_NOM:-patalu}"
dc="docker compose"

case "$nom" in patalu_test | postgres | template0 | template1)
  echo "✗ Base « $nom » interdite : c'est celle des tests ou du serveur."
  exit 1
  ;;
esac
$dc ps --status running --services | grep -qx db || { echo "✗ L'environnement de dev ne tourne pas : lancez « make dev-d »."; exit 1; }
if [ "$($dc exec -T api printenv NODE_ENV 2>/dev/null | tr -d '\r')" = "production" ]; then
  echo "✗ Refusé : l'API tourne en production."
  exit 1
fi

if [ "$oui" != "--oui" ]; then
  echo "Cela va REMPLACER tout le contenu de la base « $nom » par la base « $mode »."
  [ "$nom" = "patalu" ] && echo "(une sauvegarde est faite avant : « make backups » pour la retrouver)"
  read -r -p "Taper « oui » pour continuer : " reponse
  [ "$reponse" = "oui" ] || { echo "Annulé."; exit 1; }
fi

if [ "$nom" = "patalu" ]; then
  echo "→ Sauvegarde de la base actuelle"
  $dc exec -T backup /bin/sh /opt/backup/backup.sh now avant-remise-a-zero | tail -1
  echo "→ Arrêt de l'API"
  $dc stop api >/dev/null
fi

echo "→ Base « $nom » recréée"
psql() { $dc exec -T db psql -U patalu -d postgres -v ON_ERROR_STOP=1 -q "$@"; }
psql -c "DROP DATABASE IF EXISTS \"$nom\" WITH (FORCE)"
psql -c "CREATE DATABASE \"$nom\" OWNER patalu"

if [ "$nom" = "patalu" ]; then
  echo "→ Démarrage de l'API (schéma, catalogue de départ, compte admin)"
  $dc up -d --wait api >/dev/null
  run() { $dc exec -T api "$@"; }
else
  echo "→ Schéma et catalogue de départ"
  run() { $dc exec -T -e "DB_NAME=$nom" api "$@"; }
  run npx tsx src/migrate.ts 2>&1 | grep -v '^{"level"' | grep -v '^npm ' || true
fi

if [ "$mode" = "demo" ]; then
  echo "→ Équipe, clients, commandes, devis et factures"
  run npx tsx src/demo.ts 2>&1 | grep -v '^{"level"' | grep -v '^npm '
  echo "→ Boutique et stock de feuilles"
  run npx tsx src/demo-boutique.ts 2>&1 | grep -v '^{"level"' | grep -v '^npm '
fi

echo
echo "✓ Base « $nom » prête ($mode)."
if [ "$nom" = "patalu" ]; then
  echo "  Compte admin : admin, mot de passe dans secrets/admin_password.txt"
fi
if [ "$mode" = "demo" ]; then
  echo "  Comptes de démonstration (mot de passe : Demo-Alu-Pliage-2026!) : demo-direction, demo-rh, demo-atelier"
fi
