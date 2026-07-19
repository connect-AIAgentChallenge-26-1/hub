#!/usr/bin/env bash
set -euo pipefail

CURRENT_DIR="${1:-derived/mvp-policy-v0.1}"
OUTPUT="${2:-${CURRENT_DIR}/policy15-baseline-diff.json}"

python3 tools/compare_policy_baseline.py \
  --baseline baseline/policy15 \
  --current "$CURRENT_DIR" \
  --output "$OUTPUT"
