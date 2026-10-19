PROD = docker compose -f compose.yaml -f compose.prod.yaml

.PHONY: help setup secrets dev dev-d down logs prod prod-down check feature pr promote-staging promote-main

help: ## Liste les commandes
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-16s %s\n", $$1, $$2}'

setup: ## Première installation : hooks Git, .env, secrets, dépendances
	git config core.hooksPath .githooks
	@[ -f .env ] || cp .env.example .env
	./scripts/init-secrets.sh
	cd api && npm ci
	cd web && npm ci

secrets: ## Crée les secrets manquants dans secrets/
	./scripts/init-secrets.sh

dev: ## Lance l'environnement de dev (http://localhost:5173)
	docker compose up --build

dev-d: ## Idem, en arrière-plan
	docker compose up -d --build

down: ## Arrête l'environnement de dev
	docker compose down

logs: ## Suit les logs de l'API
	docker compose logs -f api

prod: ## Lance la prod ou le staging (Caddy + HTTPS, DOMAIN dans .env)
	$(PROD) up -d --build

prod-down: ## Arrête la prod
	$(PROD) down

check: ## Vérifie les types et compile l'API et le front
	cd api && npm run typecheck
	cd web && npm run build

feature: ## Crée une branche de travail depuis dev : make feature nom=commandes
	@test -n "$(nom)" || { echo "Usage : make feature nom=ma-fonction"; exit 1; }
	git switch dev
	-git pull --ff-only
	git switch -c feature/$(nom)

pr: ## Ouvre la Pull Request de la branche courante vers dev
	@case "$$(git branch --show-current)" in feature/*) ;; *) echo "Placez-vous sur une branche feature/…"; exit 1;; esac
	git push -u origin HEAD
	gh pr create --base dev --fill

promote-staging: ## Ouvre la PR dev → staging
	gh pr create --base staging --head dev --title "Mise en staging" --body "Promotion de dev vers staging."

promote-main: ## Ouvre la PR staging → main (mise en production)
	gh pr create --base main --head staging --title "Mise en production" --body "Promotion de staging vers main."
