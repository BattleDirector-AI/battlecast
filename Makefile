# battlecast dev tasks. `make dev` runs the whole local stack (app + mock producer
# + companion server) under one prefixed log; Ctrl+C stops all of it. Recipes only
# shell out to `node`/`npm`, so they work the same on Windows, macOS, and Linux.

.DEFAULT_GOAL := help

.PHONY: help install dev dev-live dev-app dev-mock dev-server build test lint

# Optional single-phase lock for the mock producer, for eye-testing one session type:
#   make dev PHASE=race        (full stack, mock locked to the race)
#   make dev-mock PHASE=qualifying
# Exported so it reaches the mock child that scripts/dev.mjs spawns. Empty = normal
# qualifying → grid → race → results cycling. Valid: qualifying|grid|race|results.
export PHASE

help: ## List available targets
	@node -e "const fs=require('fs');for(const l of fs.readFileSync('Makefile','utf8').split('\n')){const m=l.match(/^([a-z-]+):.*?## (.*)$$/);if(m)console.log('  make '+m[1].padEnd(12)+m[2])}"

install: ## Install app dependencies (server + mock are zero-dependency)
	npm --prefix app install

dev: ## Run the full stack: app :5173, mock :8080, server :7397 (PHASE=race locks the session)
	node scripts/dev.mjs

dev-live: ## Run app :5173 + server :7397 only — no mock, for driving a real producer
	node scripts/dev.mjs --no-mock

dev-app: ## Run only the Vite app dev server (:5173)
	npm --prefix app run dev

dev-mock: ## Run only the mock producer (:8080). PHASE=race|qualifying|grid|results locks it
	node producers/mock/server.js simulate $(PHASE)

dev-server: ## Run only the companion config/asset server (:7397)
	node server/serve.js

build: ## Build the production app bundle (app/dist)
	npm --prefix app run build

test: ## Run the app test suite
	npm --prefix app test

lint: ## Lint the app
	npm --prefix app run lint
