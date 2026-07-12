// 5-state Verdict contract — mirrors docs/skills.md "Verdict" and the group
// aggregation priority table. PARTIALLY_SUPPORTED is a group-only value:
// no skill may assign it directly to an atomic claim (CLAUDE.md 절대 원칙 5,
// docs/skills.md "원자 수치 Claim은 ... PARTIALLY_SUPPORTED를 사용하지 않는다").

export const VERDICT_SCHEMA_VERSION = '1.0.0'

export const VERDICT = Object.freeze([
  'SUPPORTED',
  'PARTIALLY_SUPPORTED',
  'REFUTED',
  'INSUFFICIENT_EVIDENCE',
  'UNVERIFIABLE',
])

export const ATOMIC_VERDICT = Object.freeze([
  'SUPPORTED',
  'REFUTED',
  'INSUFFICIENT_EVIDENCE',
  'UNVERIFIABLE',
])

/**
 * Aggregates atomic verdicts within one claim_group_id into a single group
 * verdict, following docs/skills.md priority table exactly:
 *   1. any INSUFFICIENT_EVIDENCE            -> INSUFFICIENT_EVIDENCE
 *   2. no insufficient, any UNVERIFIABLE     -> UNVERIFIABLE
 *   3. both SUPPORTED and REFUTED present    -> PARTIALLY_SUPPORTED
 *   4. all SUPPORTED                         -> SUPPORTED
 *   5. all REFUTED                           -> REFUTED
 *
 * Deterministic and pure: same input always yields same output (I2/I3,
 * CLAUDE.md 절대 원칙 5). Throws on empty input or any value outside
 * ATOMIC_VERDICT — the rule refuses to guess rather than default silently.
 */
export function groupVerdict(atomicVerdicts) {
  if (!Array.isArray(atomicVerdicts) || atomicVerdicts.length === 0) {
    throw new Error('groupVerdict requires a non-empty array of atomic verdicts')
  }

  for (const v of atomicVerdicts) {
    if (!ATOMIC_VERDICT.includes(v)) {
      throw new Error(
        `invalid atomic verdict "${v}"; must be one of ${ATOMIC_VERDICT.join(', ')}`,
      )
    }
  }

  if (atomicVerdicts.includes('INSUFFICIENT_EVIDENCE')) return 'INSUFFICIENT_EVIDENCE'
  if (atomicVerdicts.includes('UNVERIFIABLE')) return 'UNVERIFIABLE'

  const hasSupported = atomicVerdicts.includes('SUPPORTED')
  const hasRefuted = atomicVerdicts.includes('REFUTED')

  if (hasSupported && hasRefuted) return 'PARTIALLY_SUPPORTED'
  if (hasSupported) return 'SUPPORTED'
  return 'REFUTED'
}
