PROD = docker compose -f compose.yaml -f compose.prod.yaml
E2E = docker compose -p patalu-e2e -f compose.yaml -f compose.e2e.yaml
# Même projet « patalu » en dev et en prod : ces commandes marchent sur les deux
BASE = docker compose -f compose.yaml
BK = $(BASE) exec -T backup /bin/sh /opt/backup/backup.sh
# Filtres de « make e2e » : PAGE=catalogue (cherché dans le nom du fichier et le titre des tests),
# ECRAN=chromium | firefox | telephone | tablette
PW_ARGS = $(if $(PAGE),--grep "$(PAGE)") $(if $(ECRAN),--project=$(ECRAN))

.PHONY: help setup secrets dev dev-d down logs prod prod-down check demo test test-vite test-api test-web e2e e2e-up e2e-down apercu backup backups backup-verify restore backup-export feature pr promote-staging promote-main

help: ## Liste les commandes
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-16s %s\n", $$1, $$2}'

setup: ## Première installation : hooks Git, .env, secrets, dépendances
	git config core.hooksPath .githooks
	@[ -f .env ] || cp .env.example .env
	./scripts/init-secrets.sh
	cd api && npm ci
	cd web && npm ci
	cd e2e && npm ci && npx playwright install chromium firefox

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

check: ## Vérifie les types et compile l'API, le front et les tests e2e
	cd api && npm run typecheck && npm run build
	cd web && npm run build
	cd e2e && npm run typecheck

test: test-api test-web e2e ## Lance tous les tests (API, composants, Playwright)

test-vite: ## Rejoue seulement les tests touchés par les fichiers modifiés (DEPUIS=dev pour comparer à une branche)
	$(if $(DEPUIS),DEPUIS=$(DEPUIS)) ./scripts/test-vite.sh

test-api: ## Tests des routes API (base patalu_test, lancer « make dev-d » avant)
	cd api && npm test

test-web: ## Tests des composants Vue
	cd web && npm test

e2e: ## Tests Playwright sur une stack de prod jetable (filtres : PAGE=catalogue ECRAN=firefox)
	$(E2E) up -d --build --wait
	cd e2e && npx playwright test $(PW_ARGS); status=$$?; cd .. && $(E2E) down -v; exit $$status

apercu: ## Captures de toutes les pages (téléphone, tablette, ordinateur, clair et sombre) : apercus/index.html
	rm -rf apercus
	$(E2E) up -d --build --wait
	cd e2e && npx playwright test -c apercu.config.ts; status=$$?; cd .. && $(E2E) down -v; exit $$status
	@echo "Ouvrir : $$(pwd)/apercus/index.html"

demo: ## Remplit la base de dev vide avec des clients, commandes, devis et factures de démonstration (comptes demo-*)
	docker compose exec -T api npx tsx src/demo.ts 2>&1 | grep -v '^{"level"'

e2e-up: ## Démarre seulement la stack e2e (pour « cd e2e && npm run test:ui »)
	$(E2E) up -d --build --wait

e2e-down: ## Supprime la stack e2e
	$(E2E) down -v

backup: ## Sauvegarde la base tout de suite
	$(BK) now manuel

backups: ## Liste les sauvegardes
	$(BK) list

backup-verify: ## Restaure la dernière sauvegarde dans une base temporaire et vérifie
	$(BK) verify

restore: ## Restaure une sauvegarde : make restore fichier=patalu-AAAA-MM-JJ_HHMMSS-manuel.dump
	@test -n "$(fichier)" || { echo "Usage : make restore fichier=… (voir « make backups »)"; exit 1; }
	$(BK) check "$(fichier)"
	$(BASE) stop api
	$(BK) restore "$(fichier)"; status=$$?; $(BASE) start api; exit $$status

backup-export: ## Copie toutes les sauvegardes dans ./backups (pour les mettre ailleurs)
	mkdir -p backups
	$(BASE) cp backup:/backups/. ./backups/
	@echo "Copiées dans ./backups : à mettre sur un autre support (disque, NAS, cloud)."

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
