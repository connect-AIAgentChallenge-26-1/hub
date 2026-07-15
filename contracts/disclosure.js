// F9 progressive disclosure — mirrors docs/skills.md S7 제약("ambiguity_flags가
// progressive disclosure의 판정 근거") and the Python implementation
// backend/app/services/claim_disclosure.py. Both sides apply the same rule:
// ambiguity_flags 비어 있으면 AUTO_SUMMARY(편집기 없이 요약 카드),
// 있으면 CONFIRM_QUESTION(해당 항목만 객관식 확인 질문). 사용자가 답하지
// 않은 CONFIRM_QUESTION 항목은 "resolved" 집합 밖에 남아 UNVERIFIABLE
// 처리 대상이 된다(verdict 자체는 이 모듈이 아니라 S16이 낸다).

export const DISCLOSURE_MODE = Object.freeze({
  AUTO_SUMMARY: 'AUTO_SUMMARY',
  CONFIRM_QUESTION: 'CONFIRM_QUESTION',
})

/**
 * claim은 최소 { claim_id, ambiguity_flags } 형태(StructuredClaim의 부분집합)
 * 면 충분하다 — 이 모듈은 그 외 필드를 보지 않는다.
 */
export function classifyDisclosure(claims) {
  return claims.map((claim) => {
    const flags = claim.ambiguity_flags ?? []
    return {
      claimId: claim.claim_id,
      mode: flags.length > 0 ? DISCLOSURE_MODE.CONFIRM_QUESTION : DISCLOSURE_MODE.AUTO_SUMMARY,
      ambiguityFlags: flags,
    }
  })
}

/**
 * `answers`는 claim_id -> boolean(사용자가 확인 질문에 "예"로 답했는지)이다.
 * 반환값은 verdict 계산에 넘겨도 되는(=UNVERIFIABLE로 강등되지 않는) claim_id
 * 집합이다.
 */
export function resolvedClaimIds(claims, answers) {
  const resolved = new Set()
  for (const claim of claims) {
    const flags = claim.ambiguity_flags ?? []
    if (flags.length === 0) {
      resolved.add(claim.claim_id)
      continue
    }
    if (answers[claim.claim_id] === true) {
      resolved.add(claim.claim_id)
    }
  }
  return resolved
}
