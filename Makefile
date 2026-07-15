SHELL := /bin/bash
.DEFAULT_GOAL := help

.PHONY: help setup up down run test integration eval edge-check actionlint naver-live-contract llm-live-contract workflow-live-probe workflow-live-linked workflow-live-linked-dev check observe load-smoke reset

help: ## Show the canonical development commands.
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z0-9_-]+:.*## / {printf "\033[36m%-16s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

setup: ## Validate Java 17 and required tools; create .env only when absent.
	@bash scripts/setup.sh

up: ## Start PostgreSQL, Redis, and the two mock APIs and wait for health.
	@bash scripts/up.sh

down: ## Remove non-Dev-Container services without deleting data volumes.
	@bash scripts/down.sh

run: ## Start infrastructure and run the backend with the local profile.
	@bash scripts/run.sh

test: ## Run Docker-free unit tests.
	@bash scripts/test.sh unit

integration: ## Run Testcontainers and WireMock integration/contract tests.
	@bash scripts/test.sh integration

eval: ## Validate and run deterministic evaluation fixtures.
	@bash scripts/test.sh eval

edge-check: ## Run the secret-free Approval Gate and Provider Gateway checks.
	@npm run edge:check

actionlint: ## Validate GitHub Actions workflows with the pinned actionlint image.
	@bash scripts/actionlint.sh

naver-live-contract: ## Run exactly one Naver Local and one Blog live contract request.
	@bash scripts/naver-live-contract.sh

llm-live-contract: ## Run one Elice Chat and one Embedding live contract request.
	@bash scripts/llm-live-contract.sh

workflow-live-probe: ## Run the four-call split-provider live workflow probe for an approved main SHA.
	@bash scripts/workflow-live-probe.sh

workflow-live-linked: ## Run one allowlisted Naver-to-Elice scenario for an approved main SHA.
	@bash scripts/workflow-live-linked.sh

workflow-live-linked-dev: ## Re-run one reviewed scenario from the pushed validation branch.
	@WORKFLOW_LINKED_EXECUTION_POLICY=development bash scripts/workflow-live-linked.sh

check: ## Run policy, docs, Compose, shell, unit, integration, and eval checks once.
	@bash scripts/check.sh

observe: ## Start Prometheus and Grafana alongside the base infrastructure.
	@bash scripts/observe.sh

load-smoke: ## Run the one-iteration Actuator health smoke test in k6.
	@bash scripts/load-smoke.sh

reset: ## Delete local service containers and application data after confirmation.
	@bash scripts/reset.sh
