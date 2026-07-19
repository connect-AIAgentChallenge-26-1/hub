#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
DATASET_DIR="${1:-}"
OUTPUT_DIR="${2:-$ROOT_DIR/derived/mvp-policy-v0.1}"

if [[ -z "$DATASET_DIR" ]]; then
  cat >&2 <<'EOF'
Usage:
  ./run_mvp_policy_pipeline.sh <observation-dataset-dir> [output-dir]

Example:
  ./run_mvp_policy_pipeline.sh \
    ../noticepilot-knu-crawler-v0.4.4-observation.3/local-observation-data/observation-2026-v2
EOF
  exit 2
fi

python3 "$ROOT_DIR/noticepilot_mvp_policy_pipeline.py" \
  --dataset-dir "$DATASET_DIR" \
  --output-dir "$OUTPUT_DIR" \
  --policy-config "$ROOT_DIR/configs/noticepilot_mvp_policy.v0.1.json" \
  --strict

export_feed() {
  local scope="$1"
  local calendar_name="$2"
  local filename="$3"
  local candidate_dir="$OUTPUT_DIR/candidates/$scope"
  if [[ ! -d "$candidate_dir" ]] || ! find "$candidate_dir" -maxdepth 1 -name '*.candidates.json' -print -quit | grep -q .; then
    echo "No publishable candidates for feed: $scope"
    return 0
  fi
  python3 "$ROOT_DIR/noticepilot_ics_exporter.py" \
    --input "$candidate_dir" \
    --output-dir "$OUTPUT_DIR/ics/$scope" \
    --filename "$filename" \
    --calendar-name "$calendar_name"
}

export_feed "student_default" "NoticePilot 학생 일정" "noticepilot-student-default.ics"
export_feed "job_application" "NoticePilot 채용 접수 일정" "noticepilot-job-applications.ics"

echo
echo "Policy outputs: $OUTPUT_DIR"
echo "Summary:        $OUTPUT_DIR/reports/policy-summary.json"
echo "Review queue:   $OUTPUT_DIR/decisions/review-queue.jsonl"
echo "Student ICS:    $OUTPUT_DIR/ics/student_default/noticepilot-student-default.ics"
echo "Job ICS:        $OUTPUT_DIR/ics/job_application/noticepilot-job-applications.ics"
