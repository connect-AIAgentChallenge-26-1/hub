import './ValuationReport.css'

// 기능 B 가치 범위·가격 위치 화면 (docs/skills.md S5·S6·S21, docs/checklist.md
// C6). 서버 오케스트레이션 결과(ValuationReportPayload)를 그대로 렌더링한다 —
// 단일 목표가·매수 가능·관망·분할매수·보류 문구를 출력하지 않는다(docs/skills.md
// S6 제약, CLAUDE.md 절대 원칙 1). 방법마다 항상 저·중·고 3점 범위로만 표시한다.

const POSITION_LABEL = {
  BELOW_MODEL_RANGE: '범위 하단 아래',
  WITHIN_MODEL_RANGE: '범위 내부',
  ABOVE_MODEL_RANGE: '범위 상단 위',
  INSUFFICIENT: '검증 불가',
}

function PositionBadge({ position }) {
  return (
    <span className={`position-badge position-badge--${position}`}>
      {POSITION_LABEL[position] ?? position}
    </span>
  )
}

function TargetOverview({ profile }) {
  if (!profile) return null
  return (
    <section className="valuation-report__section" aria-label="대상 기업">
      <h3>{profile.corp_name}</h3>
      <dl className="target-overview__grid">
        <dt>업종코드</dt>
        <dd>{profile.industry_code}</dd>
        <dt>현재가</dt>
        <dd>{profile.price.toLocaleString()}원</dd>
        <dt>EPS</dt>
        <dd>{profile.eps !== null ? `${profile.eps.toLocaleString()}원` : '데이터 없음'}</dd>
        <dt>BPS</dt>
        <dd>{profile.bps !== null ? `${profile.bps.toLocaleString()}원` : '데이터 없음'}</dd>
        <dt>PER</dt>
        <dd>{profile.per !== null ? profile.per.toFixed(2) : '데이터 없음'}</dd>
        <dt>PBR</dt>
        <dd>{profile.pbr !== null ? profile.pbr.toFixed(2) : '데이터 없음'}</dd>
        <dt>기준일</dt>
        <dd>{profile.price_as_of}</dd>
      </dl>
    </section>
  )
}

function PeerUniverse({ peer }) {
  if (!peer) return null
  return (
    <section className="valuation-report__section" aria-label="비교군">
      <h3>
        비교군 ({peer.peer_universe.length}개
        {peer.sufficient ? '' : ' — 표본 부족'})
      </h3>
      <ul className="peer-list">
        {peer.peer_universe.map((p) => (
          <li className="peer-item" key={p.corp_code}>
            {p.corp_name} — PER {p.per !== null ? p.per.toFixed(2) : '-'}, PBR{' '}
            {p.pbr !== null ? p.pbr.toFixed(2) : '-'}
          </li>
        ))}
      </ul>
      {peer.exclusions.length > 0 && (
        <div>
          <p className="peer-exclusion">제외된 후보:</p>
          <ul className="peer-list">
            {peer.exclusions.map((e) => (
              <li className="peer-exclusion" key={e.corp_code}>
                {e.corp_name} — {e.reason_code}: {e.detail}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="valuation-report__version">
        중앙값 PER {peer.statistics.per_median?.toFixed(2) ?? '-'} · 중앙값 PBR{' '}
        {peer.statistics.pbr_median?.toFixed(2) ?? '-'} (표본 {peer.statistics.sample_size}개)
      </p>
    </section>
  )
}

function ValueRanges({ valuation }) {
  if (!valuation || valuation.value_ranges.length === 0) return null
  return (
    <section className="valuation-report__section" aria-label="가치 범위">
      <h3>가치 범위</h3>
      {valuation.value_ranges.map((r) => (
        <div className="value-range" key={r.method}>
          <p className="value-range__method">{r.method}</p>
          <p className="value-range__bounds">
            {r.low.toLocaleString()} ~ {r.mid.toLocaleString()} ~ {r.high.toLocaleString()}
          </p>
          <p className="value-range__note">{r.formula}</p>
          <p className="value-range__note">{r.assumptions}</p>
        </div>
      ))}
    </section>
  )
}

function PricePosition({ pricePosition }) {
  if (!pricePosition) return null
  return (
    <section className="valuation-report__section" aria-label="가격 위치">
      <h3>
        가격 위치 <PositionBadge position={pricePosition.overall_position} />
      </h3>
      {pricePosition.method_positions.length > 0 && (
        <ul className="method-position-list">
          {pricePosition.method_positions.map((mp) => (
            <li className="method-position-item" key={mp.method}>
              <span>{mp.method}</span>
              <PositionBadge position={mp.position} />
            </li>
          ))}
        </ul>
      )}
      {pricePosition.sensitivity && (
        <p className="value-range__note">{pricePosition.sensitivity}</p>
      )}
    </section>
  )
}

function Checkpoints({ checkpoints }) {
  if (!checkpoints || checkpoints.length === 0) return null
  return (
    <section className="valuation-report__section" aria-label="확인 포인트">
      <h3>확인 포인트</h3>
      <ul className="checkpoint-list">
        {checkpoints.map((c, idx) => (
          <li className={`checkpoint-item checkpoint-item--${c.severity}`} key={`${c.code}-${idx}`}>
            {c.message}
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * @param {object} props
 * @param {object|null} props.report  ValuationReportPayload
 */
function ValuationReport({ report }) {
  if (!report) return null
  return (
    <div className="valuation-report">
      <TargetOverview profile={report.target_profile} />
      <PeerUniverse peer={report.peer} />
      <ValueRanges valuation={report.valuation} />
      <PricePosition pricePosition={report.price_position} />
      <Checkpoints checkpoints={report.checkpoints} />
      <p className="valuation-report__version">규칙 버전: {report.generator_version}</p>
    </div>
  )
}

export default ValuationReport
