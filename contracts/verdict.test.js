import { describe, expect, it } from 'vitest'
import { ATOMIC_VERDICT, groupVerdict, VERDICT } from './verdict.js'

describe('groupVerdict', () => {
  it('returns SUPPORTED when every atomic verdict is SUPPORTED', () => {
    expect(groupVerdict(['SUPPORTED', 'SUPPORTED'])).toBe('SUPPORTED')
  })

  it('returns REFUTED when every atomic verdict is REFUTED', () => {
    expect(groupVerdict(['REFUTED', 'REFUTED'])).toBe('REFUTED')
  })

  it('returns PARTIALLY_SUPPORTED only when SUPPORTED and REFUTED both occur', () => {
    expect(groupVerdict(['SUPPORTED', 'REFUTED'])).toBe('PARTIALLY_SUPPORTED')
    expect(groupVerdict(['SUPPORTED', 'SUPPORTED', 'REFUTED'])).toBe('PARTIALLY_SUPPORTED')
  })

  it('prioritizes INSUFFICIENT_EVIDENCE over every other atomic result', () => {
    expect(groupVerdict(['SUPPORTED', 'REFUTED', 'INSUFFICIENT_EVIDENCE'])).toBe(
      'INSUFFICIENT_EVIDENCE',
    )
    expect(groupVerdict(['UNVERIFIABLE', 'INSUFFICIENT_EVIDENCE'])).toBe('INSUFFICIENT_EVIDENCE')
  })

  it('returns UNVERIFIABLE when no INSUFFICIENT_EVIDENCE is present but UNVERIFIABLE is', () => {
    expect(groupVerdict(['SUPPORTED', 'UNVERIFIABLE'])).toBe('UNVERIFIABLE')
    expect(groupVerdict(['REFUTED', 'UNVERIFIABLE'])).toBe('UNVERIFIABLE')
  })

  it('never assigns PARTIALLY_SUPPORTED to a single atomic result, even a near-miss magnitude', () => {
    // docs/skills.md example: comparator ">= 2배" against an actual 1.38배
    // is a false comparison, i.e. REFUTED outright — not partially supported
    // for being "close". groupVerdict only ever produces PARTIALLY_SUPPORTED
    // from a *mix* of atomic results, never from a single REFUTED value.
    expect(groupVerdict(['REFUTED'])).toBe('REFUTED')
    expect(ATOMIC_VERDICT).not.toContain('PARTIALLY_SUPPORTED')
  })

  it('rejects an empty input instead of defaulting silently', () => {
    expect(() => groupVerdict([])).toThrow()
  })

  it('rejects an atomic verdict value outside ATOMIC_VERDICT', () => {
    expect(() => groupVerdict(['SUPPORTED', 'PARTIALLY_SUPPORTED'])).toThrow()
    expect(() => groupVerdict(['MAYBE'])).toThrow()
  })

  it('keeps VERDICT and ATOMIC_VERDICT consistent with docs/skills.md', () => {
    expect(VERDICT).toEqual([
      'SUPPORTED',
      'PARTIALLY_SUPPORTED',
      'REFUTED',
      'INSUFFICIENT_EVIDENCE',
      'UNVERIFIABLE',
    ])
    expect(ATOMIC_VERDICT).toEqual(['SUPPORTED', 'REFUTED', 'INSUFFICIENT_EVIDENCE', 'UNVERIFIABLE'])
  })
})
