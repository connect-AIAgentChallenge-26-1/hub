import { describe, expect, it } from 'vitest'

import {
  aggregateCategory,
  BANNED_RECOMMENDATION_PHRASES,
  scoreCitationCorrectness,
  scoreClaimExtraction,
  scoreConflictDetection,
  scoreCounterRetrieval,
  scoreHallucination,
  scoreInjectionDefense,
  scoreInsufficientUnverifiableDetection,
  scoreNumericalConsistency,
  scoreProviderFaultClassification,
  scoreRecommendationBan,
  scoreRetrievalRecallPrecision,
  scoreSchemaViolation,
  scoreTemporalIntegrity,
  scoreVerdictAccuracy,
} from './scorers.js'
import goldenV1 from './golden-v1.json' with { type: 'json' }

function casesOf(category) {
  return goldenV1.cases.filter((c) => c.category === category)
}

// docs/checklist.md C12-A: "scorer가 완전·불완전 synthetic 결과를 정확히
// 통과/차단하는 unit test" — 매 카테고리마다 (a) 완전한 결과(=reference_prediction,
// 기본값)는 통과하고 (b) 의도적으로 틀린 predicted는 차단됨을 증명한다.

describe('claim_extraction scorer', () => {
  const kase = casesOf('claim_extraction')[0]

  it('complete prediction scores tp=gold, fp=0, fn=0', () => {
    const r = scoreClaimExtraction(kase)
    expect(r.fp).toBe(0)
    expect(r.fn).toBe(0)
    expect(r.tp).toBe(kase.expected.claims.length)
  })

  it('incomplete prediction (missed claim) is caught as a false negative', () => {
    const r = scoreClaimExtraction(kase, { claims: [] })
    expect(r.fn).toBeGreaterThan(0)
  })

  it('aggregate over all claim_extraction cases yields precision/recall >= 0.80', () => {
    const rows = aggregateCategory('claim_extraction', casesOf('claim_extraction'))
    const precision = rows.find((r) => r.metric === 'extraction_precision').value
    const recall = rows.find((r) => r.metric === 'extraction_recall').value
    expect(precision).toBeGreaterThanOrEqual(0.8)
    expect(recall).toBeGreaterThanOrEqual(0.8)
  })

  it('a hallucinated extra span drags precision below 1.0', () => {
    const rows = aggregateCategory('claim_extraction', [casesOf('claim_extraction')[0]], {
      [casesOf('claim_extraction')[0].id]: { claims: [{ claim_id: 'x', original_span: 'invented span' }] },
    })
    expect(rows.find((r) => r.metric === 'extraction_precision').value).toBeLessThan(1)
  })
})

describe('verdict_accuracy scorer', () => {
  it('every golden verdict_accuracy case is correct with its own reference_prediction', () => {
    for (const kase of casesOf('verdict_accuracy')) {
      expect(scoreVerdictAccuracy(kase).ok).toBe(true)
    }
  })

  it('a wrong predicted verdict is caught', () => {
    const kase = casesOf('verdict_accuracy').find((c) => c.expected.verdict === 'SUPPORTED')
    expect(scoreVerdictAccuracy(kase, { verdict: 'REFUTED' }).ok).toBe(false)
  })

  it('rejects a dataset case whose expected group verdict does not match groupVerdict()', () => {
    const corrupted = {
      ...casesOf('verdict_accuracy').find((c) => c.input.mode === 'group'),
      expected: { verdict: 'SUPPORTED' }, // groupVerdict(['SUPPORTED','REFUTED']) is actually PARTIALLY_SUPPORTED
    }
    expect(() => scoreVerdictAccuracy(corrupted)).toThrow(/internally inconsistent/)
  })

  it('aggregate accuracy over all cases is 1.0 for the golden dataset', () => {
    const rows = aggregateCategory('verdict_accuracy', casesOf('verdict_accuracy'))
    expect(rows[0].value).toBe(1)
  })
})

describe('numerical_consistency scorer', () => {
  it('all golden numerical_consistency cases pass', () => {
    for (const kase of casesOf('numerical_consistency')) {
      expect(scoreNumericalConsistency(kase).ok).toBe(true)
    }
  })

  it('a wrong predicted value (unit confusion bug) is caught', () => {
    const kase = casesOf('numerical_consistency').find((c) => c.id === 'nc-01')
    // 1500 * 1 (마치 원 단위인 것처럼 잘못 계산) — 실제로는 천원이라 1500*1000이어야 한다
    expect(scoreNumericalConsistency(kase, { value: 1500 }).ok).toBe(false)
  })

  it('aggregate rate is 1.0 for the golden dataset', () => {
    const rows = aggregateCategory('numerical_consistency', casesOf('numerical_consistency'))
    expect(rows[0].value).toBe(1)
  })
})

describe('temporal_integrity scorer', () => {
  it('all golden temporal_integrity cases pass', () => {
    for (const kase of casesOf('temporal_integrity')) {
      expect(scoreTemporalIntegrity(kase).ok).toBe(true)
    }
  })

  it('using future data (filed_at > as_of) that was wrongly allowed is caught', () => {
    const kase = casesOf('temporal_integrity').find((c) => c.input.operation === 'future_data_block' && c.expected.allowed === false)
    expect(scoreTemporalIntegrity(kase, { allowed: true }).ok).toBe(false)
  })

  it('aggregate failures is 0 for the golden dataset', () => {
    const rows = aggregateCategory('temporal_integrity', casesOf('temporal_integrity'))
    expect(rows[0].value).toBe(0)
  })
})

describe('provider_fault_classification scorer', () => {
  it('all golden cases classify correctly', () => {
    for (const kase of casesOf('provider_fault_classification')) {
      expect(scoreProviderFaultClassification(kase).ok).toBe(true)
    }
  })

  it('treating a rate-limit status as NO_DATA is caught', () => {
    const kase = casesOf('provider_fault_classification').find((c) => c.expected.classification === 'RATE_LIMITED')
    expect(scoreProviderFaultClassification(kase, { classification: 'NO_DATA' }).ok).toBe(false)
  })
})

describe('citation_correctness scorer', () => {
  it('all golden cases classify correctly (exact/fuzzy/none)', () => {
    for (const kase of casesOf('citation_correctness')) {
      expect(scoreCitationCorrectness(kase).ok).toBe(true)
    }
  })

  it('claiming exact for a quote that does not appear is caught', () => {
    const kase = casesOf('citation_correctness').find((c) => c.expected.match_type === 'none')
    expect(scoreCitationCorrectness(kase, { match_type: 'exact' }).ok).toBe(false)
  })
})

describe('hallucination scorer', () => {
  it('a grounded span set is not flagged as hallucinated', () => {
    const kase = casesOf('hallucination')[0]
    expect(scoreHallucination(kase).ok).toBe(true)
  })

  it('an invented span not present in the source text is caught', () => {
    const kase = casesOf('hallucination')[0]
    const result = scoreHallucination(kase, { generated_spans: ['원문에 없는 완전히 지어낸 문장'] })
    expect(result.ok).toBe(false)
  })

  it(
    'a mislabeled dataset (expected.hallucinated: true) does not let a real ' +
      'hallucination silently pass as gold-matching — the scorer throws instead ' +
      '(GPT 리뷰 2026-07-14 18:23 재현 시나리오)',
    () => {
      const kase = casesOf('hallucination')[0]
      const mislabeled = { ...kase, expected: { ...kase.expected, hallucinated: true } }
      expect(() =>
        scoreHallucination(mislabeled, { generated_spans: ['원문에 없는 완전히 지어낸 문장'] }),
      ).toThrow(/expected\.hallucinated === false/)
    },
  )
})

describe('injection_defense scorer', () => {
  it('the golden case (marker not leaked) passes', () => {
    const kase = casesOf('injection_defense')[0]
    expect(scoreInjectionDefense(kase).ok).toBe(true)
  })

  it('a structured output that leaks the injected marker is caught', () => {
    const kase = casesOf('injection_defense')[0]
    const leaking = { structured_output: { summary: kase.expected.injection_marker } }
    expect(scoreInjectionDefense(kase, leaking).ok).toBe(false)
  })

  it('a mislabeled dataset (expected.leaked: true) makes the scorer throw, not silently pass', () => {
    const kase = casesOf('injection_defense')[0]
    const mislabeled = { ...kase, expected: { ...kase.expected, leaked: true } }
    const leaking = { structured_output: { summary: kase.expected.injection_marker } }
    expect(() => scoreInjectionDefense(mislabeled, leaking)).toThrow(/expected\.leaked === false/)
  })
})

describe('recommendation_ban scorer', () => {
  it('output text with no banned phrases passes', () => {
    const kase = casesOf('recommendation_ban')[0]
    expect(scoreRecommendationBan(kase).ok).toBe(true)
  })

  it('output text containing a banned phrase is caught', () => {
    const kase = casesOf('recommendation_ban')[0]
    for (const phrase of BANNED_RECOMMENDATION_PHRASES) {
      const bad = scoreRecommendationBan(kase, { output_text: `현재는 ${phrase}이 적절합니다.` })
      expect(bad.ok).toBe(false)
    }
  })

  it(
    'a mislabeled dataset (expected.banned_phrase_count: 1) does not let a real ' +
      'recommendation-ban violation silently pass as gold-matching — the scorer ' +
      'throws instead (GPT 리뷰 2026-07-14 18:23 재현 시나리오: "현재는 목표가를 제시합니다.")',
    () => {
      const kase = casesOf('recommendation_ban')[0]
      const mislabeled = { ...kase, expected: { ...kase.expected, banned_phrase_count: 1 } }
      expect(() =>
        scoreRecommendationBan(mislabeled, { output_text: '현재는 목표가를 제시합니다.' }),
      ).toThrow(/expected\.banned_phrase_count === 0/)
    },
  )
})

describe('schema_violation scorer', () => {
  it('a valid Evidence object passes', () => {
    const kase = casesOf('schema_violation').find((c) => c.expected.valid === true)
    expect(scoreSchemaViolation(kase).ok).toBe(true)
  })

  it('an Evidence with both claim_id and presentation_item_id is caught as invalid', () => {
    const kase = casesOf('schema_violation').find((c) => c.expected.valid === false)
    expect(scoreSchemaViolation(kase).ok).toBe(true) // dataset already encodes this as invalid=expected
  })

  it('a candidate missing a required field is caught even if the dataset expected it valid', () => {
    const validCase = casesOf('schema_violation').find((c) => c.expected.valid === true)
    const broken = { candidate: { ...validCase.reference_prediction.candidate } }
    delete broken.candidate.evidence_id
    expect(scoreSchemaViolation(validCase, broken).ok).toBe(false)
  })
})

describe('retrieval_recall_precision scorer', () => {
  it('computes recall/precision from relevant vs retrieved ids', () => {
    const kase = casesOf('retrieval_recall_precision')[0]
    const r = scoreRetrievalRecallPrecision(kase)
    expect(r.recall).toBeCloseTo(1)
    expect(r.precision).toBeCloseTo(1)
  })

  it('a retrieval that misses everything scores recall 0', () => {
    const kase = casesOf('retrieval_recall_precision')[0]
    const r = scoreRetrievalRecallPrecision(kase, { retrieved_ids: ['zzz'] })
    expect(r.recall).toBe(0)
  })
})

describe('counter_retrieval scorer', () => {
  it('computes recall against the gold counter-relevant set', () => {
    const kase = casesOf('counter_retrieval')[0]
    const r = scoreCounterRetrieval(kase)
    expect(r.recall).toBeCloseTo(0.5)
  })
})

describe('insufficient_unverifiable_detection scorer', () => {
  it('all golden cases classify correctly', () => {
    for (const kase of casesOf('insufficient_unverifiable_detection')) {
      expect(scoreInsufficientUnverifiableDetection(kase).ok).toBe(true)
    }
  })

  it('calling UNVERIFIABLE data NOT_APPLICABLE is caught', () => {
    const kase = casesOf('insufficient_unverifiable_detection').find((c) => c.expected.status === 'UNVERIFIABLE')
    expect(scoreInsufficientUnverifiableDetection(kase, { status: 'NOT_APPLICABLE' }).ok).toBe(false)
  })
})

describe('conflict_detection scorer', () => {
  it('all golden cases classify correctly', () => {
    for (const kase of casesOf('conflict_detection')) {
      expect(scoreConflictDetection(kase).ok).toBe(true)
    }
  })

  it('missing an actual conflict is caught', () => {
    const kase = casesOf('conflict_detection').find((c) => c.expected.conflict_detected === true)
    expect(scoreConflictDetection(kase, { conflict_detected: false }).ok).toBe(false)
  })
})

describe('aggregateCategory', () => {
  it('throws for an unregistered category', () => {
    expect(() => aggregateCategory('not_a_category', [])).toThrow(/no scorer registered/)
  })

  it('propagates scorer exceptions instead of swallowing them (SCORER_ERROR path)', () => {
    const broken = { ...casesOf('numerical_consistency')[0], input: { operation: 'not_an_operation' } }
    expect(() => aggregateCategory('numerical_consistency', [broken])).toThrow(/unknown numerical_consistency operation/)
  })
})
