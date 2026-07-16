#!/usr/bin/env bash

set -Eeuo pipefail
# shellcheck source=scripts/lib/common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"

mode="${1:-mock}"
[[ "${mode}" == 'mock' || "${mode}" == 'live-dev' ]] || die 'usage: scripts/dev.sh {mock|live-dev}'

ensure_env_file
load_env_file
assert_java17
assert_node24
assert_docker_engine

if [[ "${mode}" == 'mock' ]]; then
  assert_mock_mode
else
  [[ -f "${ROOT_DIR}/.env.live.local" ]] || die '.env.live.local is required for direct live development'
fi

compose_base up --detach --wait

database_host="${POSTGRES_HOST:-localhost}"
redis_host="${REDIS_HOST:-localhost}"
if command -v getent >/dev/null 2>&1 && getent hosts postgres >/dev/null 2>&1; then
  database_host=postgres
  redis_host=redis
fi

export SPRING_PROFILES_ACTIVE='local,live-dev'
export SPRING_DATASOURCE_URL="jdbc:postgresql://${database_host}:5432/${POSTGRES_DB:-placepick}"
export SPRING_DATASOURCE_USERNAME="${POSTGRES_USER:-placepick}"
export SPRING_DATASOURCE_PASSWORD="${POSTGRES_PASSWORD:-placepick-local-only}"
export SPRING_DATA_REDIS_HOST="${redis_host}"
export SPRING_DATA_REDIS_PORT=6379
export PLACEPICK_EXTERNAL_MODE="${mode}"
export NEXT_PUBLIC_PRODUCT_API_MODE=api
export NEXT_PUBLIC_PLAYGROUND_API_MODE=api
export BACKEND_ORIGIN=http://127.0.0.1:8080

backend_pid=''
cleanup() {
  if [[ -n "${backend_pid}" ]] && kill -0 "${backend_pid}" 2>/dev/null; then
    kill "${backend_pid}" 2>/dev/null || true
    wait "${backend_pid}" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

log "starting backend playground in ${mode} mode"
gradlew :backend:bootRun --args='--spring.profiles.active=local,live-dev' &
backend_pid=$!

for _ in $(seq 1 60); do
  if curl --fail --silent --max-time 2 http://127.0.0.1:8080/actuator/health >/dev/null 2>&1; then
    break
  fi
  kill -0 "${backend_pid}" 2>/dev/null || die 'backend stopped before becoming healthy'
  sleep 2
done
curl --fail --silent --max-time 2 http://127.0.0.1:8080/actuator/health >/dev/null \
  || die 'backend did not become healthy within 120 seconds'

log 'playground: http://localhost:3000'
(cd "${ROOT_DIR}" && npm run dev --workspace @placepick/frontend -- --hostname 0.0.0.0)
