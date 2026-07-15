#!/usr/bin/env bash

set -Eeuo pipefail
# shellcheck source=scripts/lib/common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"

[[ -z "${CI:-}" ]] || die 'live evidence is local-only and cannot run in CI'
assert_java17
[[ -f "${ROOT_DIR}/.env.live.local" ]] || die '.env.live.local is required'

log 'running three direct-provider synthetic evidence scenarios'
gradlew :backend:liveEvidenceTest \
  -Dplacepick.live-evidence.enabled=true \
  --rerun-tasks

log 'scanning generated reports for credentials and provider payload markers'
bash "${ROOT_DIR}/scripts/scan-test-reports.sh"
