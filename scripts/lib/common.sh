#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly ROOT_DIR

log() {
  printf '[placepick] %s\n' "$*"
}

die() {
  printf '[placepick] ERROR: %s\n' "$*" >&2
  exit 1
}

require_command() {
  local command_name="$1"
  command -v "$command_name" >/dev/null 2>&1 || die "required command is missing: ${command_name}"
}

ensure_env_file() {
  if [[ -f "${ROOT_DIR}/.env" ]]; then
    log '.env already exists; leaving it unchanged'
    return
  fi

  [[ -f "${ROOT_DIR}/.env.example" ]] || die '.env.example is missing'
  cp "${ROOT_DIR}/.env.example" "${ROOT_DIR}/.env"
  chmod 600 "${ROOT_DIR}/.env" 2>/dev/null || true
  log 'created .env from .env.example'
}

load_env_file() {
  if [[ -f "${ROOT_DIR}/.env" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "${ROOT_DIR}/.env"
    set +a
  fi
}

java_specification_version() {
  java -XshowSettings:properties -version 2>&1 \
    | awk -F= '/^[[:space:]]*java\.specification\.version[[:space:]]*=/{gsub(/[[:space:]]/, "", $2); print $2; exit}'
}

assert_java17() {
  require_command java
  local version
  version="$(java_specification_version)"
  [[ "${version}" == '17' ]] || die "Java 17 is required; active java.specification.version is '${version:-unknown}'"
  log 'Java runtime guard passed (17)'
}

assert_node24() {
  require_command node
  local major
  major="$(node --version | sed -E 's/^v([0-9]+).*/\1/')"
  [[ "${major}" == '24' ]] || die "Node 24 is required in the canonical Dev Container; active major is '${major:-unknown}'"
  log 'Node runtime guard passed (24)'
}

gradlew() {
  [[ -f "${ROOT_DIR}/gradlew" ]] || die 'Gradle Wrapper is missing at repository root'
  local project_cache_dir="${PLACEPICK_GRADLE_PROJECT_CACHE_DIR:-${GRADLE_USER_HOME:-${HOME}/.gradle}/placepick-project-cache}"
  mkdir -p "${project_cache_dir}"
  if [[ -x "${ROOT_DIR}/gradlew" ]]; then
    "${ROOT_DIR}/gradlew" --no-daemon --project-cache-dir "${project_cache_dir}" "$@"
  else
    bash "${ROOT_DIR}/gradlew" --no-daemon --project-cache-dir "${project_cache_dir}" "$@"
  fi
}

assert_gradle_jvm17() {
  local version_output jvm_line
  version_output="$(gradlew --version)"
  jvm_line="$(printf '%s\n' "${version_output}" | awk -F: '/^(Launcher )?JVM:/{sub(/^[[:space:]]*/, "", $2); print $2; exit}')"
  [[ "${jvm_line}" =~ ^17([.[:space:]]|$) ]] || die "Gradle launcher JVM must be Java 17; wrapper reported '${jvm_line:-unknown}'"
  log 'Gradle launcher JVM guard passed (17); Gradle build policy verifies toolchains and test runtimes'
}

assert_docker_engine() {
  require_command docker
  docker compose version >/dev/null 2>&1 || die 'Docker Compose v2 is required'
  docker info >/dev/null 2>&1 || die 'Docker engine is unavailable; start Docker Desktop and retry'

  local client_version compose_version
  client_version="$(docker version --format '{{.Client.Version}}')"
  compose_version="$(docker compose version --short)"
  [[ "${compose_version}" =~ ^2\. ]] || die "Docker Compose v2 is required; detected '${compose_version:-unknown}'"
  log "Docker client guard passed (${client_version}, Compose ${compose_version})"
}

assert_mock_mode() {
  local mode="${PLACEPICK_EXTERNAL_MODE:-}"
  [[ "${mode}" == 'mock' ]] || die "PLACEPICK_EXTERNAL_MODE must be 'mock' for local/test/load execution"

  log 'external integration mode guard passed (mock)'
}

compose_base() {
  docker compose --project-directory "${ROOT_DIR}" \
    -f "${ROOT_DIR}/docker-compose.yml" "$@"
}

compose_dev() {
  docker compose --project-directory "${ROOT_DIR}" \
    -f "${ROOT_DIR}/docker-compose.yml" \
    -f "${ROOT_DIR}/docker-compose.devcontainer.yml" "$@"
}

compose_observe() {
  docker compose --project-directory "${ROOT_DIR}" \
    -f "${ROOT_DIR}/docker-compose.yml" \
    -f "${ROOT_DIR}/docker-compose.observability.yml" "$@"
}

compose_full() {
  docker compose --project-directory "${ROOT_DIR}" \
    -f "${ROOT_DIR}/docker-compose.yml" \
    -f "${ROOT_DIR}/docker-compose.devcontainer.yml" \
    -f "${ROOT_DIR}/docker-compose.observability.yml" "$@"
}
