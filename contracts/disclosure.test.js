import { describe, expect, it } from 'vitest'
import { DISCLOSURE_MODE, classifyDisclosure, resolvedClaimIds } from './disclosure.js'

function claim(claimId, ambiguityFlags) {
  return { claim_id: claimId, ambiguity_flags: ambiguityFlags }
}

describe('classifyDisclosure', () => {
  it('a claim without ambiguity_flags auto-proceeds to summary', () => {
    const items = classifyDisclosure([claim('c1', [])])
    expect(items[0].mode).toBe(DISCLOSURE_MODE.AUTO_SUMMARY)
  })

  it('a claim with ambiguity_flags requires a confirm question', () => {
    const items = classifyDisclosure([claim('c1', ['comparison_period_unclear'])])
    expect(items[0].mode).toBe(DISCLOSURE_MODE.CONFIRM_QUESTION)
    expect(items[0].ambiguityFlags).toEqual(['comparison_period_unclear'])
  })

  it('classifies each claim in a mixed batch independently', () => {
    const items = classifyDisclosure([claim('c1', []), claim('c2', ['metric_unclear'])])
    const modes = Object.fromEntries(items.map((i) => [i.claimId, i.mode]))
    expect(modes.c1).toBe(DISCLOSURE_MODE.AUTO_SUMMARY)
    expect(modes.c2).toBe(DISCLOSURE_MODE.CONFIRM_QUESTION)
  })
})

describe('resolvedClaimIds', () => {
  it('includes AUTO_SUMMARY claims without asking', () => {
    const resolved = resolvedClaimIds([claim('c1', [])], {})
    expect(resolved).toEqual(new Set(['c1']))
  })

  it('includes an ambiguous claim the user answered yes to', () => {
    const resolved = resolvedClaimIds([claim('c1', ['metric_unclear'])], { c1: true })
    expect(resolved).toEqual(new Set(['c1']))
  })

  it('excludes an ambiguous claim the user did not answer', () => {
    // docs/skills.md S7: "사용자가 질문에 답하지 않으면 해당 Claim은
    // UNVERIFIABLE로 처리한다" — 이 함수는 그 대상을 resolved 밖에 둔다.
    const resolved = resolvedClaimIds([claim('c1', ['metric_unclear'])], {})
    expect(resolved).toEqual(new Set())
  })

  it('excludes an ambiguous claim the user explicitly declined', () => {
    const resolved = resolvedClaimIds([claim('c1', ['metric_unclear'])], { c1: false })
    expect(resolved).toEqual(new Set())
  })
})
