#!/bin/sh
# Sauvegardes PostgreSQL, exécuté dans le container « backup ».
#
#   backup.sh loop              planification : une sauvegarde par jour à BACKUP_TIME
#   backup.sh now [étiquette]   sauvegarde immédiate
#   backup.sh list              liste les sauvegardes
#   backup.sh verify            restaure la dernière sauvegarde dans une base temporaire et compare
#   backup.sh check FICHIER     vérifie qu'un fichier existe et n'est pas abîmé (empreinte SHA-256)
#   backup.sh restore FICHIER   remplace le contenu de la base par la sauvegarde (après en avoir fait une)
#   backup.sh health            utilisé par le healthcheck Docker
set -eu

DIR=/backups
DAILY_KEEP=${BACKUP_KEEP_DAILY:-14}
WEEKLY_KEEP=${BACKUP_KEEP_WEEKLY:-8}
AT=${BACKUP_TIME:-02:30}
VERIFY_DB=patalu_verif

export PGHOST="${PGHOST:-db}" PGUSER="${PGUSER:-patalu}" PGDATABASE="${PGDATABASE:-patalu}"
PGPASSWORD="$(cat /run/secrets/db_password)"
export PGPASSWORD

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*"; }
fail() { log "ERREUR : $*" >&2; exit 1; }

rotate() {
  # Garde les $2 plus récentes du dossier $1
  ls -1t "$DIR/$1"/*.dump 2>/dev/null | tail -n +"$(($2 + 1))" | while read -r f; do
    rm -f "$f" "$f.sha256"
    log "Rotation : $1/$(basename "$f") supprimée"
  done
}

dump() {
  mkdir -p "$DIR/daily" "$DIR/weekly"
  name="patalu-$(date +%Y-%m-%d_%H%M%S)${1:+-$1}.dump"
  tmp="$DIR/.$name.part"
  trap 'rm -f "$tmp"' EXIT

  pg_dump --format=custom --compress=9 --no-owner --file="$tmp"
  # Un fichier illisible ne doit jamais remplacer une bonne sauvegarde
  pg_restore --list "$tmp" >/dev/null || fail "la sauvegarde produite est illisible"
  mv "$tmp" "$DIR/daily/$name"
  trap - EXIT
  (cd "$DIR/daily" && sha256sum "$name" >"$name.sha256")

  # Le dimanche, la sauvegarde est aussi gardée comme hebdomadaire
  if [ "$(date +%u)" = 7 ]; then cp "$DIR/daily/$name" "$DIR/daily/$name.sha256" "$DIR/weekly/"; fi

  rotate daily "$DAILY_KEEP"
  rotate weekly "$WEEKLY_KEEP"
  date +%s >"$DIR/.last_ok"
  log "Sauvegarde OK : daily/$name ($(du -h "$DIR/daily/$name" | cut -f1))"
}

loop() {
  log "Sauvegarde planifiée tous les jours à $AT ($TZ). Conservées : $DAILY_KEEP quotidiennes, $WEEKLY_KEEP hebdomadaires."
  # Au démarrage, si la dernière sauvegarde a plus de 24 h (ou n'existe pas), on en fait une tout de suite
  if [ ! -f "$DIR/.last_ok" ] || [ $(($(date +%s) - $(cat "$DIR/.last_ok"))) -gt 86400 ]; then
    dump || log "ÉCHEC de la sauvegarde"
  fi
  last=""
  while true; do
    if [ "$(date +%H:%M)" = "$AT" ] && [ "$last" != "$(date +%F)" ]; then
      last=$(date +%F)
      (dump) || log "ÉCHEC de la sauvegarde"
    fi
    sleep 20
  done
}

list() {
  for d in daily weekly; do
    echo "== $d"
    ls -1t "$DIR/$d"/*.dump 2>/dev/null | while read -r f; do
      printf '  %-48s %6s\n' "$(basename "$f")" "$(du -h "$f" | cut -f1)"
    done
  done
  [ -f "$DIR/.last_ok" ] && echo "Dernière sauvegarde réussie : $(date -d "@$(cat "$DIR/.last_ok")" '+%Y-%m-%d %H:%M')"
}

resolve() {
  case "$1" in
    /*) f="$1" ;;
    daily/* | weekly/*) f="$DIR/$1" ;;
    *) f="$DIR/daily/$1" ;;
  esac
  [ -f "$f" ] || fail "fichier introuvable : $1 (voir « make backups »)"
  if [ -f "$f.sha256" ]; then
    (cd "$(dirname "$f")" && sha256sum -c -s "$(basename "$f").sha256") || fail "empreinte SHA-256 incorrecte : fichier abîmé"
  fi
  echo "$f"
}

verify() {
  latest=$(ls -1t "$DIR"/daily/*.dump 2>/dev/null | head -1)
  [ -n "$latest" ] || fail "aucune sauvegarde à vérifier"
  latest=$(resolve "$latest")
  log "Vérification de $(basename "$latest") : restauration dans la base temporaire $VERIFY_DB"
  dropdb --if-exists "$VERIFY_DB"
  createdb "$VERIFY_DB"
  trap 'dropdb --if-exists "$VERIFY_DB"' EXIT
  pg_restore --no-owner --exit-on-error --dbname="$VERIFY_DB" "$latest"

  status=0
  printf '  %-20s %10s %10s\n' table actuelle sauvegarde
  for t in users employees materials colors pricing_settings piece_models accessories delivery_settings company_settings document_template document_counters clients client_sites orders order_lines order_events billing_documents site_content site_photos contact_requests email_log sessions login_attempts audit_log; do
    now=$(psql -Atc "select count(*) from \"$t\"")
    saved=$(psql -d "$VERIFY_DB" -Atc "select count(*) from \"$t\"" 2>/dev/null) || { saved=ABSENTE; status=1; }
    printf '  %-20s %10s %10s\n' "$t" "$now" "$saved"
    # En mode strict (CI), la base ne bouge pas : les comptes doivent être identiques
    if [ "${BACKUP_VERIFY_STRICT:-0}" = 1 ] && [ "$now" != "$saved" ]; then status=1; fi
  done
  [ "$status" = 0 ] || fail "la sauvegarde ne correspond pas à la base"
  log "Vérification OK : la sauvegarde se restaure correctement"
}

restore() {
  [ -n "${1:-}" ] || fail "indiquez le fichier : make restore fichier=patalu-AAAA-MM-JJ_HHMMSS.dump"
  f=$(resolve "$1")
  log "Sauvegarde de sécurité de l'état actuel avant restauration"
  (dump avant-restauration)
  log "Restauration de $(basename "$f") dans $PGDATABASE"
  pg_restore --clean --if-exists --no-owner --single-transaction --exit-on-error --dbname="$PGDATABASE" "$f"
  log "Restauration terminée"
}

health() {
  [ -f "$DIR/.last_ok" ] || exit 1
  # Une sauvegarde par jour : au-delà de 26 h sans succès, le container est signalé en mauvaise santé
  [ $(($(date +%s) - $(cat "$DIR/.last_ok"))) -lt 93600 ]
}

cmd=${1:-loop}
[ $# -gt 0 ] && shift
case "$cmd" in
  loop) loop ;;
  now) dump "${1:-manuel}" ;;
  list) list ;;
  verify) verify ;;
  check) resolve "${1:?indiquez le fichier}" >/dev/null && log "Fichier valide : ${1}" ;;
  restore) restore "${1:-}" ;;
  health) health ;;
  *) fail "commande inconnue : $cmd" ;;
esac
