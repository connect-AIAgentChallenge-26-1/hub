#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(
  CDPATH= cd -- "$(dirname -- "$0")" >/dev/null 2>&1
  pwd
)"

exec env PYTHONDONTWRITEBYTECODE=1 \
  python3 "$SCRIPT_DIR/tools/reproducible_package.py" "$@"
