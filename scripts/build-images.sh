#!/usr/bin/env bash

set -Eeuo pipefail
# shellcheck source=scripts/lib/common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"

assert_java17
assert_node24
assert_docker_engine

log 'building the locked Next.js production output'
(cd "${ROOT_DIR}" && npm run build --workspace @placepick/frontend)

revision="$(git -c safe.directory="${ROOT_DIR}" -C "${ROOT_DIR}" rev-parse --short=12 HEAD)"
image="placepick-backend:${revision}"
log "building Java 17 backend image ${image}"
docker build --tag "${image}" "${ROOT_DIR}"

runtime_user="$(docker image inspect --format '{{.Config.User}}' "${image}")"
[[ "${runtime_user}" == '10001:10001' ]] || die "production image must run as 10001:10001"
docker run --rm --entrypoint java "${image}" -version 2>&1 \
  | grep -E '^openjdk version "17\.' >/dev/null \
  || die 'production image runtime is not Java 17'

log "production image verified (Java 17, non-root user ${runtime_user})"
