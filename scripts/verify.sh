#!/usr/bin/env bash
# Single local verify command — docs/harness.md H1.
# Runs frontend (lint → test → build → dependency audit) then backend
# (lint → type check → migrate → test). Local pass here must mean CI passes
# (docs/harness.md 설계 원칙 2); .github/workflows/ci.yml runs the same
# underlying commands, split into parallel jobs.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "==> [1/3] frontend verify (lint -> test -> build -> dependency audit)"
npm run verify

echo "==> [2/3] backend verify (lint -> type check -> migrate -> test -> dependency audit)"

STARTED_LOCAL_DB=0
if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL not set — starting local Postgres via docker compose"
  docker compose up -d postgres
  STARTED_LOCAL_DB=1
  until [ "$(docker inspect -f '{{.State.Health.Status}}' hub-postgres 2>/dev/null)" = "healthy" ]; do
    sleep 1
  done
  export DATABASE_URL="postgresql+psycopg://hub:hub@localhost:5442/hub"
fi
export JWT_SECRET_KEY="${JWT_SECRET_KEY:-local-verify-only-not-for-production}"

(
  cd backend
  uv run ruff check .
  uv run mypy .
  uv run alembic upgrade head
  uv run pytest -q
  # Python dependency vulnerability gate — uv.lock 전체(dev 포함)를 OSV로 검사.
  REQ_AUDIT="$(mktemp)"
  trap 'rm -f "$REQ_AUDIT"' EXIT
  uv export --frozen --no-emit-project --format requirements-txt --quiet -o "$REQ_AUDIT"
  uv run pip-audit --disable-pip --no-deps -r "$REQ_AUDIT"
)

if [ "$STARTED_LOCAL_DB" -eq 1 ]; then
  echo "(hub-postgres left running for the next verify — 'docker compose down' to stop it)"
fi

echo "==> [3/3] secret scan (gitleaks, git history — NOT the working tree)"
# --no-git is intentionally never used here: it would scan working-tree files
# directly, including untracked/gitignored .env, and print any match to stdout.
# Default (git-history) mode only reads commits, where .env never lands.
gitleaks detect --source . --redact --no-banner

echo "==> verify passed"
