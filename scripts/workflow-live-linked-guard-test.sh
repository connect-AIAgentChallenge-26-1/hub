#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
readonly ROOT_DIR
TEST_ROOT="$(mktemp -d)"
readonly TEST_ROOT
trap 'rm -rf -- "${TEST_ROOT}"' EXIT

fail() {
  printf 'Workflow linked live guard test failed: %s\n' "$1" >&2
  exit 1
}

expect_failure() {
  local expected="$1"
  shift
  local output
  if output="$("$@" 2>&1)"; then
    fail "a rejected linked workflow configuration unexpectedly succeeded."
  fi
  [[ "${output}" == *"${expected}"* ]] ||
    fail "the expected safe linked workflow rejection was not returned: ${expected}."
}

expect_any_failure() {
  local output
  if output="$("$@" 2>&1)"; then
    fail "a rejected linked workflow execution unexpectedly succeeded."
  fi
}

assert_fake_cleanup() {
  local pid env_file
  read -r pid < "${TEST_ROOT}/gateway-pid"
  if kill -0 "${pid}" 2>/dev/null; then
    fail "the fake linked Gateway process remained alive."
  fi
  env_file="$(awk -F= '/^env_file=/{print substr($0, 10); exit}' \
    "${TEST_ROOT}/gateway-record")"
  [[ -n "${env_file}" && ! -e "${env_file}" ]] ||
    fail "the temporary linked Gateway environment file remained on disk."
}

mkdir -p \
  "${TEST_ROOT}/scripts/lib" \
  "${TEST_ROOT}/edge" \
  "${TEST_ROOT}/node_modules/.bin" \
  "${TEST_ROOT}/fake-bin"
cp "${ROOT_DIR}/scripts/workflow-live-linked.sh" "${TEST_ROOT}/scripts/"
cp "${ROOT_DIR}/scripts/scan-test-reports.sh" "${TEST_ROOT}/scripts/"
cp "${ROOT_DIR}/scripts/lib/live-contract-env.sh" "${TEST_ROOT}/scripts/lib/"
cp "${ROOT_DIR}/edge/wrangler.local-linked-workflow-gateway.jsonc" "${TEST_ROOT}/edge/"
chmod +x "${TEST_ROOT}/scripts/workflow-live-linked.sh"

cat > "${TEST_ROOT}/.env.live.local" <<'ENV'
PLACEPICK_EXTERNAL_MODE=live-contract
NAVER_API_HUB_KEY_ID=synthetic-key-id
NAVER_API_HUB_KEY=synthetic-secret-key
PROXY_TOKEN=synthetic-proxy-token
CHAT_PROXY_URL=https://mlapi.run/11111111-1111-4111-8111-111111111111/v1
EMBEDDING_PROXY_URL=https://mlapi.run/22222222-2222-4222-8222-222222222222/v1
OPENAI_MODEL=openai/gpt-4.1-mini
OPENAI_EMBEDDING_MODEL=openai/text-embedding-3-small
ENV
cat > "${TEST_ROOT}/.gitignore" <<'IGNORE'
.env.live.local
backend/build/
bad-java-bin/
bad-node-bin/
gateway-pid
gateway-record
gradle-record
node-counter
git-counter
find-counter
IGNORE

cat > "${TEST_ROOT}/fake-bin/node" <<'NODE'
#!/usr/bin/env bash
case "${1:-}" in
  -p) printf '24\n' ;;
  -e)
    counter_file="${FAKE_NODE_COUNTER:?}"
    count=0
    [[ ! -f "${counter_file}" ]] || read -r count < "${counter_file}"
    count=$((count + 1))
    printf '%s\n' "${count}" > "${counter_file}"
    printf '%043d' "${count}" | tr '0' 'l'
    ;;
  -) cat >/dev/null; printf '18766\n' ;;
  *) exit 1 ;;
esac
NODE
cat > "${TEST_ROOT}/fake-bin/curl" <<'CURL'
#!/usr/bin/env bash
if [[ -f "${FAKE_GATEWAY_PID_RECORD:?}" ]]; then
  read -r pid < "${FAKE_GATEWAY_PID_RECORD}"
  kill -0 "${pid}" 2>/dev/null && exit 0
fi
exit 7
CURL
cat > "${TEST_ROOT}/fake-bin/java" <<'JAVA'
#!/usr/bin/env bash
printf '%s\n' '    java.specification.version = 17' >&2
JAVA
cat > "${TEST_ROOT}/fake-bin/grep" <<'GREP'
#!/usr/bin/env bash
if [[ "${FAKE_EVIDENCE_GREP_FAIL:-false}" == true && "$*" == *'gateway.log'* ]]; then
  exit 2
fi
exec /usr/bin/grep "$@"
GREP
cat > "${TEST_ROOT}/fake-bin/rg" <<'RG'
#!/usr/bin/env bash
if [[ "${FAKE_EVIDENCE_RG_FAIL:-false}" == true && "$*" == *'gateway.log'* ]]; then
  exit 2
fi
exec /usr/bin/rg "$@"
RG
cat > "${TEST_ROOT}/fake-bin/git" <<'GIT'
#!/usr/bin/env bash
if [[ "${FAKE_GIT_LS_FILES_FAIL_ON_CALL:-0}" != 0 && " $* " == *' ls-files '* ]]; then
  counter_file="${FAKE_GIT_COUNTER:?}"
  count=0
  [[ ! -f "${counter_file}" ]] || read -r count < "${counter_file}"
  count=$((count + 1))
  printf '%s\n' "${count}" > "${counter_file}"
  if [[ "${count}" == "${FAKE_GIT_LS_FILES_FAIL_ON_CALL}" ]]; then
    exit 2
  fi
fi
exec /usr/bin/git "$@"
GIT
cat > "${TEST_ROOT}/fake-bin/find" <<'FIND'
#!/usr/bin/env bash
if [[ "${FAKE_FIND_FAIL_ON_CALL:-0}" != 0 ]]; then
  counter_file="${FAKE_FIND_COUNTER:?}"
  count=0
  [[ ! -f "${counter_file}" ]] || read -r count < "${counter_file}"
  count=$((count + 1))
  printf '%s\n' "${count}" > "${counter_file}"
  if [[ "${count}" == "${FAKE_FIND_FAIL_ON_CALL}" ]]; then
    exit 2
  fi
fi
exec /usr/bin/find "$@"
FIND
cat > "${TEST_ROOT}/node_modules/.bin/wrangler" <<'WRANGLER'
#!/usr/bin/env bash
env_file=''
while (( $# > 0 )); do
  if [[ "$1" == '--env-file' ]]; then
    env_file="${2:-}"
    shift 2
  else
    shift
  fi
done
[[ -f "${env_file}" ]] || exit 2
printf '%s\n' "$$" > "${FAKE_GATEWAY_PID_RECORD:?}"
{
  printf 'env_file=%s\n' "${env_file}"
  for name in PLACEPICK_EXTERNAL_MODE LOCAL_WORKFLOW_CONTROL_TOKEN LOCAL_NAVER_KEY_ID LOCAL_NAVER_KEY LOCAL_ELICE_TOKEN NAVER_API_HUB_KEY_ID NAVER_API_HUB_KEY PROXY_TOKEN CHAT_PROXY_URL OPENAI_MODEL; do
    if awk -F= -v expected="${name}" \
      '$1 == expected && length($2) > 0 { found = 1 } END { exit(found ? 0 : 1) }' \
      "${env_file}"; then state=present; else state=absent; fi
    printf '%s=%s\n' "${name}" "${state}"
  done
  for name in PLACEPICK_EXTERNAL_MODE NAVER_API_HUB_KEY_ID NAVER_API_HUB_KEY PROXY_TOKEN CHAT_PROXY_URL EMBEDDING_PROXY_URL OPENAI_MODEL OPENAI_EMBEDDING_MODEL; do
    if [[ -v "${name}" ]]; then state=present; else state=absent; fi
    printf 'process_%s=%s\n' "${name}" "${state}"
  done
} > "${FAKE_GATEWAY_RECORD:?}"
case "${FAKE_GATEWAY_LEAK:-}" in
  credential) awk -F= '/^NAVER_API_HUB_KEY=/{print $2; exit}' "${env_file}" ;;
  route) awk -F= '/^CHAT_PROXY_URL=/{print $2; exit}' "${env_file}" ;;
  request) printf '%s\n' 'Return grounded reason statements for exactly the supplied three place IDs.' ;;
  response) printf '%s\n' '연결된 블로그 근거를 함께 확인할 수 있습니다.' ;;
esac
trap 'exit 0' TERM INT
while true; do sleep 1; done
WRANGLER
cat > "${TEST_ROOT}/gradlew" <<'GRADLE'
#!/usr/bin/env bash
if [[ "${1:-}" == '--version' ]]; then
  printf '%s\n' 'Gradle 8.14.4' "Launcher JVM: ${FAKE_GRADLE_JVM:-17.0.16}"
  exit 0
fi
{
  printf 'args=%s\n' "$*"
  for name in PLACEPICK_EXTERNAL_MODE WORKFLOW_LINKED_GATEWAY_URL WORKFLOW_LINKED_CONTROL_TOKEN WORKFLOW_LINKED_NAVER_KEY_ID WORKFLOW_LINKED_NAVER_KEY WORKFLOW_LINKED_ELICE_TOKEN APPROVED_SHA NAVER_API_HUB_KEY_ID NAVER_API_HUB_KEY PROXY_TOKEN CHAT_PROXY_URL EMBEDDING_PROXY_URL OPENAI_MODEL OPENAI_EMBEDDING_MODEL; do
    if [[ -v "${name}" ]]; then state=present; else state=absent; fi
    printf '%s=%s\n' "${name}" "${state}"
  done
} > "${FAKE_GRADLE_RECORD:?}"
rm -rf backend/build/test-results/workflowLiveLinkedTest \
  backend/build/reports/tests/workflowLiveLinkedTest
mkdir -p backend/build/test-results/workflowLiveLinkedTest
[[ "${FAKE_GRADLE_FAIL:-false}" != true ]] || exit 1
[[ "${FAKE_GRADLE_MISSING_MARKER:-false}" != true ]] || exit 0
printf '%s\n' \
  'WORKFLOW_LINKED result=validated linked=true status=passed degraded=false reasonFallback=false callCount=8' \
  > backend/build/test-results/workflowLiveLinkedTest/safe-output.txt
case "${FAKE_REPORT_LEAK:-}" in
  credential) printf '%s\n' 'synthetic-secret-key' >> backend/build/test-results/workflowLiveLinkedTest/safe-output.txt ;;
  route) printf '%s\n' '11111111-1111-4111-8111-111111111111' >> backend/build/test-results/workflowLiveLinkedTest/safe-output.txt ;;
  request) printf '%s\n' '서울 카페 조용한' >> backend/build/test-results/workflowLiveLinkedTest/safe-output.txt ;;
  response) printf '%s\n' '검증된 장소 정보에 따라 이 후보를 제안합니다.' >> backend/build/test-results/workflowLiveLinkedTest/safe-output.txt ;;
esac
GRADLE
chmod +x \
  "${TEST_ROOT}/fake-bin/node" \
  "${TEST_ROOT}/fake-bin/curl" \
  "${TEST_ROOT}/fake-bin/java" \
  "${TEST_ROOT}/fake-bin/grep" \
  "${TEST_ROOT}/fake-bin/rg" \
  "${TEST_ROOT}/fake-bin/git" \
  "${TEST_ROOT}/fake-bin/find" \
  "${TEST_ROOT}/node_modules/.bin/wrangler" \
  "${TEST_ROOT}/gradlew"

git -C "${TEST_ROOT}" init --quiet
git -C "${TEST_ROOT}" config user.email 'guard@example.invalid'
git -C "${TEST_ROOT}" config user.name 'Workflow Guard'
git -C "${TEST_ROOT}" add .gitignore scripts edge node_modules/.bin/wrangler gradlew fake-bin
git -C "${TEST_ROOT}" commit --quiet -m 'guard fixture'
head_sha="$(git -C "${TEST_ROOT}" rev-parse HEAD)"
fixture_branch="$(git -C "${TEST_ROOT}" branch --show-current)"
git -C "${TEST_ROOT}" update-ref refs/remotes/origin/main "${head_sha}"

common_env=(
  env -u CI
  PATH="${TEST_ROOT}/fake-bin:${PATH}"
  FAKE_GATEWAY_RECORD="${TEST_ROOT}/gateway-record"
  FAKE_GATEWAY_PID_RECORD="${TEST_ROOT}/gateway-pid"
  FAKE_GRADLE_RECORD="${TEST_ROOT}/gradle-record"
  FAKE_NODE_COUNTER="${TEST_ROOT}/node-counter"
  FAKE_GIT_COUNTER="${TEST_ROOT}/git-counter"
  FAKE_FIND_COUNTER="${TEST_ROOT}/find-counter"
)

expect_failure "CI execution is forbidden" \
  env CI=true APPROVED_SHA="${head_sha}" PATH="${TEST_ROOT}/fake-bin:${PATH}" \
    bash "${TEST_ROOT}/scripts/workflow-live-linked.sh"

expect_failure "APPROVED_SHA must be an exact" \
  "${common_env[@]}" bash "${TEST_ROOT}/scripts/workflow-live-linked.sh"

expect_failure "APPROVED_SHA must exactly match HEAD" \
  "${common_env[@]}" APPROVED_SHA="$(printf '0%.0s' {1..40})" \
    bash "${TEST_ROOT}/scripts/workflow-live-linked.sh"

rm -f -- "${TEST_ROOT}/git-counter"
expect_failure "untracked file discovery failed" \
  "${common_env[@]}" FAKE_GIT_LS_FILES_FAIL_ON_CALL=1 APPROVED_SHA="${head_sha}" \
    bash "${TEST_ROOT}/scripts/workflow-live-linked.sh"

rm -f -- "${TEST_ROOT}/git-counter"
expect_failure "ignored executable source discovery failed" \
  "${common_env[@]}" FAKE_GIT_LS_FILES_FAIL_ON_CALL=2 APPROVED_SHA="${head_sha}" \
    bash "${TEST_ROOT}/scripts/workflow-live-linked.sh"

git -C "${TEST_ROOT}" commit --quiet --allow-empty -m 'feature-only fixture'
feature_sha="$(git -C "${TEST_ROOT}" rev-parse HEAD)"
expect_failure "allowed only for the fetched origin/main SHA" \
  "${common_env[@]}" APPROVED_SHA="${feature_sha}" \
    bash "${TEST_ROOT}/scripts/workflow-live-linked.sh"

git -C "${TEST_ROOT}" branch -m feat/workflow-linked-live-validation
git -C "${TEST_ROOT}" update-ref \
  refs/remotes/origin/feat/workflow-linked-live-validation "${feature_sha}"
development_output="$(
  "${common_env[@]}" WORKFLOW_LINKED_EXECUTION_POLICY=development \
    APPROVED_SHA="${feature_sha}" bash "${TEST_ROOT}/scripts/workflow-live-linked.sh" 2>&1
)" || fail "the reviewed development Live fixture failed."
assert_fake_cleanup
[[ "${development_output}" == *"WORKFLOW_LINKED mode=linked linked=true status=passed"* ]] ||
  fail "the development Live success marker was not produced."

# 같은 pushed SHA의 수동 재실행은 허용하되 invocation마다 Gateway와 자격을 새로 만든다.
development_repeat_output="$(
  "${common_env[@]}" WORKFLOW_LINKED_EXECUTION_POLICY=development \
    APPROVED_SHA="${feature_sha}" bash "${TEST_ROOT}/scripts/workflow-live-linked.sh" 2>&1
)" || fail "the explicit same-SHA development Live repeat failed."
assert_fake_cleanup
[[ "${development_repeat_output}" == *"cleanup=true"* ]] ||
  fail "the repeated development Live run did not clean up."

expect_failure "must be main or development" \
  "${common_env[@]}" WORKFLOW_LINKED_EXECUTION_POLICY=unknown \
    APPROVED_SHA="${feature_sha}" bash "${TEST_ROOT}/scripts/workflow-live-linked.sh"
git -C "${TEST_ROOT}" update-ref \
  refs/remotes/origin/feat/workflow-linked-live-validation "${head_sha}"
expect_failure "must match the pushed validation branch" \
  "${common_env[@]}" WORKFLOW_LINKED_EXECUTION_POLICY=development \
    APPROVED_SHA="${feature_sha}" bash "${TEST_ROOT}/scripts/workflow-live-linked.sh"
git -C "${TEST_ROOT}" update-ref \
  refs/remotes/origin/feat/workflow-linked-live-validation "${feature_sha}"
mkdir "${TEST_ROOT}/.git/placepick-workflow-live-linked.lock"
expect_failure "another linked Live workflow is already running" \
  "${common_env[@]}" WORKFLOW_LINKED_EXECUTION_POLICY=development \
    APPROVED_SHA="${feature_sha}" bash "${TEST_ROOT}/scripts/workflow-live-linked.sh"
rmdir "${TEST_ROOT}/.git/placepick-workflow-live-linked.lock"

git -C "${TEST_ROOT}" reset --quiet --hard "${head_sha}"
git -C "${TEST_ROOT}" branch -m "${fixture_branch}"
git -C "${TEST_ROOT}" update-ref -d \
  refs/remotes/origin/feat/workflow-linked-live-validation

mkdir -p "${TEST_ROOT}/backend/src/workflowLiveLinkedTest/java/example"
printf 'final class UntrackedInjection {}\n' \
  > "${TEST_ROOT}/backend/src/workflowLiveLinkedTest/java/example/UntrackedInjection.java"
expect_failure "untracked files outside plans/*.md must be absent" \
  "${common_env[@]}" APPROVED_SHA="${head_sha}" \
    bash "${TEST_ROOT}/scripts/workflow-live-linked.sh"
rm -rf -- "${TEST_ROOT}/backend/src"

mkdir -p "${TEST_ROOT}/backend/src/workflowLiveLinkedTest/java/example"
printf 'backend/src/workflowLiveLinkedTest/java/example/IgnoredInjection.java\n' \
  >> "${TEST_ROOT}/.git/info/exclude"
printf 'final class IgnoredInjection {}\n' \
  > "${TEST_ROOT}/backend/src/workflowLiveLinkedTest/java/example/IgnoredInjection.java"
expect_failure "ignored files in executable source paths must be absent" \
  "${common_env[@]}" APPROVED_SHA="${head_sha}" \
    bash "${TEST_ROOT}/scripts/workflow-live-linked.sh"
rm -rf -- "${TEST_ROOT}/backend/src"

mkdir -p "${TEST_ROOT}/bad-java-bin" "${TEST_ROOT}/bad-node-bin"
cat > "${TEST_ROOT}/bad-java-bin/java" <<'JAVA'
#!/usr/bin/env bash
printf '%s\n' '    java.specification.version = 21' >&2
JAVA
cat > "${TEST_ROOT}/bad-node-bin/node" <<'NODE'
#!/usr/bin/env bash
printf '23\n'
NODE
chmod +x "${TEST_ROOT}/bad-java-bin/java" "${TEST_ROOT}/bad-node-bin/node"
expect_failure "Java 17 is required" \
  "${common_env[@]}" PATH="${TEST_ROOT}/bad-java-bin:${TEST_ROOT}/fake-bin:${PATH}" \
    APPROVED_SHA="${head_sha}" bash "${TEST_ROOT}/scripts/workflow-live-linked.sh"
expect_failure "Node.js 24 is required" \
  "${common_env[@]}" PATH="${TEST_ROOT}/bad-node-bin:${TEST_ROOT}/fake-bin:${PATH}" \
    APPROVED_SHA="${head_sha}" bash "${TEST_ROOT}/scripts/workflow-live-linked.sh"
expect_failure "Gradle launcher JVM must be Java 17" \
  "${common_env[@]}" FAKE_GRADLE_JVM=21 APPROVED_SHA="${head_sha}" \
    bash "${TEST_ROOT}/scripts/workflow-live-linked.sh"

printf 'tracked change\n' >> "${TEST_ROOT}/scripts/scan-test-reports.sh"
expect_failure "tracked working tree changes must be absent" \
  "${common_env[@]}" APPROVED_SHA="${head_sha}" \
    bash "${TEST_ROOT}/scripts/workflow-live-linked.sh"
git -C "${TEST_ROOT}" checkout --quiet -- scripts/scan-test-reports.sh

printf 'staged change\n' >> "${TEST_ROOT}/scripts/scan-test-reports.sh"
git -C "${TEST_ROOT}" add scripts/scan-test-reports.sh
expect_failure "staged changes must be absent" \
  "${common_env[@]}" APPROVED_SHA="${head_sha}" \
    bash "${TEST_ROOT}/scripts/workflow-live-linked.sh"
git -C "${TEST_ROOT}" reset --quiet --hard "${head_sha}"

expect_any_failure "${common_env[@]}" FAKE_GRADLE_FAIL=true APPROVED_SHA="${head_sha}" \
  bash "${TEST_ROOT}/scripts/workflow-live-linked.sh"
assert_fake_cleanup

expect_failure "safe completion marker is missing" \
  "${common_env[@]}" FAKE_GRADLE_MISSING_MARKER=true APPROVED_SHA="${head_sha}" \
    bash "${TEST_ROOT}/scripts/workflow-live-linked.sh"
assert_fake_cleanup

expect_failure "a credential appeared" \
  "${common_env[@]}" FAKE_REPORT_LEAK=credential APPROVED_SHA="${head_sha}" \
    bash "${TEST_ROOT}/scripts/workflow-live-linked.sh"
assert_fake_cleanup

expect_failure "routing identifier appeared" \
  "${common_env[@]}" FAKE_REPORT_LEAK=route APPROVED_SHA="${head_sha}" \
    bash "${TEST_ROOT}/scripts/workflow-live-linked.sh"
assert_fake_cleanup

expect_failure "workflow request data appeared" \
  "${common_env[@]}" FAKE_REPORT_LEAK=request APPROVED_SHA="${head_sha}" \
    bash "${TEST_ROOT}/scripts/workflow-live-linked.sh"
assert_fake_cleanup

expect_failure "Test report safety scan failed" \
  "${common_env[@]}" FAKE_REPORT_LEAK=response APPROVED_SHA="${head_sha}" \
    bash "${TEST_ROOT}/scripts/workflow-live-linked.sh"
assert_fake_cleanup

expect_failure "workflow response data appeared" \
  "${common_env[@]}" FAKE_GATEWAY_LEAK=response APPROVED_SHA="${head_sha}" \
    bash "${TEST_ROOT}/scripts/workflow-live-linked.sh"
assert_fake_cleanup

rm -f -- "${TEST_ROOT}/find-counter"
expect_failure "Test report safety scan could not enumerate report files" \
  "${common_env[@]}" FAKE_FIND_FAIL_ON_CALL=1 APPROVED_SHA="${head_sha}" \
    bash "${TEST_ROOT}/scripts/workflow-live-linked.sh"
assert_fake_cleanup

rm -f -- "${TEST_ROOT}/find-counter"
expect_failure "linked workflow evidence discovery failed" \
  "${common_env[@]}" FAKE_FIND_FAIL_ON_CALL=2 APPROVED_SHA="${head_sha}" \
    bash "${TEST_ROOT}/scripts/workflow-live-linked.sh"
assert_fake_cleanup

expect_failure "workflow request data appeared" \
  "${common_env[@]}" FAKE_GATEWAY_LEAK=request APPROVED_SHA="${head_sha}" \
    bash "${TEST_ROOT}/scripts/workflow-live-linked.sh"
assert_fake_cleanup

expect_failure "evidence scan failed" \
  "${common_env[@]}" FAKE_EVIDENCE_GREP_FAIL=true APPROVED_SHA="${head_sha}" \
    bash "${TEST_ROOT}/scripts/workflow-live-linked.sh"
assert_fake_cleanup

expect_failure "evidence scan failed" \
  "${common_env[@]}" FAKE_EVIDENCE_RG_FAIL=true APPROVED_SHA="${head_sha}" \
    bash "${TEST_ROOT}/scripts/workflow-live-linked.sh"
assert_fake_cleanup

success_output="$(
  "${common_env[@]}" APPROVED_SHA="${head_sha}" \
    bash "${TEST_ROOT}/scripts/workflow-live-linked.sh" 2>&1
)" || fail "the synthetic linked workflow success fixture failed."
assert_fake_cleanup
[[ "${success_output}" == *"WORKFLOW_LINKED mode=linked linked=true status=passed"* ]] ||
  fail "the synthetic linked workflow success marker was not produced."

grep -Fxq 'args=:backend:workflowLiveLinkedTest --no-daemon' "${TEST_ROOT}/gradle-record" ||
  fail "the dedicated linked workflow Gradle task was not invoked."
for name in PLACEPICK_EXTERNAL_MODE WORKFLOW_LINKED_GATEWAY_URL WORKFLOW_LINKED_CONTROL_TOKEN WORKFLOW_LINKED_NAVER_KEY_ID WORKFLOW_LINKED_NAVER_KEY WORKFLOW_LINKED_ELICE_TOKEN APPROVED_SHA; do
  grep -Fxq "${name}=present" "${TEST_ROOT}/gradle-record" ||
    fail "the Java linked workflow process missed ${name}."
done
for name in NAVER_API_HUB_KEY_ID NAVER_API_HUB_KEY PROXY_TOKEN CHAT_PROXY_URL EMBEDDING_PROXY_URL OPENAI_MODEL OPENAI_EMBEDDING_MODEL; do
  grep -Fxq "${name}=absent" "${TEST_ROOT}/gradle-record" ||
    fail "the Java linked workflow process received raw provider configuration: ${name}."
done
for name in PLACEPICK_EXTERNAL_MODE LOCAL_WORKFLOW_CONTROL_TOKEN LOCAL_NAVER_KEY_ID LOCAL_NAVER_KEY LOCAL_ELICE_TOKEN NAVER_API_HUB_KEY_ID NAVER_API_HUB_KEY PROXY_TOKEN CHAT_PROXY_URL OPENAI_MODEL; do
  grep -Fxq "${name}=present" "${TEST_ROOT}/gateway-record" ||
    fail "the linked loopback Gateway missed ${name}."
done
for name in PLACEPICK_EXTERNAL_MODE NAVER_API_HUB_KEY_ID NAVER_API_HUB_KEY PROXY_TOKEN CHAT_PROXY_URL EMBEDDING_PROXY_URL OPENAI_MODEL OPENAI_EMBEDDING_MODEL; do
  grep -Fxq "process_${name}=absent" "${TEST_ROOT}/gateway-record" ||
    fail "the Wrangler process inherited raw provider configuration: ${name}."
done

printf 'Workflow linked live probe synthetic guard tests passed.\n'
