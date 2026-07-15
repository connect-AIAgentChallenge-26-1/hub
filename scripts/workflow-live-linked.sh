#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
readonly ROOT_DIR
LIVE_ENV_FILE="${ROOT_DIR}/.env.live.local"
readonly LIVE_ENV_FILE
LIVE_CONTRACT_LABEL='Workflow linked live probe'
readonly LIVE_CONTRACT_LABEL
# shellcheck source=scripts/lib/live-contract-env.sh
source "${ROOT_DIR}/scripts/lib/live-contract-env.sh"

temp_dir=''
gateway_pid=''
gateway_started_pid=''
lock_dir=''
# shellcheck disable=SC2329,SC2317 # trap에서 간접 호출되는 정리 함수다.
stop_gateway() {
  if [[ -n "${gateway_pid}" ]] && kill -0 "${gateway_pid}" 2>/dev/null; then
    kill "${gateway_pid}" 2>/dev/null || true
    for _ in $(seq 1 40); do
      kill -0 "${gateway_pid}" 2>/dev/null || break
      sleep 0.1
    done
    if kill -0 "${gateway_pid}" 2>/dev/null; then
      kill -KILL "${gateway_pid}" 2>/dev/null || true
    fi
  fi
  [[ -z "${gateway_pid}" ]] || wait "${gateway_pid}" 2>/dev/null || true
  gateway_pid=''
}
cleanup() {
  stop_gateway
  [[ -z "${temp_dir}" ]] || rm -rf -- "${temp_dir}" 2>/dev/null || true
  temp_dir=''
  [[ -z "${lock_dir}" ]] || rmdir -- "${lock_dir}" 2>/dev/null || true
  lock_dir=''
}
trap cleanup EXIT INT TERM

umask 077
temp_dir="$(mktemp -d)" || live_contract_fail "a secure temporary directory is required."

live_contract_assert_local_file "${ROOT_DIR}" "${LIVE_ENV_FILE}"
approved_sha="${APPROVED_SHA:-}"
[[ "${approved_sha}" =~ ^[0-9a-f]{40}$ ]] ||
  live_contract_fail "APPROVED_SHA must be an exact 40-character lowercase commit SHA."
scenario="${SCENARIO:-}"
case "${scenario}" in
  seoul-cafe-complete-v1|seoul-restaurant-nullable-v1|seoul-cafe-dessert-v1) ;;
  *) live_contract_fail "SCENARIO must be an allowlisted linked workflow scenario." ;;
esac
[[ "$(git -C "${ROOT_DIR}" rev-parse HEAD)" == "${approved_sha}" ]] ||
  live_contract_fail "APPROVED_SHA must exactly match HEAD."
execution_policy="${WORKFLOW_LINKED_EXECUTION_POLICY:-main}"
case "${execution_policy}" in
  main)
    [[ "$(git -C "${ROOT_DIR}" rev-parse origin/main)" == "${approved_sha}" ]] ||
      live_contract_fail "the probe is allowed only for the fetched origin/main SHA."
    ;;
  development)
    readonly development_branch='feat/workflow-linked-live-validation'
    current_branch="$(git -C "${ROOT_DIR}" symbolic-ref --quiet --short HEAD 2>/dev/null || true)"
    [[ "${current_branch}" == "${development_branch}" ]] ||
      live_contract_fail "development Live is allowed only on the dedicated validation branch."
    remote_ref="refs/remotes/origin/${development_branch}"
    git -C "${ROOT_DIR}" show-ref --verify --quiet "${remote_ref}" ||
      live_contract_fail "the dedicated validation branch must be pushed before development Live."
    [[ "$(git -C "${ROOT_DIR}" rev-parse "${remote_ref}")" == "${approved_sha}" ]] ||
      live_contract_fail "APPROVED_SHA must match the pushed validation branch."
    git -C "${ROOT_DIR}" merge-base --is-ancestor origin/main HEAD ||
      live_contract_fail "the validation branch must descend from fetched origin/main."
    ;;
  *)
    live_contract_fail "WORKFLOW_LINKED_EXECUTION_POLICY must be main or development."
    ;;
esac
git -C "${ROOT_DIR}" diff --quiet -- ||
  live_contract_fail "tracked working tree changes must be absent."
git -C "${ROOT_DIR}" diff --cached --quiet -- ||
  live_contract_fail "staged changes must be absent."

untracked_manifest="${temp_dir}/untracked-files"
if ! git -C "${ROOT_DIR}" ls-files --others --exclude-standard -z \
  > "${untracked_manifest}"; then
  live_contract_fail "untracked file discovery failed."
fi
mapfile -d '' -t untracked_files < "${untracked_manifest}"
for untracked_file in "${untracked_files[@]}"; do
  if [[ ! "${untracked_file}" =~ ^plans/[^/]+\.md$ ]]; then
    live_contract_fail "untracked files outside plans/*.md must be absent."
  fi
done

# Local exclude rules must not hide executable source from the clean-tree guard.
ignored_manifest="${temp_dir}/ignored-execution-files"
if ! git -C "${ROOT_DIR}" ls-files --others --ignored --exclude-standard -z -- \
  backend/src edge/src scripts Makefile build.gradle settings.gradle \
  > "${ignored_manifest}"; then
  live_contract_fail "ignored executable source discovery failed."
fi
mapfile -d '' -t ignored_execution_files < "${ignored_manifest}"
(( ${#ignored_execution_files[@]} == 0 )) ||
  live_contract_fail "ignored files in executable source paths must be absent."

git_dir="$(git -C "${ROOT_DIR}" rev-parse --absolute-git-dir)"
lock_candidate="${git_dir}/placepick-workflow-live-linked.lock"
mkdir -- "${lock_candidate}" 2>/dev/null ||
  live_contract_fail "another linked Live workflow is already running."
lock_dir="${lock_candidate}"

command -v node >/dev/null 2>&1 || live_contract_fail "Node.js is required."
command -v java >/dev/null 2>&1 || live_contract_fail "Java is required."
command -v curl >/dev/null 2>&1 || live_contract_fail "curl is required."
command -v rg >/dev/null 2>&1 || live_contract_fail "ripgrep is required."
node_major="$(node -p 'process.versions.node.split(".")[0]')"
[[ "${node_major}" == '24' ]] || live_contract_fail "Node.js 24 is required."
java_version="$(java -XshowSettings:properties -version 2>&1 \
  | awk -F= '/^[[:space:]]*java\.specification\.version[[:space:]]*=/{gsub(/[[:space:]]/, "", $2); print $2; exit}')"
[[ "${java_version}" == '17' ]] || live_contract_fail "Java 17 is required."
gradle_jvm="$("${ROOT_DIR}/gradlew" --version \
  | awk -F: '/^(Launcher )?JVM:/{sub(/^[[:space:]]*/, "", $2); print $2; exit}')"
[[ "${gradle_jvm}" =~ ^17([.[:space:]]|$) ]] ||
  live_contract_fail "the Gradle launcher JVM must be Java 17."
[[ -f "${ROOT_DIR}/node_modules/esbuild/package.json" ]] ||
  live_contract_fail "pinned esbuild is missing; run npm ci in the Dev Container."
[[ -f "${ROOT_DIR}/scripts/run-local-linked-workflow-gateway.mjs" ]] ||
  live_contract_fail "the Node linked Gateway runner is missing."

live_contract_load_env "${LIVE_ENV_FILE}"
live_contract_require_mode
live_contract_require_credential NAVER_API_HUB_KEY_ID 1024
live_contract_require_credential NAVER_API_HUB_KEY 1024
live_contract_require_llm_configuration

mode=''
naver_key_id=''
naver_key=''
proxy_token=''
chat_proxy_url=''
chat_model=''
live_contract_value PLACEPICK_EXTERNAL_MODE mode
live_contract_value NAVER_API_HUB_KEY_ID naver_key_id
live_contract_value NAVER_API_HUB_KEY naver_key
live_contract_value PROXY_TOKEN proxy_token
live_contract_value CHAT_PROXY_URL chat_proxy_url
live_contract_value OPENAI_MODEL chat_model
live_contract_clear_parsed_values
chat_route_id="${chat_proxy_url#https://mlapi.run/}"
chat_route_id="${chat_route_id%/v1}"

random_token() {
  node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("base64url"))'
}

control_token="$(random_token)"
local_naver_key_id="$(random_token)"
local_naver_key="$(random_token)"
local_elice_token="$(random_token)"
local_credentials=(
  "${control_token}"
  "${local_naver_key_id}"
  "${local_naver_key}"
  "${local_elice_token}"
)
unique_local_credential_count="$(printf '%s\n' "${local_credentials[@]}" | sort -u | wc -l)"
[[ "${unique_local_credential_count//[[:space:]]/}" == '4' ]] ||
  live_contract_fail "ephemeral local credentials must be distinct."
port="$(node - <<'NODE'
const net = require('node:net');
const server = net.createServer();
server.listen(0, '127.0.0.1', () => {
  const address = server.address();
  if (typeof address !== 'object' || address === null) process.exit(1);
  process.stdout.write(String(address.port));
  server.close();
});
NODE
)"
[[ "${port}" =~ ^[0-9]+$ ]] || live_contract_fail "a loopback port could not be allocated."

gateway_log="${temp_dir}/gateway.log"
gateway_env_file="${temp_dir}/gateway.env"
gateway_bundle="${temp_dir}/local-linked-workflow-gateway.mjs"
printf '%s=%s\n' \
  'PLACEPICK_EXTERNAL_MODE' "${mode}" \
  'LOCAL_WORKFLOW_CONTROL_TOKEN' "${control_token}" \
  'LOCAL_NAVER_KEY_ID' "${local_naver_key_id}" \
  'LOCAL_NAVER_KEY' "${local_naver_key}" \
  'LOCAL_ELICE_TOKEN' "${local_elice_token}" \
  'NAVER_API_HUB_KEY_ID' "${naver_key_id}" \
  'NAVER_API_HUB_KEY' "${naver_key}" \
  'PROXY_TOKEN' "${proxy_token}" \
  'CHAT_PROXY_URL' "${chat_proxy_url}" \
  'OPENAI_MODEL' "${chat_model}" \
  > "${gateway_env_file}"
(
  cd "${ROOT_DIR}"
  exec env \
    -u PLACEPICK_EXTERNAL_MODE \
    -u NAVER_API_HUB_KEY_ID \
    -u NAVER_API_HUB_KEY \
    -u PROXY_TOKEN \
    -u CHAT_PROXY_URL \
    -u EMBEDDING_PROXY_URL \
    -u OPENAI_MODEL \
    -u OPENAI_EMBEDDING_MODEL \
    node "${ROOT_DIR}/scripts/run-local-linked-workflow-gateway.mjs" \
      "${ROOT_DIR}/edge/src/local-linked-workflow-gateway/worker.ts" \
      "${gateway_bundle}" \
      "${gateway_env_file}" \
      "${port}"
) >"${gateway_log}" 2>&1 &
gateway_pid=$!
gateway_started_pid="${gateway_pid}"

gateway_url="http://127.0.0.1:${port}"
ready=false
for _ in $(seq 1 40); do
  if ! kill -0 "${gateway_pid}" 2>/dev/null; then
    break
  fi
  if curl --silent --output /dev/null --max-time 1 "${gateway_url}/"; then
    ready=true
    break
  fi
  sleep 0.25
done
[[ "${ready}" == true ]] || live_contract_fail "the linked loopback Gateway did not become ready."

cd "${ROOT_DIR}"
set +e
env \
  -u NAVER_API_HUB_KEY_ID \
  -u NAVER_API_HUB_KEY \
  -u PROXY_TOKEN \
  -u CHAT_PROXY_URL \
  -u EMBEDDING_PROXY_URL \
  -u OPENAI_MODEL \
  -u OPENAI_EMBEDDING_MODEL \
  PLACEPICK_EXTERNAL_MODE="${mode}" \
  WORKFLOW_LINKED_GATEWAY_URL="${gateway_url}" \
  WORKFLOW_LINKED_CONTROL_TOKEN="${control_token}" \
  WORKFLOW_LINKED_NAVER_KEY_ID="${local_naver_key_id}" \
  WORKFLOW_LINKED_NAVER_KEY="${local_naver_key}" \
  WORKFLOW_LINKED_ELICE_TOKEN="${local_elice_token}" \
  WORKFLOW_LINKED_SCENARIO="${scenario}" \
  APPROVED_SHA="${approved_sha}" \
  ./gradlew :backend:workflowLiveLinkedTest --no-daemon
gradle_status=$?
set -e

stop_gateway
if kill -0 "${gateway_started_pid}" 2>/dev/null; then
  live_contract_fail "the linked loopback Gateway process did not stop."
fi
if curl --silent --output /dev/null --max-time 1 "${gateway_url}/"; then
  live_contract_fail "the linked loopback Gateway remained reachable after shutdown."
fi

report_roots=(
  "${ROOT_DIR}/backend/build/test-results/workflowLiveLinkedTest"
  "${ROOT_DIR}/backend/build/reports/tests/workflowLiveLinkedTest"
)
bash "${ROOT_DIR}/scripts/scan-test-reports.sh" "${report_roots[@]}"

evidence_files=("${gateway_log}")
report_manifest="${temp_dir}/report-files"
: > "${report_manifest}"
for report_root in "${report_roots[@]}"; do
  [[ -d "${report_root}" ]] || continue
  if ! find "${report_root}" -type f -print0 >> "${report_manifest}"; then
    live_contract_fail "linked workflow evidence discovery failed."
  fi
done
mapfile -d '' -t report_files < "${report_manifest}"
evidence_files+=("${report_files[@]}")

evidence_contains_fixed() {
  local pattern="$1"
  local evidence_file status
  for evidence_file in "${evidence_files[@]}"; do
    [[ -f "${evidence_file}" && -r "${evidence_file}" ]] ||
      live_contract_fail "a linked workflow evidence file is not readable."
    set +e
    grep -Fq -- "${pattern}" "${evidence_file}" 2>/dev/null
    status=$?
    set -e
    case "${status}" in
      0) return 0 ;;
      1) ;;
      *) live_contract_fail "the linked workflow evidence scan failed." ;;
    esac
  done
  return 1
}

evidence_contains_regex() {
  local pattern="$1"
  local evidence_file status
  for evidence_file in "${evidence_files[@]}"; do
    set +e
    rg --text --quiet --pcre2 "${pattern}" "${evidence_file}" 2>/dev/null
    status=$?
    set -e
    case "${status}" in
      0) return 0 ;;
      1) ;;
      *) live_contract_fail "the linked workflow evidence scan failed." ;;
    esac
  done
  return 1
}

for secret in \
  "${naver_key_id}" "${naver_key}" "${proxy_token}" \
  "${control_token}" "${local_naver_key_id}" "${local_naver_key}" \
  "${local_elice_token}"; do
  if evidence_contains_fixed "${secret}"; then
    live_contract_fail "a credential appeared in generated linked workflow evidence."
  fi
done
if evidence_contains_fixed "${chat_route_id}"; then
  live_contract_fail "a provider routing identifier appeared in generated linked workflow evidence."
fi
if evidence_contains_regex \
  'https?://mlapi\.run/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'; then
  live_contract_fail "a provider routing URL appeared in generated linked workflow evidence."
fi
for request_marker in \
  '서울에서 2명이 1인당 20000원 이하로 조용한 카페를 찾습니다.' \
  '서울에서 음식점을 추천해 주세요.' \
  '서울에서 디저트 카페를 찾습니다.' \
  '서울 카페 조용한' \
  '서울 음식점' \
  '서울 카페 디저트' \
  'You extract a draft venue recommendation condition.' \
  'Return grounded reason statements for exactly the supplied three place IDs.'; do
  if evidence_contains_fixed "${request_marker}"; then
    live_contract_fail "workflow request data appeared in generated linked workflow evidence."
  fi
done
for response_marker in \
  '검증된 장소 정보에 따라 이 후보를 제안합니다.' \
  '연결된 블로그 근거를 함께 확인할 수 있습니다.'; do
  if evidence_contains_fixed "${response_marker}"; then
    live_contract_fail "workflow response data appeared in generated linked workflow evidence."
  fi
done

safe_call_count=''
if (( gradle_status == 0 )); then
  result_pattern="WORKFLOW_LINKED result=validated scenario=${scenario} linked=true status=passed degraded=false reasonFallback=false callCount=[6-9]"
  result_matches=()
  for evidence_file in "${evidence_files[@]}"; do
    set +e
    match_output="$(rg --text --only-matching --no-filename "${result_pattern}" \
      "${evidence_file}" 2>/dev/null)"
    match_status=$?
    set -e
    case "${match_status}" in
      0) result_matches+=("${match_output}") ;;
      1) ;;
      *) live_contract_fail "the linked workflow completion marker scan failed." ;;
    esac
  done
  mapfile -t unique_result_lines < <(
    printf '%s\n' "${result_matches[@]}" | sed '/^$/d' | sort -u
  )
  (( ${#unique_result_lines[@]} == 1 )) ||
    live_contract_fail "the linked workflow safe completion marker is missing or ambiguous."
  result_line="${unique_result_lines[0]}"
  [[ "${result_line}" =~ callCount=([6-9])$ ]] ||
    live_contract_fail "the linked workflow safe completion marker is missing."
  safe_call_count="${BASH_REMATCH[1]}"
fi

completed_temp_dir="${temp_dir}"
cleanup
[[ ! -e "${completed_temp_dir}" ]] ||
  live_contract_fail "the linked workflow temporary directory was not removed."

if (( gradle_status == 0 )); then
  printf 'WORKFLOW_LINKED mode=linked scenario=%s linked=true status=passed degraded=false reasonFallback=false callCount=%s cleanup=true\n' \
    "${scenario}" "${safe_call_count}"
fi

exit "${gradle_status}"
