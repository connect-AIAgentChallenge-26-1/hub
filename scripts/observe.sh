#!/usr/bin/env bash

set -Eeuo pipefail
# shellcheck source=scripts/lib/common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"

ensure_env_file
load_env_file
assert_docker_engine
assert_mock_mode

log 'starting base infrastructure, Prometheus, and Grafana'
compose_observe up --detach --build --wait

log "Prometheus: http://localhost:${PROMETHEUS_PORT:-9090}"
log "Grafana:    http://localhost:${GRAFANA_PORT:-3001}"
log 'Prometheus reports the backend target as up after make dev is active on port 8080'
