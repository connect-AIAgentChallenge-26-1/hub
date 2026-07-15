#!/usr/bin/env bash

set -Eeuo pipefail
# shellcheck source=scripts/lib/common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"

load_env_file
assert_docker_engine

confirmation="${CONFIRM_RESET:-}"
if [[ "${confirmation}" != 'placepick' ]]; then
  if [[ ! -t 0 ]]; then
    die "reset requires an interactive confirmation or CONFIRM_RESET=placepick"
  fi
  printf 'This deletes PlacePick local PostgreSQL, Redis, and Grafana data volumes. Type placepick to continue: '
  read -r confirmation
fi

[[ "${confirmation}" == 'placepick' ]] || die 'reset cancelled; confirmation did not match'

log 'deleting local service containers and application data volumes'
# Keep the current Dev Container and its Gradle cache alive; reset only application state.
compose_full rm --stop --force \
  postgres redis prometheus grafana

project_name="${COMPOSE_PROJECT_NAME:-placepick}"
for compose_volume in postgres-data redis-data grafana-data; do
  while IFS= read -r volume_id; do
    [[ -n "${volume_id}" ]] && docker volume rm "${volume_id}"
  done < <(docker volume ls --quiet \
    --filter "label=com.docker.compose.project=${project_name}" \
    --filter "label=com.docker.compose.volume=${compose_volume}")
done

log '.env, the running Dev Container, and the Gradle cache were preserved'
