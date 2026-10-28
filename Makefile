PROD = docker compose -f compose.yaml -f compose.prod.yaml
E2E = docker compose -p abatelier-e2e -f compose.yaml -f compose.e2e.yaml
# Même projet « abatelier » en dev et en prod : ces commandes marchent sur les deux
BASE = docker compose -f compose.yaml
BK = $(BASE) exec -T backup /bin/sh /opt/backup/backup.sh
# Filtres de « make e2e » : PAGE=catalogue (cherché dans le nom du fichier et le titre des tests),
# ECRAN=chromium | firefox | telephone | tablette
# GROUPE=stock,auth : seulement ces groupes (voir e2e/groupes.mjs, « make e2e-groupes »)
PW_ARGS = $(if $(PAGE),--grep "$(PAGE)") $(if $(ECRAN),--project=$(ECRAN)) $(if $(GROUPE),$(shell cd e2e && node select.mjs --groupes $(GROUPE)))

.PHONY: stripe-ecoute e2e-groupes help setup secrets dev dev-d down logs prod prod-down check lint format bdd-minimale bdd-demo mdp demo demo-boutique mails test test-vite test-api test-web e2e e2e-up e2e-down apercu backup backups backup-verify restore backup-export feature pr promote-staging promote-main

help: ## Liste les commandes
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-16s %s\n", $$1, $$2}'

setup: ## Première installation : hooks Git, .env, secrets, dépendances
	git config core.hooksPath .githooks
	@[ -f .env ] || cp .env.example .env
	./scripts/init-secrets.sh
	npm ci
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
	cd e2e && npm run typecheck && node select.mjs --verifier
	for f in scripts/*.sh scripts/backup/*.sh; do bash -n $$f || exit 1; done

lint: ## Linter (ESLint) et vérification de la mise en forme (Prettier) : les mêmes contrôles que la CI
	npm run lint

format: ## Remet en forme tout le code avec Prettier
	npm run format

test: test-api test-web e2e ## Lance tous les tests (API, composants, Playwright)

test-vite: ## Rejoue seulement les tests touchés par les fichiers modifiés (DEPUIS=dev pour comparer à une branche)
	$(if $(DEPUIS),DEPUIS=$(DEPUIS)) ./scripts/test-vite.sh

test-api: ## Tests des routes API (base abatelier_test, lancer « make dev-d » avant)
	cd api && npm test

test-web: ## Tests des composants Vue
	cd web && npm test

e2e: ## Tests Playwright sur une stack de prod jetable (filtres : GROUPE=stock,auth PAGE=catalogue ECRAN=firefox)
	$(E2E) up -d --build --wait
	cd e2e && npx playwright test $(PW_ARGS); status=$$?; cd .. && $(E2E) down -v; exit $$status

apercu: ## Captures de toutes les pages (téléphone, tablette, ordinateur, clair et sombre) : apercus/index.html
	rm -rf apercus
	$(E2E) up -d --build --wait
	cd e2e && npx playwright test -c apercu.config.ts; status=$$?; cd .. && $(E2E) down -v; exit $$status
	@echo "Ouvrir : $$(pwd)/apercus/index.html"

bdd-minimale: ## Remonte la base de dev de zéro, avec le strict nécessaire (catalogue de départ + compte admin). Sauvegarde avant.
	./scripts/bdd.sh minimale

bdd-demo: ## Remonte la base de dev de zéro, en démonstration complète (équipe, clients, commandes, factures, boutique, stock). Sauvegarde avant.
	./scripts/bdd.sh demo

mdp: ## Mot de passe oublié : make mdp COMPTE=admin (mot de passe provisoire affiché une fois)
	@test -n "$(COMPTE)" || { echo "Usage : make mdp COMPTE=identifiant"; exit 1; }
	docker compose exec -T api npx tsx src/reset-password.ts "$(COMPTE)" 2>&1 | grep -v '^{"level"' | grep -v '^npm '

demo-boutique: ## Ajoute à la base de dev des produits de boutique en ligne (avec photos) et du stock de feuilles, sans rien supprimer
	docker compose exec -T api npx tsx src/demo-boutique.ts 2>&1 | grep -v '^{"level"'

demo: ## Remplit la base de dev vide avec des clients, commandes, devis et factures de démonstration (comptes demo-*)
	docker compose exec -T api npx tsx src/demo.ts 2>&1 | grep -v '^{"level"'

mails: ## Ouvre la boîte de réception de test des e-mails (Mailpit, http://localhost:8025)
	@echo "http://localhost:$${MAILPIT_PORT:-8025}"; xdg-open http://localhost:$${MAILPIT_PORT:-8025} >/dev/null 2>&1 || true

e2e-groupes: ## Liste les groupes de tests e2e et ce que « make e2e-diff » lancerait
	@cd e2e && node -e "import('./groupes.mjs').then(({GROUPES})=>{for(const[n,g]of Object.entries(GROUPES))console.log(n.padEnd(12),g.tests.join(', '))})"
	@echo "Selon vos changements depuis origin/dev : $$(cd e2e && node select.mjs --diff origin/dev)"

e2e-up: ## Démarre seulement la stack e2e (pour « cd e2e && npm run test:ui »)
	$(E2E) up -d --build --wait

stripe-ecoute: ## Relaie les notifications de paiement Stripe (mode test) vers l'appli de dev ; affiche le secret whsec_… à copier (voir docs/stripe-test.md)
	@test -s secrets/stripe_secret_key.txt || { echo "Mettez d'abord la clé secrète de test (sk_test_…) dans secrets/stripe_secret_key.txt"; exit 1; }
	docker run --rm -it --network host -e STRIPE_API_KEY="$$(cat secrets/stripe_secret_key.txt)" stripe/stripe-cli listen --forward-to localhost:$${WEB_PORT:-5173}/api/paiement/stripe

e2e-down: ## Supprime la stack e2e
	$(E2E) down -v

backup: ## Sauvegarde la base tout de suite
	$(BK) now manuel

backups: ## Liste les sauvegardes
	$(BK) list

backup-verify: ## Restaure la dernière sauvegarde dans une base temporaire et vérifie
	$(BK) verify

restore: ## Restaure une sauvegarde : make restore fichier=abatelier-AAAA-MM-JJ_HHMMSS-manuel.dump
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
