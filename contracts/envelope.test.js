import { describe, expect, it } from 'vitest'
import { ENVELOPE_SCHEMA_VERSION, ENVELOPE_STATUS, validateEnvelope } from './envelope.js'
import timestampFixtures from './fixtures/timestamps.json' with { type: 'json' }

function baseEnvelope(overrides = {}) {
  return {
    schema_version: ENVELOPE_SCHEMA_VERSION,
    request_id: 'req-1',
    trace_id: 'trace-1',
    as_of: '2026-07-12',
    status: 'SUCCESS',
    warnings: [],
    source_ids: [],
    model_or_rule_version: 'rule-1.0.0',
    started_at: '2026-07-12T00:00:00Z',
    completed_at: '2026-07-12T00:00:01Z',
    ...overrides,
  }
}

describe('validateEnvelope', () => {
  it('accepts a minimal SUCCESS envelope', () => {
    const result = validateEnvelope(baseEnvelope())
    expect(result).toEqual({ valid: true, errors: [] })
  })

  it('accepts every declared status value when paired with a reason_code as needed', () => {
    for (const status of ENVELOPE_STATUS) {
      const overrides = { status }
      if (status !== 'SUCCESS' && status !== 'PARTIAL_SUCCESS') {
        overrides.reason_code = 'SOME_REASON'
      }
      const result = validateEnvelope(baseEnvelope(overrides))
      expect(result.valid, `status ${status} should be valid`).toBe(true)
    }
  })

  it('rejects a status outside the enum', () => {
    const result = validateEnvelope(baseEnvelope({ status: 'OK' }))
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('status must be one of'))).toBe(true)
  })

  it('rejects an error status without a reason_code', () => {
    const result = validateEnvelope(baseEnvelope({ status: 'EXTERNAL_ERROR' }))
    expect(result.valid).toBe(false)
    expect(result.errors).toContain(
      'reason_code is required when status is not SUCCESS/PARTIAL_SUCCESS',
    )
  })

  it('rejects a missing required field', () => {
    const envelope = baseEnvelope()
    delete envelope.trace_id
    const result = validateEnvelope(envelope)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('missing required field: trace_id')
  })

  it('rejects an as_of that is not YYYY-MM-DD', () => {
    const result = validateEnvelope(baseEnvelope({ as_of: '2026/07/12' }))
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('as_of must be a valid YYYY-MM-DD calendar date string')
  })

  it('rejects a non-string as_of (e.g. a number) instead of skipping the check', () => {
    const result = validateEnvelope(baseEnvelope({ as_of: 123 }))
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('as_of must be a valid YYYY-MM-DD calendar date string')
  })

  it('rejects an as_of that matches the digit pattern but is not a real calendar date', () => {
    // 정규식만으로는 "2026-99-99" 같은 값을 걸러내지 못한다 — Python(date)
    // 미러와 동일한 강도로 실제 달력 유효성까지 검사해야 한다.
    const result = validateEnvelope(baseEnvelope({ as_of: '2026-99-99' }))
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('as_of must be a valid YYYY-MM-DD calendar date string')
  })

  it('rejects as_of=2026-02-30 (February has no 30th)', () => {
    const result = validateEnvelope(baseEnvelope({ as_of: '2026-02-30' }))
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('as_of must be a valid YYYY-MM-DD calendar date string')
  })

  it('rejects non-string warnings/source_ids items', () => {
    const result = validateEnvelope(baseEnvelope({ warnings: [123], source_ids: [456] }))
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('warnings items must be strings')
    expect(result.errors).toContain('source_ids items must be strings')
  })

  it('rejects started_at/completed_at that are not parseable timestamps', () => {
    const result = validateEnvelope(
      baseEnvelope({ started_at: 'not-a-timestamp', completed_at: '' }),
    )
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('started_at must be an RFC3339 timestamp with a UTC/offset designator (Z or ±HH:MM)')
    expect(result.errors).toContain('completed_at must be an RFC3339 timestamp with a UTC/offset designator (Z or ±HH:MM)')
  })

  // 이 fixture는 backend/tests/test_envelope_contract.py도 그대로 읽어 같은
  // 입력에 대해 JS/Python Envelope가 동일하게 판정하는지 검증한다
  // (docs/skills.md started_at/completed_at RFC3339 계약, 2026-07-12 23:51 리뷰).
  describe('cross-runtime timestamp fixture (contracts/fixtures/timestamps.json)', () => {
    it.each(timestampFixtures.valid)('accepts valid timestamp %s', (value) => {
      const result = validateEnvelope(baseEnvelope({ started_at: value }))
      expect(result.valid, JSON.stringify(result.errors)).toBe(true)
    })

    it.each(timestampFixtures.invalid)('rejects invalid timestamp %s', (value) => {
      const result = validateEnvelope(baseEnvelope({ started_at: value }))
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.startsWith('started_at must be'))).toBe(true)
    })
  })

  it('rejects an envelope missing source_ids (required by docs/skills.md)', () => {
    const envelope = baseEnvelope()
    delete envelope.source_ids
    const result = validateEnvelope(envelope)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('missing required field: source_ids')
  })

  it('rejects source_ids that is not an array', () => {
    const result = validateEnvelope(baseEnvelope({ source_ids: 'dart:123' }))
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('source_ids must be an array when present')
  })

  it('rejects a non-string request_id and a non-timestamp started_at', () => {
    const result = validateEnvelope(baseEnvelope({ request_id: 42, started_at: 1720742400 }))
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('request_id must be a string')
    expect(result.errors).toContain('started_at must be an RFC3339 timestamp with a UTC/offset designator (Z or ±HH:MM)')
  })

  it('rejects warnings that are not an array', () => {
    const result = validateEnvelope(baseEnvelope({ warnings: 'none' }))
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('warnings must be an array')
  })

  it('rejects a non-object input instead of throwing', () => {
    expect(validateEnvelope(null).valid).toBe(false)
    expect(validateEnvelope(undefined).valid).toBe(false)
    expect(validateEnvelope('envelope').valid).toBe(false)
  })
})
