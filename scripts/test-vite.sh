#!/usr/bin/env bash
# Tests rapides pendant le dev : on ne rejoue que les tests touchés par les fichiers modifiés.
#   - API et composants : vitest --changed (les tests qui importent un fichier modifié) ;
#   - Playwright : les fichiers de test modifiés, sur Chromium seulement.
# Par défaut, « modifié » veut dire « pas encore commité ». DEPUIS=dev (ou un commit) élargit la comparaison.
# La suite complète reste obligatoire avant une PR (make test-api, make test-web, make e2e) et la CI la rejoue.
set -euo pipefail
cd "$(dirname "$0")/.."

DEPUIS="${DEPUIS:-HEAD}"
E2E=(docker compose -p abatelier-e2e -f compose.yaml -f compose.e2e.yaml)

changed=$({ git diff --name-only "$DEPUIS"; git ls-files --others --exclude-standard; } | sort -u)
if [ -z "$changed" ]; then
  echo "Aucun fichier modifié depuis $DEPUIS : rien à tester."
  exit 0
fi
echo "Fichiers modifiés depuis $DEPUIS :"
sed 's/^/  /' <<<"$changed"

touches() { grep -q "^$1/" <<<"$changed"; }

if touches api; then
  echo; echo "▶ Tests d'API concernés (lancer « make dev-d » avant)"
  (cd api && npx vitest run --changed "$DEPUIS" --passWithNoTests)
fi

if touches web; then
  echo; echo "▶ Tests de composants concernés"
  (cd web && npx vitest run --changed "$DEPUIS" --passWithNoTests)
fi

if touches e2e/tests; then
  echo; echo "▶ Parcours Playwright modifiés (Chromium)"
  # Stack e2e déjà démarrée (make e2e-up) : on la garde. Sinon on la crée puis on la supprime.
  started=0
  if [ -z "$("${E2E[@]}" ps -q)" ]; then
    "${E2E[@]}" up -d --build --wait
    started=1
  fi
  status=0
  (cd e2e && npx playwright test --only-changed="$DEPUIS" --project=chromium --pass-with-no-tests) || status=$?
  [ "$started" = 1 ] && "${E2E[@]}" down -v
  exit "$status"
fi

echo
echo "Les parcours Playwright ne sont pas rejoués pour un changement de l'appli seule :"
echo "  make e2e PAGE=<fichier> pour un parcours précis, make e2e pour tout."
