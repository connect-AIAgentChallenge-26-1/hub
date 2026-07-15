#!/usr/bin/env bash

set -Eeuo pipefail
# shellcheck source=scripts/lib/common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"

ensure_env_file
load_env_file
assert_java17
assert_docker_engine
assert_mock_mode
assert_gradle_jvm17

log 'checking that active configuration contains no Java 21 runtime baseline'
if rg -n \
  --hidden \
  --glob '!.git/**' \
  --glob '!documents/**' \
  --glob '!docs/**' \
  --glob '!plans/**' \
  --glob '!**/build/**' \
  -e '(java-version[[:space:]]*:[[:space:]]*"?21|JavaLanguageVersion\.of\(21\)|JavaVersion\.VERSION_21|temurin[:@-]?21|java:.*21-(bookworm|jammy))' \
  -e "java-version[[:space:]]*:[[:space:]]*'21'" \
  "${ROOT_DIR}"; then
  die 'Java 21 was found in active configuration; the project baseline is Java 17'
fi

log 'validating Compose models'
compose_base config --quiet
compose_dev config --quiet
compose_observe config --quiet
compose_full config --quiet

if rg -n '^[[:space:]]*container_name:' "${ROOT_DIR}"/docker-compose*.yml; then
  die 'container_name is forbidden because it breaks project isolation'
fi

log 'validating shell scripts and JSON assets'
shellcheck -x -P "${ROOT_DIR}" "${ROOT_DIR}"/scripts/*.sh "${ROOT_DIR}"/scripts/lib/*.sh
while IFS= read -r -d '' json_file; do
  jq empty "${json_file}"
done < <(find \
  "${ROOT_DIR}/.devcontainer" \
  "${ROOT_DIR}/.vscode" \
  "${ROOT_DIR}/mock-api" \
  "${ROOT_DIR}/observability" \
  -type f -name '*.json' -print0)

log 'validating GitHub Actions workflows'
bash "${ROOT_DIR}/scripts/actionlint.sh"

log 'running Local Live environment guard negative tests'
bash "${ROOT_DIR}/scripts/naver-live-contract-guard-test.sh"
bash "${ROOT_DIR}/scripts/llm-live-contract-guard-test.sh"
bash "${ROOT_DIR}/scripts/workflow-live-probe-guard-test.sh"
bash "${ROOT_DIR}/scripts/workflow-live-linked-guard-test.sh"
bash "${ROOT_DIR}/scripts/run-local-linked-workflow-gateway-test.sh"
bash "${ROOT_DIR}/scripts/scan-test-reports-test.sh"

if [[ -f "${ROOT_DIR}/package.json" ]] \
  && node -e "const p=require(process.argv[1]); process.exit(p.scripts?.['docs:check'] ? 0 : 1)" "${ROOT_DIR}/package.json"; then
  log 'running repository documentation policy checks'
  (cd "${ROOT_DIR}" && npm run docs:check)
  if node -e "const p=require(process.argv[1]); process.exit(p.scripts?.['docs:test'] ? 0 : 1)" "${ROOT_DIR}/package.json"; then
    log 'running documentation validator negative-fixture regressions'
    (cd "${ROOT_DIR}" && npm run docs:test)
  fi
  if node -e "const p=require(process.argv[1]); process.exit(p.scripts?.['edge:check'] ? 0 : 1)" "${ROOT_DIR}/package.json"; then
    log 'running secret-free edge security boundary checks'
    (cd "${ROOT_DIR}" && npm run edge:check)
  fi
else
  log 'docs:check is not defined; skipping Node documentation checks'
fi

log 'running the Gradle verification lifecycle once (unit + integration + eval)'
export TESTCONTAINERS_HOST_OVERRIDE="${TESTCONTAINERS_HOST_OVERRIDE:-host.docker.internal}"
gradlew check

log 'scanning generated test reports for provider secrets and payloads'
bash "${ROOT_DIR}/scripts/scan-test-reports.sh"

log 'all canonical checks passed'
