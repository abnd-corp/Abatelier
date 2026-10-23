#!/usr/bin/env sh
# Contrôle des factures électroniques avec le validateur officiel Mustang (PDF/A-3, XML Factur-X, règles EN 16931).
#   ./scripts/facturx/valider.sh            fabrique des exemples et les valide
# Nécessite Docker (Java tourne dans un container) et un accès à Internet la première fois (téléchargement du validateur).
set -eu
cd "$(dirname "$0")/../.."

VERSION=2.26.0
SHA256=42d7868cb68264874a7b8cab4c3587b03b23ccc7cd72373da917f66758bb9736
CACHE=.cache/facturx
OUT="$CACHE/exemples"
JAR="$CACHE/Mustang-CLI-$VERSION.jar"

mkdir -p "$CACHE"
if [ ! -f "$JAR" ]; then
  echo "• Téléchargement du validateur Mustang $VERSION"
  curl -fsSL -o "$JAR" "https://repo1.maven.org/maven2/org/mustangproject/Mustang-CLI/$VERSION/Mustang-CLI-$VERSION.jar"
fi
echo "$SHA256  $JAR" | sha256sum -c - >/dev/null || { echo "✗ Somme de contrôle du validateur incorrecte"; rm -f "$JAR"; exit 1; }

rm -rf "$OUT"
(cd api && npx tsx ../scripts/facturx/exemples.mts "../$OUT")

status=0
for pdf in "$OUT"/*.pdf; do
  printf '• %s : ' "$(basename "$pdf")"
  # Le rapport XML de Mustang dit « valid » ou « invalid » et détaille chaque règle
  report=$(docker run --rm -v "$PWD/$CACHE:/work" -w /work eclipse-temurin:21-jre java -jar "Mustang-CLI-$VERSION.jar" --action validate --no-notices --source "exemples/$(basename "$pdf")" 2>&1) || true
  # Aucune erreur, et aucun avertissement non plus : une règle française non respectée est signalée en avertissement
  # Le rapport a un résumé pour le PDF/A et un pour le XML : aucun ne doit être « invalid »
  if echo "$report" | grep -q '<summary status="valid"' && ! echo "$report" | grep -qE 'summary status="invalid"|WARN .*Warning|ERROR '; then
    echo "valide"
  else
    echo "INVALIDE"
    echo "$report" | grep -oE 'summary status="[a-z]+"|errorMessage=[^]]*|WARN .*|ERROR .*|BR-[A-Z0-9-]+[^<]*' | sort -u | head -30
    status=1
  fi
done
exit $status
