import './CompanyReport.css'

// 기능 A 종목 공부 리포트 화면 (docs/skills.md S11, docs/checklist.md C5).
// 서버 S11 오케스트레이션(CompanyReportPayload)을 그대로 렌더링한다 — 이
// 컴포넌트는 판단을 내리지 않고(추천·단정 문구 없음), 숨겨진 근거나 생성된
// 출처를 표시하지 않는다(docs/skills.md S11 제약).

function Overview({ overview }) {
  if (!overview) return null
  return (
    <section className="company-report__section" aria-label="기업개요">
      <h3>기업개요</h3>
      <dl className="company-overview__grid">
        <dt>회사명</dt>
        <dd>
          {overview.corp_name} ({overview.corp_name_eng})
        </dd>
        <dt>대표자</dt>
        <dd>{overview.ceo_name}</dd>
        <dt>상장 구분</dt>
        <dd>{overview.corp_classification_label}</dd>
        <dt>주소</dt>
        <dd>{overview.address}</dd>
        <dt>설립일</dt>
        <dd>{overview.established_date}</dd>
        <dt>결산월</dt>
        <dd>{overview.fiscal_year_end_month}월</dd>
      </dl>
      <p className="company-overview__as-of">
        기준일 {overview.as_of} ·{' '}
        <a href={overview.source_url} target="_blank" rel="noreferrer">
          공식 DART 원문
        </a>
      </p>
    </section>
  )
}

function Disclosures({ disclosures }) {
  if (!disclosures || disclosures.length === 0) return null
  return (
    <section className="company-report__section" aria-label="최근 공시">
      <h3>최근 공시</h3>
      <ul className="disclosure-list">
        {disclosures.map((d) => (
          <li className="disclosure-item" key={d.rcept_no}>
            {d.is_correction && <span className="correction-badge">정정공시</span>}
            <span>{d.report_nm}</span>
            <span className="company-overview__as-of">
              접수일 {d.filed_at} · {d.report_type}
              {d.corrected_original_rcept_no && ` · 원본 ${d.corrected_original_rcept_no} 정정`}
              {d.corrected_by_rcept_no && ` · ${d.corrected_by_rcept_no}에서 정정됨`}
            </span>
            <a href={d.source_url} target="_blank" rel="noreferrer">
              공식 DART 원문
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}

function MetricTrend({ trend }) {
  return (
    <div className="metric-trend">
      <p className="metric-trend__name">{trend.metric}</p>
      <table>
        <thead>
          <tr>
            <th>기간</th>
            <th>값</th>
            <th>원본 계정</th>
            <th>기준일</th>
          </tr>
        </thead>
        <tbody>
          {trend.points.map((p) => (
            <tr key={p.fiscal_period}>
              <td>{p.fiscal_period}</td>
              <td>
                {p.value.toLocaleString()} {p.unit}
              </td>
              <td>{p.account_name}</td>
              <td>{p.filed_at}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {trend.change_reason_code && (
        <p className="metric-trend__change">
          변화: {trend.change_reason_code}
          {trend.change_pct !== null && trend.change_pct !== undefined &&
            ` (${trend.change_pct.toFixed(1)}%)`}
        </p>
      )}
      {trend.points[0]?.formula && (
        <p className="metric-trend__change">공식: {trend.points.find((p) => p.formula)?.formula}</p>
      )}
    </div>
  )
}

function MetricTrends({ trends }) {
  if (!trends || trends.length === 0) return null
  return (
    <section className="company-report__section" aria-label="재무지표">
      <h3>재무지표</h3>
      {trends.map((t) => (
        <MetricTrend key={t.metric} trend={t} />
      ))}
    </section>
  )
}

function Glossary({ glossary }) {
  if (!glossary || glossary.definitions.length === 0) return null
  return (
    <section className="company-report__section" aria-label="용어 설명">
      <h3>용어 설명</h3>
      <ul className="glossary-list">
        {glossary.definitions.map((d) => (
          <li className="glossary-item" key={d.term}>
            <span className="glossary-term">{d.term}</span>: {d.definition}{' '}
            <span className="glossary-source">({d.source})</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Checkpoints({ checkpoints }) {
  if (!checkpoints || checkpoints.length === 0) return null
  return (
    <section className="company-report__section" aria-label="확인 포인트">
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

function Citations({ citations }) {
  if (!citations || citations.length === 0) return null
  return (
    <section className="company-report__section" aria-label="원문 인용">
      <h3>원문 인용</h3>
      {citations.map((c) => (
        <div className="citation-viewer" key={c.evidence_id}>
          <p className="citation-viewer__quote">“{c.quote}”</p>
          <div className="citation-viewer__meta">
            <span>접수일 {c.filed_at}</span>
            {c.target_period && <span>대상기간 {c.target_period}</span>}
            <span>인용검사 {c.method}</span>
            <a href={c.source_url} target="_blank" rel="noreferrer">
              공식 DART 원문
            </a>
          </div>
        </div>
      ))}
    </section>
  )
}

/**
 * @param {object} props
 * @param {object|null} props.report  CompanyReportPayload
 */
function CompanyReport({ report }) {
  if (!report) return null
  return (
    <div className="company-report">
      <Overview overview={report.overview} />
      <Disclosures disclosures={report.disclosures} />
      <MetricTrends trends={report.metric_trends} />
      <Glossary glossary={report.glossary} />
      <Citations citations={report.citations} />
      <Checkpoints checkpoints={report.checkpoints} />
      <p className="company-overview__as-of">규칙 버전: {report.generator_version}</p>
    </div>
  )
}

export default CompanyReport
