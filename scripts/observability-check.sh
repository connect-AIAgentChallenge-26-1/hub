#!/usr/bin/env bash

set -Eeuo pipefail
# shellcheck source=scripts/lib/common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"

readonly PROMETHEUS_IMAGE='prom/prometheus:v3.13.1@sha256:3c42b892cf723fa54d2f262c37a0e1f80aa8c8ddb1da7b9b0df9455a35a7f893'
query_rules="$(mktemp "${ROOT_DIR}/observability/prometheus/.dashboard-query-smoke.XXXXXX.yml")"
trap 'rm -f -- "${query_rules}"' EXIT

log 'validating Grafana structure, PromQL metric references, and alert policy'
(cd "${ROOT_DIR}" && \
  npm run observability:validate -- --promtool-rules "${query_rules}" && \
  npm run observability:test)

log 'validating Prometheus alerts and every Grafana query with the pinned promtool image'
tar -C "${ROOT_DIR}/observability/prometheus" -cf - \
  placepick-alerts.yml "$(basename "${query_rules}")" \
  | docker run --rm --interactive \
    --network none \
    --read-only \
    --cap-drop ALL \
    --security-opt no-new-privileges \
    --tmpfs /work:rw,noexec,nosuid,nodev,mode=1777,size=8m \
    --tmpfs /tmp:rw,noexec,nosuid,nodev,mode=1777,size=64m \
    --workdir /work \
    --entrypoint /bin/sh \
    "${PROMETHEUS_IMAGE}" \
    -eu -c 'tar -xf -; exec /bin/promtool check rules "$@"' \
    promtool placepick-alerts.yml "$(basename "${query_rules}")"

log 'running Prometheus alert rule unit scenarios with the pinned promtool image'
tar -C "${ROOT_DIR}/observability/prometheus" -cf - \
  placepick-alerts.yml placepick-alerts.test.yml \
  | docker run --rm --interactive \
    --network none \
    --read-only \
    --cap-drop ALL \
    --security-opt no-new-privileges \
    --tmpfs /work:rw,noexec,nosuid,nodev,mode=1777,size=8m \
    --tmpfs /tmp:rw,noexec,nosuid,nodev,mode=1777,size=64m \
    --workdir /work \
    --entrypoint /bin/sh \
    "${PROMETHEUS_IMAGE}" \
    -eu -c 'tar -xf -; exec /bin/promtool test rules placepick-alerts.test.yml'
