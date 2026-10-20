#!/usr/bin/env sh
# Crée les fichiers de secrets manquants avec des mots de passe aléatoires.
# Ne remplace jamais un secret existant : la base garde le mot de passe de sa création.
set -eu

dir="$(dirname "$0")/../secrets"
mkdir -p "$dir"
chmod 700 "$dir"

for name in db_password admin_password; do
  file="$dir/$name.txt"
  if [ -s "$file" ]; then
    echo "• $name : existe déjà"
  else
    # 24 caractères sans symboles ambigus, utilisables dans une URL
    LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 24 >"$file"
    # Lisible par l'utilisateur du container (le dossier, lui, reste privé)
    chmod 644 "$file"
    echo "• $name : créé"
  fi
done

# Clé de l'API Google (avis du site) : fichier vide tant qu'on n'en a pas, à remplir à la main
file="$dir/google_places_api_key.txt"
if [ ! -e "$file" ]; then
  : >"$file"
  chmod 644 "$file"
  echo "• google_places_api_key : fichier vide créé (à remplir quand la clé sera disponible)"
fi

echo
echo "Mot de passe du premier compte admin : secrets/admin_password.txt"
