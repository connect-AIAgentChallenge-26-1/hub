// Evaluation report schema + regression diff — mirrors docs/skills.md
// "I9 골든 평가 하네스 계약 / 평가 리포트·회귀 diff".

export const REPORT_SCHEMA_VERSION = '1.0.0'

function resolveThreshold(entry, environment) {
  if (entry.per_environment) {
    return { bound: entry.per_environment[environment], kind: 'max_per_environment' }
  }
  if (typeof entry.min === 'number') return { bound: entry.min, kind: 'min' }
  if (typeof entry.max === 'number') return { bound: entry.max, kind: 'max' }
  if (typeof entry.equals === 'number') return { bound: entry.equals, kind: 'equals' }
  return { bound: undefined, kind: undefined }
}

function passesThreshold(value, kind, bound) {
  if (kind === 'min') return value >= bound
  if (kind === 'max' || kind === 'max_per_environment') return value <= bound
  if (kind === 'equals') return value === bound
  return false
}

/**
 * Compares one scored metric row against the threshold registry. Throws
 * MISSING_THRESHOLD if the metric has no registry entry — docs/skills.md
 * harness smoke test item 1. Never silently treats "no threshold" as pass.
 */
export function evaluateMetric(metricRow, registry, environment) {
  const entry = registry.metrics[metricRow.metric]
  if (!entry) {
    const err = new Error(`MISSING_THRESHOLD: no threshold registered for metric "${metricRow.metric}"`)
    err.code = 'MISSING_THRESHOLD'
    throw err
  }
  const { bound, kind } = resolveThreshold(entry, environment)
  if (bound === undefined) {
    const err = new Error(`MISSING_THRESHOLD: metric "${metricRow.metric}" has no usable bound for environment "${environment}"`)
    err.code = 'MISSING_THRESHOLD'
    throw err
  }
  return {
    category: metricRow.category,
    metric: metricRow.metric,
    value: metricRow.value,
    threshold: bound,
    pass: passesThreshold(metricRow.value, kind, bound),
    reason: `${metricRow.metric}=${metricRow.value} vs ${kind} ${bound}`,
  }
}

/**
 * Builds the full report object from per-category metric rows already
 * evaluated against the threshold registry.
 */
export function buildReport({ datasetVersion, thresholdsVersion, environment, results, generatedAt }) {
  const blockingFailures = results.filter((r) => !r.pass)
  return {
    report_schema_version: REPORT_SCHEMA_VERSION,
    dataset_version: datasetVersion,
    thresholds_version: thresholdsVersion,
    generated_at: generatedAt,
    environment,
    results,
    overall_pass: blockingFailures.length === 0,
    blocking_failures: blockingFailures.map((r) => r.metric),
  }
}

/**
 * Compares the current report to the previous stored report (same metric
 * keys). Returns an empty array when there is no previous report (first
 * run) — that is a valid, non-error state, not a regression.
 */
export function regressionDiff(currentReport, previousReport) {
  if (!previousReport) return []

  const previousByMetric = new Map(previousReport.results.map((r) => [r.metric, r]))
  return currentReport.results.map((current) => {
    const previous = previousByMetric.get(current.metric)
    if (!previous) {
      return { metric: current.metric, previous: null, current: current.value, delta: null, regressed: false }
    }
    const delta = current.value - previous.value
    // "regressed" 판단은 threshold 방향과 무관하게 값이 나빠졌는지만 본다:
    // failure-count 계열은 증가가 악화, rate/precision/recall 계열은 감소가 악화.
    const worseningIsIncrease = current.metric.endsWith('_failures')
    const regressed = worseningIsIncrease ? delta > 0 : delta < 0
    return { metric: current.metric, previous: previous.value, current: current.value, delta, regressed }
  })
}
