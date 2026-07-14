import { describe, expect, it } from 'vitest'

import { buildReport, evaluateMetric, regressionDiff } from './report.js'

function registry(metrics) {
  return { metrics }
}

describe('evaluateMetric', () => {
  it('throws MISSING_THRESHOLD when the metric has no registry entry', () => {
    const row = { category: 'x', metric: 'unregistered_metric', value: 1 }
    expect(() => evaluateMetric(row, registry({}), 'dev')).toThrow(/MISSING_THRESHOLD/)
  })

  it('passes a min-bound metric at or above the bound', () => {
    const row = { category: 'x', metric: 'extraction_precision', value: 0.9 }
    const result = evaluateMetric(row, registry({ extraction_precision: { min: 0.8 } }), 'dev')
    expect(result.pass).toBe(true)
  })

  it('fails a min-bound metric below the bound', () => {
    const row = { category: 'x', metric: 'extraction_precision', value: 0.5 }
    const result = evaluateMetric(row, registry({ extraction_precision: { min: 0.8 } }), 'dev')
    expect(result.pass).toBe(false)
  })

  it('fails a max-bound metric above the bound (failure counts)', () => {
    const row = { category: 'x', metric: 'hallucination_failures', value: 1 }
    const result = evaluateMetric(row, registry({ hallucination_failures: { max: 0 } }), 'dev')
    expect(result.pass).toBe(false)
  })

  it('fails an equals-bound metric that is not exactly equal', () => {
    const row = { category: 'x', metric: 'citation_correctness_rate', value: 0.99 }
    const result = evaluateMetric(row, registry({ citation_correctness_rate: { equals: 1.0 } }), 'dev')
    expect(result.pass).toBe(false)
  })

  it('resolves per_environment bounds by the requested environment', () => {
    const row = { category: 'x', metric: 'latency_p95_ms', value: 4000 }
    const reg = registry({ latency_p95_ms: { per_environment: { dev: 5000, production: 2000 } } })
    expect(evaluateMetric(row, reg, 'dev').pass).toBe(true)
    expect(evaluateMetric(row, reg, 'production').pass).toBe(false)
  })
})

describe('buildReport', () => {
  it('overall_pass is true only when every result passes', () => {
    const allPass = buildReport({
      datasetVersion: 'golden-v1.0.0',
      thresholdsVersion: 'thresholds-v1.0.0',
      environment: 'dev',
      results: [{ metric: 'a', pass: true }],
      generatedAt: '2026-01-01T00:00:00Z',
    })
    expect(allPass.overall_pass).toBe(true)
    expect(allPass.blocking_failures).toEqual([])

    const oneFails = buildReport({
      datasetVersion: 'golden-v1.0.0',
      thresholdsVersion: 'thresholds-v1.0.0',
      environment: 'dev',
      results: [{ metric: 'a', pass: true }, { metric: 'b', pass: false }],
      generatedAt: '2026-01-01T00:00:00Z',
    })
    expect(oneFails.overall_pass).toBe(false)
    expect(oneFails.blocking_failures).toEqual(['b'])
  })
})

describe('regressionDiff', () => {
  it('returns an empty array when there is no previous report', () => {
    const current = buildReport({
      datasetVersion: 'golden-v1.0.0',
      thresholdsVersion: 'thresholds-v1.0.0',
      environment: 'dev',
      results: [{ metric: 'extraction_precision', value: 0.9, pass: true }],
      generatedAt: '2026-01-01T00:00:00Z',
    })
    expect(regressionDiff(current, null)).toEqual([])
  })

  it('flags a rate metric that dropped as regressed', () => {
    const previous = { results: [{ metric: 'extraction_precision', value: 0.9 }] }
    const current = { results: [{ metric: 'extraction_precision', value: 0.7 }] }
    const diff = regressionDiff(current, previous)
    expect(diff[0].regressed).toBe(true)
    expect(diff[0].delta).toBeCloseTo(-0.2)
  })

  it('flags a failure-count metric that increased as regressed', () => {
    const previous = { results: [{ metric: 'hallucination_failures', value: 0 }] }
    const current = { results: [{ metric: 'hallucination_failures', value: 1 }] }
    const diff = regressionDiff(current, previous)
    expect(diff[0].regressed).toBe(true)
  })

  it('does not flag improvement as regression', () => {
    const previous = { results: [{ metric: 'hallucination_failures', value: 1 }] }
    const current = { results: [{ metric: 'hallucination_failures', value: 0 }] }
    const diff = regressionDiff(current, previous)
    expect(diff[0].regressed).toBe(false)
  })
})
