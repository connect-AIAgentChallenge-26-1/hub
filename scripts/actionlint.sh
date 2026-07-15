#!/usr/bin/env bash

set -Eeuo pipefail
# shellcheck source=scripts/lib/common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"

readonly ACTIONLINT_VERSION='1.7.12'
readonly ACTIONLINT_DIGEST='sha256:b1934ee5f1c509618f2508e6eb47ee0d3520686341fec936f3b79331f9315667'
readonly ACTIONLINT_IMAGE="docker.io/rhysd/actionlint:${ACTIONLINT_VERSION}@${ACTIONLINT_DIGEST}"

require_command docker
require_command tar
docker info >/dev/null 2>&1 || die 'Docker engine is required to run the pinned actionlint image'

version_output="$(
  docker run \
    --rm \
    --network none \
    --read-only \
    --cap-drop ALL \
    --security-opt no-new-privileges \
    --entrypoint /usr/local/bin/actionlint \
    "${ACTIONLINT_IMAGE}" \
    -version 2>&1
)"

detected_version="$(printf '%s\n' "${version_output}" | sed -n '1p')"
[[ "${detected_version}" == "${ACTIONLINT_VERSION}" ]] || {
  die "actionlint version mismatch: expected ${ACTIONLINT_VERSION}, detected ${detected_version:-unknown}"
}

repo_digests="$(docker image inspect "${ACTIONLINT_IMAGE}" --format '{{range .RepoDigests}}{{println .}}{{end}}')"
if ! grep -Fq "rhysd/actionlint@${ACTIONLINT_DIGEST}" <<<"${repo_digests}"; then
  die "actionlint image digest verification failed for ${ACTIONLINT_DIGEST}"
fi

log "validating GitHub Actions workflows with actionlint ${ACTIONLINT_VERSION} (${ACTIONLINT_DIGEST})"

# Stream only committed workflow definitions. The container receives no repository mount,
# host environment variables, network, credential file, or provider secret.
tar -C "${ROOT_DIR}" -cf - .github/workflows \
  | docker run \
    --rm \
    --interactive \
    --network none \
    --read-only \
    --cap-drop ALL \
    --security-opt no-new-privileges \
    --tmpfs /repo:rw,noexec,nosuid,nodev,mode=1777,size=8m \
    --workdir /repo \
    --entrypoint /bin/sh \
    "${ACTIONLINT_IMAGE}" \
    -eu -c '
      tar -xf -
      set --
      for workflow in .github/workflows/*.yml .github/workflows/*.yaml; do
        [ -f "${workflow}" ] || continue
        set -- "$@" "${workflow}"
      done
      [ "$#" -gt 0 ] || {
        echo "No GitHub Actions workflow files were found." >&2
        exit 1
      }
      exec /usr/local/bin/actionlint -no-color "$@"
    '

log 'GitHub Actions workflow validation passed'
