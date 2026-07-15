#!/usr/bin/env bash

set -Eeuo pipefail
# shellcheck source=scripts/lib/common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"

log 'validating canonical development environment'
ensure_env_file
load_env_file

for tool in git curl jq make npm rg shellcheck gh; do
  require_command "${tool}"
done

assert_java17
assert_node24
assert_docker_engine
assert_mock_mode

chmod +x "${ROOT_DIR}/gradlew" "${ROOT_DIR}"/scripts/*.sh 2>/dev/null || true
assert_gradle_jvm17

if [[ -f "${ROOT_DIR}/package-lock.json" ]]; then
  log 'installing locked documentation tooling dependencies'
  (cd "${ROOT_DIR}" && npm ci --ignore-scripts)
  log 'installing the Playwright Chromium binary for local browser verification'
  "${ROOT_DIR}/node_modules/.bin/playwright" install chromium
fi

log 'setup validation completed; existing local configuration was not overwritten'
