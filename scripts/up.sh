#!/usr/bin/env bash

set -Eeuo pipefail
# shellcheck source=scripts/lib/common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"

ensure_env_file
load_env_file
assert_docker_engine
assert_mock_mode

log 'starting PostgreSQL and Redis'
compose_base up --detach --wait
log 'base infrastructure is healthy'
