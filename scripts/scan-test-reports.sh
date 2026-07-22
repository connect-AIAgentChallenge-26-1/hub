#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
readonly ROOT_DIR

command -v rg >/dev/null 2>&1 || {
  printf 'Test report safety scan refused: rg is required.\n' >&2
  exit 1
}

if (( $# == 0 )); then
  set -- \
    "${ROOT_DIR}/backend/build/test-results" \
    "${ROOT_DIR}/backend/build/reports/tests"
fi

report_manifest="$(mktemp)" || {
  printf 'Test report safety scan refused: a temporary manifest is required.\n' >&2
  exit 1
}
leak_manifest="$(mktemp)" || {
  rm -f -- "${report_manifest}"
  printf 'Test report safety scan refused: a second temporary manifest is required.\n' >&2
  exit 1
}
trap 'rm -f -- "${report_manifest}" "${leak_manifest}"' EXIT
report_roots=()
for report_root in "$@"; do
  [[ -e "${report_root}" ]] || continue
  report_roots+=("${report_root}")
  if ! find "${report_root}" -type f -print0 >> "${report_manifest}"; then
    printf 'Test report safety scan could not enumerate report files.\n' >&2
    exit 1
  fi
done
mapfile -d '' -t report_files < "${report_manifest}"

forbidden_patterns=(
  'synthetic-proxy-token'
  'synthetic-response-secret-marker'
  'https?://mlapi\.run/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
  'authorization.{0,32}bearer[[:space:]]+[a-z0-9._~+/=-]+'
  'proxy_token=[^<[:space:]]+'
  'naver_api_hub_key(_id)?=[^<[:space:]]+'
  '"embedding"[[:space:]]*:[[:space:]]*\['
  '"status"[[:space:]]*:[[:space:]]*"ok"'
  '검증된 장소 정보에 따라 이 후보를 제안합니다\.'
  '연결된 블로그 근거를 함께 확인할 수 있습니다\.'
)

pattern_arguments=()
for pattern in "${forbidden_patterns[@]}"; do
  pattern_arguments+=(--regexp "${pattern}")
done

scan_status=1
if (( ${#report_roots[@]} > 0 )); then
  set +e
  rg --text --files-with-matches --null --no-ignore --hidden --ignore-case --pcre2 \
    "${pattern_arguments[@]}" "${report_roots[@]}" > "${leak_manifest}"
  scan_status=$?
  set -e
fi
case "${scan_status}" in
  0 | 1) ;;
  *)
    printf 'Test report safety scan could not inspect the generated reports.\n' >&2
    exit 1
    ;;
esac

mapfile -d '' -t leaked_files < "${leak_manifest}"

if (( ${#leaked_files[@]} > 0 )); then
  printf 'Test report safety scan failed; blocked files:\n' >&2
  printf ' - %s\n' "${leaked_files[@]}" >&2
  exit 1
fi

printf 'Test report safety scan passed (%d files).\n' "${#report_files[@]}"
