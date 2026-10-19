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

echo
echo "Mot de passe du premier compte admin : secrets/admin_password.txt"
