import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import CompanyReport from './CompanyReport'

// CLAUDE.md 절대 원칙 1 — 종목 공부 리포트도 추천·행동 지시 문구를 출력하지 않는다.
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

const REPORT = {
  corp_code: '00126380',
  as_of: '2026-07-15',
  overview: {
    corp_name: '삼성전자(주)',
    corp_name_eng: 'SAMSUNG ELECTRONICS CO,.LTD',
    stock_code: '005930',
    stock_name: '삼성전자',
    ceo_name: '전영현, 노태문',
    corp_classification: 'Y',
    corp_classification_label: '유가증권시장(코스피)',
    business_registration_no: '1248100998',
    corporate_registration_no: '1301110006246',
    address: '경기도 수원시 영통구 삼성로 129 (매탄동)',
    homepage_url: 'www.samsung.com/sec',
    ir_url: '',
    phone: '02-2255-0114',
    fax: '031-200-7538',
    industry_code: '264',
    established_date: '19690113',
    fiscal_year_end_month: '12',
    as_of: '2026-07-15',
    source_url: 'https://opendart.fss.or.kr/api/company.json?corp_code=00126380',
  },
  disclosures: [
    {
      rcept_no: '20241118000328',
      report_nm: '[기재정정]주요사항보고서(자기주식취득결정)',
      filed_at: '2024-11-18',
      report_type: 'OTHER',
      is_correction: true,
      corrected_original_rcept_no: '20241115000375',
      corrected_by_rcept_no: null,
      source_url: 'https://opendart.fss.or.kr/api/document.xml?rcept_no=20241118000328',
    },
  ],
  metric_trends: [
    {
      metric: 'OPERATING_INCOME',
      points: [
        {
          fiscal_period: '2023-ANNUAL',
          value: 6566976000000,
          unit: 'KRW',
          account_id: 'dart_OperatingIncomeLoss',
          account_name: '영업이익',
          formula: null,
          formula_version: null,
          filed_at: '2024-03-12',
          as_of: '2026-07-15',
        },
        {
          fiscal_period: '2024-ANNUAL',
          value: 32725962000000,
          unit: 'KRW',
          account_id: 'dart_OperatingIncomeLoss',
          account_name: '영업이익',
          formula: null,
          formula_version: null,
          filed_at: '2025-03-11',
          as_of: '2026-07-15',
        },
      ],
      change_reason_code: 'CONTINUED_PROFIT',
      change_pct: 398.4,
    },
  ],
  glossary: {
    definitions: [
      {
        term: '영업이익',
        definition: '매출에서 매출원가와 판매관리비 등 영업활동에 쓰인 비용을 뺀 금액입니다.',
        source: 'approved_dictionary',
        glossary_version: 's4-glossary-1.0.0',
      },
    ],
    unexplained_terms: [],
  },
  checkpoints: [
    {
      code: 'CORRECTION_PRESENT',
      message: '정정된 공시 1건이 있습니다 — 원문에서 최신 정정 내용을 확인하세요.',
      severity: 'INFO',
    },
  ],
  citations: [
    {
      evidence_id: 'rc1:0',
      quote: '삼성전자 2023년 영업이익은 6조 5,670억원이다.',
      source_url: 'https://opendart.fss.or.kr/api/document.xml?rcept_no=20240312000736',
      filed_at: '2024-03-12',
      target_period: '2023-ANNUAL',
      method: 'EXACT',
      verified: true,
    },
  ],
  generator_version: 's11-company-report-generator-1.0.0',
}

describe('CompanyReport', () => {
  it('renders company overview with official DART link and as_of', () => {
    render(<CompanyReport report={REPORT} />)
    expect(screen.getByText(/삼성전자\(주\)/)).toBeInTheDocument()
    expect(screen.getByText('유가증권시장(코스피)')).toBeInTheDocument()
    const links = screen.getAllByText('공식 DART 원문')
    expect(links[0]).toHaveAttribute(
      'href',
      'https://opendart.fss.or.kr/api/company.json?corp_code=00126380',
    )
    assertNoForbiddenPhrases()
  })

  it('shows correction badge and links original disclosure', () => {
    render(<CompanyReport report={REPORT} />)
    expect(screen.getByText('정정공시')).toBeInTheDocument()
    expect(screen.getByText(/20241115000375/)).toBeInTheDocument()
  })

  it('renders financial metric trend with formula/account/as_of and neutral change label', () => {
    render(<CompanyReport report={REPORT} />)
    expect(screen.getByText('OPERATING_INCOME')).toBeInTheDocument()
    expect(screen.getAllByText('영업이익').length).toBeGreaterThan(0)
    expect(screen.getByText(/CONTINUED_PROFIT/)).toBeInTheDocument()
    assertNoForbiddenPhrases()
  })

  it('renders glossary term definitions', () => {
    render(<CompanyReport report={REPORT} />)
    expect(screen.getByText(/매출에서 매출원가와/)).toBeInTheDocument()
  })

  it('renders checkpoints', () => {
    render(<CompanyReport report={REPORT} />)
    expect(screen.getByText(/정정된 공시 1건이 있습니다/)).toBeInTheDocument()
  })

  it('renders citation viewer with quote, source, and as_of', () => {
    render(<CompanyReport report={REPORT} />)
    expect(screen.getByText(/6조 5,670억원/)).toBeInTheDocument()
    expect(screen.getByText(/접수일 2024-03-12/)).toBeInTheDocument()
  })

  it('renders nothing when report is null', () => {
    const { container } = render(<CompanyReport report={null} />)
    expect(container.textContent).toBe('')
  })

  it('does not render provider-error data as false data', () => {
    const errorReport = { ...REPORT, overview: null, disclosures: [], metric_trends: [] }
    render(<CompanyReport report={errorReport} />)
    expect(screen.queryByText(/삼성전자\(주\)/)).not.toBeInTheDocument()
    assertNoForbiddenPhrases()
  })
})
