import { describe, expect, it } from 'vitest'

import {
  validateGoldenDataset,
  validateThresholdRegistry,
  validateThresholdChangeApproval,
  checkCompatibility,
  REQUIRED_TAGS,
  REQUIRED_VERDICT_STATES,
} from './schema.js'
import goldenV1 from './golden-v1.json' with { type: 'json' }
import thresholdsV1 from './thresholds-v1.json' with { type: 'json' }

function minimalCase(overrides = {}) {
  return {
    id: 'x1',
    category: 'recommendation_ban',
    tags: [],
    description: 'x',
    input: {},
    expected: { banned_phrase_count: 0 },
    ...overrides,
  }
}

describe('validateGoldenDataset', () => {
  it('accepts the real eval/golden-v1.json bundled dataset', () => {
    const { valid, errors } = validateGoldenDataset(goldenV1)
    expect(errors).toEqual([])
    expect(valid).toBe(true)
  })

  it('rejects a dataset with a bad dataset_version', () => {
    const bad = { ...goldenV1, dataset_version: '1.0.0' }
    const { valid, errors } = validateGoldenDataset(bad)
    expect(valid).toBe(false)
    expect(errors.some((e) => e.includes('dataset_version'))).toBe(true)
  })

  it('rejects an unknown category', () => {
    const { valid, errors } = validateGoldenDataset({
      dataset_version: 'golden-v1.0.0',
      generated_at: '2026-01-01T00:00:00Z',
      cases: [minimalCase({ category: 'not_a_real_category' })],
    })
    expect(valid).toBe(false)
    expect(errors.some((e) => e.includes('category'))).toBe(true)
  })

  it('rejects duplicate case ids', () => {
    const { valid, errors } = validateGoldenDataset({
      dataset_version: 'golden-v1.0.0',
      generated_at: '2026-01-01T00:00:00Z',
      cases: [minimalCase({ id: 'dup' }), minimalCase({ id: 'dup' })],
    })
    expect(valid).toBe(false)
    expect(errors.some((e) => e.includes('duplicate case id'))).toBe(true)
  })

  it('rejects a dataset missing a required coverage tag', () => {
    const withoutInjectionTag = {
      ...goldenV1,
      cases: goldenV1.cases.filter((c) => !c.tags.includes('injection')),
    }
    const { valid, errors } = validateGoldenDataset(withoutInjectionTag)
    expect(valid).toBe(false)
    expect(errors.some((e) => e.includes('injection'))).toBe(true)
  })

  it('rejects a dataset missing one of the 5 required verdict states', () => {
    const withoutUnverifiable = {
      ...goldenV1,
      cases: goldenV1.cases.filter((c) => c.id !== 'va-04'),
    }
    const { valid, errors } = validateGoldenDataset(withoutUnverifiable)
    expect(valid).toBe(false)
    expect(errors.some((e) => e.includes('UNVERIFIABLE'))).toBe(true)
  })

  it('documents all 7 required tags and 5 verdict states as constants used above', () => {
    expect(REQUIRED_TAGS).toHaveLength(7)
    expect(REQUIRED_VERDICT_STATES).toHaveLength(5)
  })
})

function minimalRegistry(overrides = {}) {
  return {
    thresholds_version: 'thresholds-v1.0.0',
    compatible_dataset_version: 'golden-v1.0.0',
    metrics: {
      extraction_precision: { min: 0.8, description: 'd' },
    },
    change_log: [
      { date: '2026-01-01', actor: 'a', metric_or_field: 'x', before: null, after: 1, reason: 'r' },
    ],
    ...overrides,
  }
}

describe('validateThresholdRegistry', () => {
  it('accepts the real eval/thresholds-v1.json bundled registry', () => {
    const { valid, errors } = validateThresholdRegistry(thresholdsV1)
    expect(errors).toEqual([])
    expect(valid).toBe(true)
  })

  it('rejects a registry without a change_log (변경 승인 규칙)', () => {
    const bad = minimalRegistry({ change_log: [] })
    const { valid, errors } = validateThresholdRegistry(bad)
    expect(valid).toBe(false)
    expect(errors.some((e) => e.includes('change_log'))).toBe(true)
  })

  it('rejects a metric entry with no min/max/equals/per_environment', () => {
    const bad = minimalRegistry({ metrics: { foo: { description: 'd' } } })
    const { valid, errors } = validateThresholdRegistry(bad)
    expect(valid).toBe(false)
    expect(errors.some((e) => e.includes('metrics.foo'))).toBe(true)
  })

  it(
    'rejects a metric entry declaring more than one bound kind ' +
      '(GPT 리뷰 2026-07-14 18:44 정확한 재현 시나리오: {min, max} 동시 선언)',
    () => {
      const bad = minimalRegistry({ metrics: { foo: { min: 0.8, max: 0.1, description: 'd' } } })
      const { valid, errors } = validateThresholdRegistry(bad)
      expect(valid).toBe(false)
      expect(errors.some((e) => e.includes('exactly one of'))).toBe(true)
    },
  )

  it('rejects a change_log entry missing before/after', () => {
    const bad = minimalRegistry({
      change_log: [{ date: '2026-01-01', actor: 'a', metric_or_field: 'x', reason: 'r' }],
    })
    const { valid, errors } = validateThresholdRegistry(bad)
    expect(valid).toBe(false)
    expect(errors.some((e) => e.includes('before and after'))).toBe(true)
  })
})

describe('validateThresholdChangeApproval', () => {
  // GPT 리뷰 2026-07-14 18:23의 정확한 재현 시나리오: threshold 값을 낮추면서
  // thresholds_version과 change_log는 그대로 두면 validateThresholdRegistry()는
  // (shape만 보므로) 통과시킨다 — 이 함수가 그 이전값 대비 변경을 잡아야 한다.
  it('rejects a lowered metric value with no version bump and no new change_log entry', () => {
    const previous = minimalRegistry()
    const next = minimalRegistry({
      metrics: { extraction_precision: { min: 0.01, description: 'd' } },
    })
    const { valid, errors } = validateThresholdChangeApproval(previous, next)
    expect(valid).toBe(false)
    expect(errors.some((e) => e.includes('thresholds_version was not bumped'))).toBe(true)
    expect(errors.some((e) => e.includes('extraction_precision'))).toBe(true)
  })

  it('accepts a metric change with a version bump and a matching new change_log entry', () => {
    const previous = minimalRegistry()
    const next = minimalRegistry({
      thresholds_version: 'thresholds-v1.1.0',
      metrics: { extraction_precision: { min: 0.85, description: 'd' } },
      change_log: [
        ...minimalRegistry().change_log,
        {
          date: '2026-07-14',
          actor: 'Claude',
          metric_or_field: 'extraction_precision',
          before: 0.8,
          after: 0.85,
          reason: '실측 데이터 기반 상향',
        },
      ],
    })
    const { valid, errors } = validateThresholdChangeApproval(previous, next)
    expect(errors).toEqual([])
    expect(valid).toBe(true)
  })

  it('rejects a version bump whose new change_log entry does not name the changed metric', () => {
    const previous = minimalRegistry()
    const next = minimalRegistry({
      thresholds_version: 'thresholds-v1.1.0',
      metrics: { extraction_precision: { min: 0.85, description: 'd' } },
      change_log: [
        ...minimalRegistry().change_log,
        {
          date: '2026-07-14',
          actor: 'Claude',
          metric_or_field: 'unrelated_metric',
          before: 1,
          after: 2,
          reason: 'r',
        },
      ],
    })
    const { valid, errors } = validateThresholdChangeApproval(previous, next)
    expect(valid).toBe(false)
    expect(errors.some((e) => e.includes('extraction_precision'))).toBe(true)
  })

  it(
    'rejects a correctly-named change_log entry whose before/after do not match the ' +
      'actual bound change (GPT 리뷰 2026-07-14 18:37 정확한 재현 시나리오)',
    () => {
      const previous = minimalRegistry() // extraction_precision.min: 0.8
      const next = minimalRegistry({
        thresholds_version: 'thresholds-v1.1.0',
        metrics: { extraction_precision: { min: 0.85, description: 'd' } },
        change_log: [
          ...minimalRegistry().change_log,
          {
            date: '2026-07-14',
            actor: 'Claude',
            metric_or_field: 'extraction_precision',
            before: 999, // fabricated — real previous bound is 0.8
            after: -1, // fabricated — real next bound is 0.85
            reason: 'r',
          },
        ],
      })
      const { valid, errors } = validateThresholdChangeApproval(previous, next)
      expect(valid).toBe(false)
      expect(errors.some((e) => e.includes('actual before/after bound'))).toBe(true)
    },
  )

  it('accepts a per_environment metric change whose change_log records the full env map', () => {
    const previous = minimalRegistry({
      metrics: {
        latency_p95_ms: {
          per_environment: { dev: 5000, staging: 3000, production: 2000 },
          description: 'd',
        },
      },
    })
    const next = minimalRegistry({
      thresholds_version: 'thresholds-v1.1.0',
      metrics: {
        latency_p95_ms: {
          per_environment: { dev: 4000, staging: 3000, production: 2000 },
          description: 'd',
        },
      },
      change_log: [
        ...minimalRegistry().change_log,
        {
          date: '2026-07-14',
          actor: 'Claude',
          metric_or_field: 'latency_p95_ms',
          before: { dev: 5000, staging: 3000, production: 2000 },
          after: { dev: 4000, staging: 3000, production: 2000 },
          reason: 'dev latency budget tightened after real measurement',
        },
      ],
    })
    const { valid, errors } = validateThresholdChangeApproval(previous, next)
    expect(errors).toEqual([])
    expect(valid).toBe(true)
  })

  it('accepts an unchanged registry (no metric values differ)', () => {
    const registry = minimalRegistry()
    const { valid, errors } = validateThresholdChangeApproval(registry, registry)
    expect(errors).toEqual([])
    expect(valid).toBe(true)
  })

  it('accepts the bundled registry compared against itself (no-op diff)', () => {
    expect(validateThresholdChangeApproval(thresholdsV1, thresholdsV1).valid).toBe(true)
  })
})

describe('checkCompatibility', () => {
  it('accepts the bundled dataset+registry pair', () => {
    expect(checkCompatibility(goldenV1, thresholdsV1).valid).toBe(true)
  })

  it('rejects a mismatched dataset_version/compatible_dataset_version', () => {
    const mismatched = { ...thresholdsV1, compatible_dataset_version: 'golden-v2.0.0' }
    const { valid, errors } = checkCompatibility(goldenV1, mismatched)
    expect(valid).toBe(false)
    expect(errors[0]).toContain('golden-v2.0.0')
  })
})
