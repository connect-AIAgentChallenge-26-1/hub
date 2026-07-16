import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import ValuationReport from './ValuationReport'

// CLAUDE.md 절대 원칙 1 — 가치 범위·가격 위치 화면도 추천·행동 지시 문구를
// 출력하지 않는다. 단일 목표가도 만들지 않는다(docs/skills.md S5·S6 제약).
const FORBIDDEN_PHRASES = [
  '목표가',
  '관망',
  '분할매수',
  '보류',
  '매수',
  '매도',
  '고평가',
  '저평가',
]

function assertNoForbiddenPhrases() {
  const text = document.body.textContent
  for (const phrase of FORBIDDEN_PHRASES) {
    expect(text).not.toContain(phrase)
  }
}

// 실제 2026-07-15 라이브 데이터(삼성전자 대상 + SK하이닉스·DB하이텍·삼성전기 peer)
const REPORT = {
  target_corp_code: '00126380',
  as_of: '2026-07-15',
  target_profile: {
    corp_code: '00126380',
    corp_name: '삼성전자(주)',
    stock_code: '005930',
    industry_code: '264',
    eps: 5892.87,
    bps: 68794.54,
    per: 44.55,
    pbr: 3.82,
    roe: 0.0857,
    price: 262500,
    price_as_of: '2026-07-15',
    financial_as_of: '2025-03-11',
  },
  peer: {
    peer_universe: [
      { corp_code: '00164779', corp_name: 'SK하이닉스', stock_code: '000660', industry_code: '2612', eps: 27777.24, bps: 103711.88, per: 74.95, pbr: 20.07, roe: 0.2678, price: 2082000, price_as_of: '2026-07-15', financial_as_of: '2025-03-11' },
      { corp_code: '00160843', corp_name: 'DB하이텍', stock_code: '000990', industry_code: '2611', eps: 5272.68, bps: 45987.99, per: 22.91, pbr: 2.63, roe: 0.1147, price: 120800, price_as_of: '2026-07-15', financial_as_of: '2025-03-11' },
      { corp_code: '00126371', corp_name: '삼성전기(주)', stock_code: '009150', industry_code: '2622', eps: 9414.66, bps: 120704.35, per: 150.09, pbr: 11.71, roe: 0.078, price: 1413000, price_as_of: '2026-07-15', financial_as_of: '2025-03-11' },
    ],
    exclusions: [],
    statistics: {
      sample_size: 3, per_median: 74.95, per_p25: 48.93, per_p75: 112.52,
      pbr_median: 11.71, pbr_p25: 7.17, pbr_p75: 15.89, roe_median: 0.1147,
    },
    quality_score: 1.0,
    sufficient: true,
    rule_version: 's21-peer-universe-1.0.0',
  },
  valuation: {
    value_ranges: [
      { method: 'PER_RELATIVE', formula: 'target.EPS × peer PER(P25/중앙값/P75)', formula_version: 's5-valuation-scenarios-1.0.0', low: 288349.84, mid: 441690.89, high: 663061.34, assumptions: 'peer PER 분포(n=3) 기반', sensitivity_note: 'peer PER가 P25→P75로 변할 때 비례 변동' },
      { method: 'PBR_RELATIVE', formula: 'target.BPS × peer PBR(P25/중앙값/P75)', formula_version: 's5-valuation-scenarios-1.0.0', low: 493018.21, mid: 805328.81, high: 1093184.32, assumptions: 'peer PBR 분포(n=3) 기반', sensitivity_note: 'peer PBR이 P25→P75로 변할 때 비례 변동' },
      { method: 'ROE_ADJUSTED_PBR_RELATIVE', formula: 'target.BPS × peer PBR × (target ROE/peer ROE)', formula_version: 's5-valuation-scenarios-1.0.0', low: 368339.73, mid: 601670.66, high: 816730.91, assumptions: '단순화된 ROE 조정', sensitivity_note: 'peer PBR과 ROE 비율 두 축' },
    ],
    data_quality: 'SUFFICIENT',
    rule_version: 's5-valuation-scenarios-1.0.0',
  },
  price_position: {
    price: 262500,
    overall_position: 'BELOW_MODEL_RANGE',
    method_positions: [
      { method: 'PER_RELATIVE', position: 'BELOW_MODEL_RANGE', distance_pct: 8.96 },
      { method: 'PBR_RELATIVE', position: 'BELOW_MODEL_RANGE', distance_pct: 46.76 },
      { method: 'ROE_ADJUSTED_PBR_RELATIVE', position: 'BELOW_MODEL_RANGE', distance_pct: 28.73 },
    ],
    sensitivity: '방법별 결합 범위 [288350, 1093184]',
    assumptions: '종합 위치는 방법별 범위의 최솟값~최댓값을 합쳐 판단(보수적 결합)',
    rule_version: 's6-price-position-1.0.0',
  },
  checkpoints: [],
  generator_version: 'b-valuation-report-generator-1.0.0',
}

describe('ValuationReport', () => {
  it('renders target overview with EPS/BPS/PER/PBR and as_of', () => {
    render(<ValuationReport report={REPORT} />)
    expect(screen.getByText('삼성전자(주)')).toBeInTheDocument()
    expect(screen.getByText('262,500원')).toBeInTheDocument()
    expect(screen.getByText('44.55')).toBeInTheDocument()
    assertNoForbiddenPhrases()
  })

  it('renders peer universe with disclosed exclusions and statistics', () => {
    render(<ValuationReport report={REPORT} />)
    expect(screen.getByText(/비교군 \(3개\)/)).toBeInTheDocument()
    expect(screen.getByText(/SK하이닉스/)).toBeInTheDocument()
    expect(screen.getByText(/중앙값 PER 74.95/)).toBeInTheDocument()
  })

  it('renders three distinct value range methods, never a single price', () => {
    render(<ValuationReport report={REPORT} />)
    const section = screen.getByLabelText('가치 범위')
    expect(section.textContent).toContain('PER_RELATIVE')
    expect(section.textContent).toContain('PBR_RELATIVE')
    expect(section.textContent).toContain('ROE_ADJUSTED_PBR_RELATIVE')
    expect(screen.getByText(/288,349.84 ~ 441,690.89 ~ 663,061.34/)).toBeInTheDocument()
    assertNoForbiddenPhrases()
  })

  it('renders price position with neutral BELOW/WITHIN/ABOVE label, no action words', () => {
    render(<ValuationReport report={REPORT} />)
    expect(screen.getAllByText('범위 하단 아래').length).toBeGreaterThan(0)
    assertNoForbiddenPhrases()
  })

  it('shows INSUFFICIENT position distinctly when peers are insufficient', () => {
    const insufficientReport = {
      ...REPORT,
      peer: { ...REPORT.peer, peer_universe: REPORT.peer.peer_universe.slice(0, 1), sufficient: false },
      valuation: { value_ranges: [], data_quality: 'INSUFFICIENT_PEERS', rule_version: 's5-valuation-scenarios-1.0.0' },
      price_position: { price: 262500, overall_position: 'INSUFFICIENT', method_positions: [], sensitivity: '', assumptions: 'data_quality=INSUFFICIENT_PEERS', rule_version: 's6-price-position-1.0.0' },
      checkpoints: [{ code: 'INSUFFICIENT_PEERS', message: '비교 가능한 peer가 부족해 비교 Claim은 검증 불가입니다.', severity: 'WARNING' }],
    }
    render(<ValuationReport report={insufficientReport} />)
    expect(screen.getByText('검증 불가')).toBeInTheDocument()
    expect(screen.getByText(/표본 부족/)).toBeInTheDocument()
    assertNoForbiddenPhrases()
  })

  it('renders provider-fault checkpoint distinctly, not as false data', () => {
    const errorReport = {
      ...REPORT,
      target_profile: null,
      peer: null,
      valuation: null,
      price_position: null,
      checkpoints: [
        { code: 'TARGET_DATA_UNAVAILABLE', message: '대상 기업의 시세·재무 데이터를 확보하지 못했습니다.', severity: 'ERROR' },
      ],
    }
    render(<ValuationReport report={errorReport} />)
    expect(screen.queryByText('삼성전자(주)')).not.toBeInTheDocument()
    expect(screen.getByText(/데이터를 확보하지 못했습니다/)).toBeInTheDocument()
  })

  it('renders nothing when report is null', () => {
    const { container } = render(<ValuationReport report={null} />)
    expect(container.textContent).toBe('')
  })
})
