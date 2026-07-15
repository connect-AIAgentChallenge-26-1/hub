SHELL := /bin/bash
.DEFAULT_GOAL := help

.PHONY: help setup dev dev-live test integration eval actionlint check live-evidence build-images observe down reset

help: ## Show the canonical development commands.
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z0-9_-]+:.*## / {printf "\033[36m%-16s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

setup: ## Validate Java 17, Node 24, Docker, and install locked dependencies.
	@bash scripts/setup.sh

dev: ## Run PostgreSQL, Redis, backend, and frontend with in-process Mock providers.
	@bash scripts/dev.sh mock

dev-live: ## Run the visible playground with direct Naver and Elice providers.
	@bash scripts/dev.sh live-dev

test: ## Run Docker-free Java and frontend unit tests.
	@bash scripts/test.sh unit
	@npm run test --workspace @placepick/frontend

integration: ## Run Testcontainers and WireMock integration/contract tests.
	@bash scripts/test.sh integration

eval: ## Validate and run deterministic evaluation fixtures.
	@bash scripts/test.sh eval

actionlint: ## Validate GitHub Actions workflows with the pinned actionlint image.
	@bash scripts/actionlint.sh

check: ## Run policy, docs, Compose, frontend, Java unit/integration/Eval checks once.
	@bash scripts/check.sh

live-evidence: ## Run three fixed direct Naver-to-Elice evidence scenarios outside CI.
	@bash scripts/live-evidence.sh

build-images: ## Build the production Java 17 backend image and Next.js output.
	@bash scripts/build-images.sh

observe: ## Start Prometheus and Grafana alongside PostgreSQL and Redis.
	@bash scripts/observe.sh

down: ## Stop local services without deleting data volumes.
	@bash scripts/down.sh

reset: ## Delete local PostgreSQL, Redis, and Grafana data after confirmation.
	@bash scripts/reset.sh
