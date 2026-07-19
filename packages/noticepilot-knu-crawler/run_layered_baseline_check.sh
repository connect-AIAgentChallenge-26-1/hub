#!/usr/bin/env bash
set -euo pipefail
CURRENT_DIR="${1:-derived/mvp-policy-v0.1}"
OUTPUT="${2:-${CURRENT_DIR}/reports/layered-s26-baseline-diff.json}"
python3 tools/compare_layered_baseline.py \
  --baseline baseline/layered-s26-v1 \
  --current "$CURRENT_DIR" \
  --output "$OUTPUT"
