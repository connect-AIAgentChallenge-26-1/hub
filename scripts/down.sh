#!/usr/bin/env bash

set -Eeuo pipefail
# shellcheck source=scripts/lib/common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"

load_env_file
assert_docker_engine

log 'stopping and removing non-development PlacePick services; named data volumes are preserved'
# Keep the current Dev Container alive so this command is safe from its terminal.
compose_full rm --stop --force \
  postgres redis prometheus grafana
