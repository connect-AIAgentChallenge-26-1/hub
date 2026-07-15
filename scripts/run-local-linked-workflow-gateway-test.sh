#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
readonly ROOT_DIR
TEST_DIR="$(mktemp -d)"
readonly TEST_DIR
gateway_pid=''

cleanup() {
  if [[ -n "${gateway_pid}" ]] && kill -0 "${gateway_pid}" 2>/dev/null; then
    kill "${gateway_pid}" 2>/dev/null || true
    wait "${gateway_pid}" 2>/dev/null || true
  fi
  rm -rf -- "${TEST_DIR}"
}
trap cleanup EXIT INT TERM

fail() {
  printf 'Node linked Gateway runner test failed: %s\n' "$1" >&2
  exit 1
}

port="$(node - <<'NODE'
const net = require("node:net");
const server = net.createServer();
server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  if (typeof address !== "object" || address === null) process.exit(1);
  process.stdout.write(String(address.port));
  server.close();
});
NODE
)"
[[ "${port}" =~ ^[0-9]+$ ]] || fail 'a loopback port could not be allocated.'

umask 077
env_file="${TEST_DIR}/gateway.env"
bundle_file="${TEST_DIR}/gateway.mjs"
log_file="${TEST_DIR}/gateway.log"
response_file="${TEST_DIR}/response.json"
local_token='ccccccccccccccccccccccccccccccccccccccccccc'
cat > "${env_file}" <<ENV
PLACEPICK_EXTERNAL_MODE=live-contract
LOCAL_WORKFLOW_CONTROL_TOKEN=${local_token}
LOCAL_NAVER_KEY_ID=iiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiii
LOCAL_NAVER_KEY=kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk
LOCAL_ELICE_TOKEN=eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
NAVER_API_HUB_KEY_ID=synthetic-key-id
NAVER_API_HUB_KEY=synthetic-key
PROXY_TOKEN=synthetic-proxy-token
CHAT_PROXY_URL=https://mlapi.run/11111111-1111-4111-8111-111111111111/v1
OPENAI_MODEL=openai/gpt-4.1-mini
ENV

node "${ROOT_DIR}/scripts/run-local-linked-workflow-gateway.mjs" \
  "${ROOT_DIR}/edge/src/local-linked-workflow-gateway/worker.ts" \
  "${bundle_file}" "${env_file}" "${port}" >"${log_file}" 2>&1 &
gateway_pid=$!

ready=false
for _ in $(seq 1 40); do
  kill -0 "${gateway_pid}" 2>/dev/null || break
  if curl --silent --output /dev/null --max-time 1 "http://127.0.0.1:${port}/"; then
    ready=true
    break
  fi
  sleep 0.1
done
[[ "${ready}" == true ]] || fail 'the Node Gateway did not become ready.'

status="$(curl --silent --output "${response_file}" --write-out '%{http_code}' \
  --max-time 2 --request POST \
  --header 'accept: application/json' \
  --header "authorization: Bearer ${local_token}" \
  --header 'content-type: application/json' \
  --data '{"approvedSha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","scenarioId":"seoul-cafe-complete-v1","fixtureVersion":1,"fixtureHash":"44be4ffb2ac0b034f6c10d7d9d9c66ed7850bed4ce493e87296f211dd44636fd","scopeHash":"73b6d630cb24b9222e05b289822b11a64c2f23ad04acb09b5fe01accafe3b2d0"}' \
  "http://127.0.0.1:${port}/v1/probes/workflow-linked/start")"
[[ "${status}" == '200' ]] || fail 'the Node Gateway rejected the synthetic start contract.'
grep -Fq '"status":"ready"' "${response_file}" ||
  fail 'the Node Gateway ready summary is invalid.'
[[ ! -s "${log_file}" ]] || fail 'the Node Gateway emitted unexpected output.'

kill "${gateway_pid}"
wait "${gateway_pid}" 2>/dev/null || true
gateway_pid=''
if curl --silent --output /dev/null --max-time 1 "http://127.0.0.1:${port}/"; then
  fail 'the Node Gateway remained reachable after shutdown.'
fi

printf 'UNKNOWN_VALUE=rejected\n' >> "${env_file}"
if node "${ROOT_DIR}/scripts/run-local-linked-workflow-gateway.mjs" \
  "${ROOT_DIR}/edge/src/local-linked-workflow-gateway/worker.ts" \
  "${bundle_file}" "${env_file}" "${port}" >"${log_file}" 2>&1; then
  fail 'an unknown environment variable was accepted.'
fi
grep -Fxq 'LOCAL_LINKED_GATEWAY status=failed errorCode=NODE_GATEWAY_ENV_INVALID' \
  "${log_file}" || fail 'the invalid environment did not produce a safe error.'

printf 'Node linked Gateway runner synthetic tests passed.\n'
