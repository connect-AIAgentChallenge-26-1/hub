import './EvidenceResult.css'

// 기능 C 근거 검증 결과 화면 (docs/skills.md S11, docs/checklist.md C10).
// 서버 S8 오케스트레이션(VerifyEvidencePayload)과 S9 체크리스트를 그대로
// 렌더링한다 — 이 컴포넌트는 verdict를 새로 계산하지 않고(결정론은 서버 책임)
// 숨겨진 근거나 생성된 출처를 만들지 않는다(docs/skills.md S11 제약).

const VERDICT_LABEL = {
  SUPPORTED: '지지됨',
  REFUTED: '반증됨',
  PARTIALLY_SUPPORTED: '부분 지지',
  INSUFFICIENT_EVIDENCE: '근거 부족',
  UNVERIFIABLE: '검증 불가',
}

// CLAUDE.md 절대 원칙 7·오류 구분 — provider 장애(EXTERNAL_ERROR)는 "데이터
// 없음"과 다르게 표시한다. 데이터가 없어서 근거 부족인 것과, 외부 API가
// 장애라 확인 자체를 못 한 것을 사용자가 구분할 수 있어야 한다.
function ProviderError({ reasonCode }) {
  return (
    <div className="evidence-result__error" role="alert">
      <strong>외부 데이터 제공자 장애로 검증을 완료하지 못했습니다.</strong>
      <p>
        이것은 "근거가 없어 검증 불가"와 다릅니다 — 잠시 후 다시 시도해주세요.
        (사유 코드: {reasonCode})
      </p>
    </div>
  )
}

function VerdictBadge({ verdict }) {
  return (
    <span className={`verdict-badge verdict-badge--${verdict}`}>
      {VERDICT_LABEL[verdict] ?? verdict}
    </span>
  )
}

function Calculation({ calculation }) {
  if (!calculation) return null
  return (
    <pre className="evidence-calc" aria-label="계산식">
      {calculation.formula}
      {calculation.computed_value !== undefined && ` = ${calculation.computed_value}`}
    </pre>
  )
}

function Citation({ citation }) {
  return (
    <div className="citation">
      <p className="citation__quote">“{citation.quote}”</p>
      <div className="citation__meta">
        <span>기준일 {citation.filed_at}</span>
        {citation.target_period && <span>대상기간 {citation.target_period}</span>}
        <span>관계 {citation.relation}</span>
        <span>인용검사 {citation.method}</span>
        <a href={citation.source_url} target="_blank" rel="noreferrer">
          원문 보기
        </a>
      </div>
    </div>
  )
}

function ClaimCard({ result }) {
  const conflicts = result.conflicts ?? []
  const citations = result.citations ?? []
  return (
    <section className="evidence-claim" aria-label={`판정 ${result.claim_id}`}>
      <div className="evidence-claim__header">
        <VerdictBadge verdict={result.verdict} />
        <span>{result.claim_id}</span>
      </div>
      {result.reason_code && result.reason_code !== 'OK' && (
        <p className="evidence-claim__reason">사유: {result.reason_code}</p>
      )}
      {result.missing_fields?.length > 0 && (
        <p className="evidence-claim__reason">부족한 근거: {result.missing_fields.join(', ')}</p>
      )}
      <Calculation calculation={result.calculation} />

      {conflicts.length > 0 && (
        <div className="evidence-conflict" role="note">
          지지 근거와 반증 근거가 함께 발견되었습니다 ({conflicts.length}건). 원문을 직접
          확인하세요.
        </div>
      )}

      {citations.length > 0 && (
        <div aria-label="인용 원문">
          {citations.map((c) => (
            <Citation key={c.evidence_id} citation={c} />
          ))}
        </div>
      )}

      {result.confidence_basis && (
        <p className="evidence-trace">판정 근거 설명: {result.confidence_basis}</p>
      )}
      {result.search_attempts?.length > 0 && (
        <p className="evidence-trace">검색 시도 {result.search_attempts.length}회</p>
      )}
    </section>
  )
}

function Checklist({ items }) {
  if (!items || items.length === 0) return null
  return (
    <div aria-label="확인 체크리스트">
      <h3>확인이 필요한 항목</h3>
      <ul className="evidence-checklist">
        {items.map((item, idx) => (
          <li className="evidence-checklist__item" key={`${item.status}-${idx}`}>
            <span>{item.item}</span>
            {item.source_links?.map((link) => (
              <a key={link} href={link} target="_blank" rel="noreferrer">
                {' '}
                원문
              </a>
            ))}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * @param {object} props
 * @param {object|null} props.payload  VerifyEvidencePayload (성공 시)
 * @param {object|null} props.error    { status, reason_code } (EXTERNAL_ERROR 등)
 */
function EvidenceResult({ payload, error }) {
  if (error && error.status && error.status !== 'SUCCESS') {
    return (
      <div className="evidence-result">
        <ProviderError reasonCode={error.reason_code} />
      </div>
    )
  }
  if (!payload) return null

  return (
    <div className="evidence-result">
      {payload.claim_results.map((result) => (
        <ClaimCard key={result.claim_id} result={result} />
      ))}

      {Object.keys(payload.group_results ?? {}).length > 0 && (
        <section aria-label="그룹 결과">
          <h3>그룹 판정</h3>
          <ul>
            {Object.entries(payload.group_results).map(([groupId, verdict]) => (
              <li key={groupId}>
                {groupId}: <VerdictBadge verdict={verdict} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <Checklist items={payload.checklist} />

      <p className="evidence-versions">
        규칙 버전: {payload.orchestrator_version}
      </p>
    </div>
  )
}

export default EvidenceResult
