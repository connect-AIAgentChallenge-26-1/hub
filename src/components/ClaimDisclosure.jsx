import { useState } from 'react'
import {
  DISCLOSURE_MODE,
  classifyDisclosure,
  resolvedClaimIds,
} from '../../contracts/disclosure.js'
import './ClaimDisclosure.css'

// 알려진 ambiguity_flag별 사람이 읽을 질문 문구. 목록에 없는 flag는 flag 원문을
// 그대로 보여준다 — 임의로 다른 질문으로 바꾸거나 모호성을 숨기지 않는다
// (docs/skills.md S7 제약).
const AMBIGUITY_QUESTION_LABEL = {
  comparison_period_unclear: '비교 기간이 맞는지 확인해주세요.',
  metric_unclear: '어떤 지표를 말하는지 확인해주세요.',
  comparison_entity_unclear: '비교 대상이 맞는지 확인해주세요.',
}

function questionLabel(flag) {
  return AMBIGUITY_QUESTION_LABEL[flag] ?? `"${flag}" 항목을 확인해주세요.`
}

function SummaryCard({ claim }) {
  return (
    <div className="claim-disclosure-card claim-disclosure-card--summary">
      <p className="claim-disclosure-span">{claim.original_span}</p>
      <p className="claim-disclosure-hint">확인이 필요한 항목이 없어 자동으로 진행됩니다.</p>
    </div>
  )
}

function ConfirmQuestionCard({ claim, answer, onAnswer }) {
  const flags = claim.ambiguity_flags ?? []
  return (
    <div className="claim-disclosure-card claim-disclosure-card--confirm">
      <p className="claim-disclosure-span">{claim.original_span}</p>
      {flags.map((flag) => (
        <fieldset key={flag} className="claim-disclosure-question">
          <legend>{questionLabel(flag)}</legend>
          <label>
            <input
              type="radio"
              name={`${claim.claim_id}-${flag}`}
              checked={answer === true}
              onChange={() => onAnswer(claim.claim_id, true)}
            />
            맞습니다
          </label>
          <label>
            <input
              type="radio"
              name={`${claim.claim_id}-${flag}`}
              checked={answer === false}
              onChange={() => onAnswer(claim.claim_id, false)}
            />
            아니요, 다시 확인이 필요합니다
          </label>
        </fieldset>
      ))}
      {answer === undefined && (
        <p className="claim-disclosure-hint" role="status">
          답변하지 않으면 이 주장은 확인 필요(검증 불가)로 표시됩니다.
        </p>
      )}
    </div>
  )
}

/**
 * F9 progressive disclosure — docs/skills.md S7 제약. ambiguity_flags가
 * 비어 있는 Claim은 편집기 없이 요약 카드로 자동 진행하고, 있는 Claim만
 * 해당 항목을 객관식 확인 질문으로 보여준다. `onResolutionChange`는 답변이
 * 바뀔 때마다 "검증에 넘길 수 있는 claim_id 집합"(Set)을 받는다 — 이 집합
 * 밖의 Claim은 호출자가 UNVERIFIABLE로 처리해야 한다(verdict 자체는 이
 * 컴포넌트가 아니라 서버 S16이 낸다).
 */
function ClaimDisclosure({ claims, onResolutionChange }) {
  const [answers, setAnswers] = useState({})

  const items = classifyDisclosure(claims)

  function handleAnswer(claimId, value) {
    const next = { ...answers, [claimId]: value }
    setAnswers(next)
    onResolutionChange?.(resolvedClaimIds(claims, next))
  }

  return (
    <div className="claim-disclosure" role="list" aria-label="주장 확인 목록">
      {items.map((item) => {
        const claim = claims.find((c) => c.claim_id === item.claimId)
        return (
          <div role="listitem" key={item.claimId}>
            {item.mode === DISCLOSURE_MODE.AUTO_SUMMARY ? (
              <SummaryCard claim={claim} />
            ) : (
              <ConfirmQuestionCard
                claim={claim}
                answer={answers[claim.claim_id]}
                onAnswer={handleAnswer}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

export default ClaimDisclosure
