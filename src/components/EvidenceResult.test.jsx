import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import EvidenceResult from './EvidenceResult'

// CLAUDE.md 절대 원칙 1 — 결과 화면도 추천·행동 지시 문구를 출력하지 않는다.
const FORBIDDEN_PHRASES = ['목표가', '관망', '분할매수', '보류', '매수하세요', '매도하세요']

function assertNoForbiddenPhrases() {
  const text = document.body.textContent
  for (const phrase of FORBIDDEN_PHRASES) {
    expect(text).not.toContain(phrase)
  }
}

const SUPPORTED_PAYLOAD = {
  claim_results: [
    {
      claim_id: 'c1',
      verdict: 'SUPPORTED',
      reason_code: 'MULTIPLE_COMPARISON',
      calculation: { formula: '2025Q3/2024Q3 multiple GTE 2.0', computed_value: 3.0 },
      used_evidence_ids: ['n1', 'n2'],
      missing_fields: [],
      verified_citation_ids: ['rc1:0'],
      rejected_citation_ids: [],
      citations: [
        {
          evidence_id: 'rc1:0',
          quote: '삼성전자 3분기 영업이익이 크게 증가했다.',
          source_url: 'https://opendart.fss.or.kr/api/document.xml?rcept_no=rc1',
          filed_at: '2025-11-14',
          target_period: '2025Q3',
          relation: 'SUPPORTS',
          method: 'EXACT',
          integrity_score: 1.0,
        },
      ],
      conflicts: [],
      search_attempts: [{ attempt: 1, retrieved: 1, counter: 0, conflicts: 0, coverage_met: true }],
      confidence_basis: '수치 검산 기반 확정',
    },
  ],
  group_results: { c1: 'SUPPORTED' },
  evidence_plans: { c1: ['current_period_value', 'comparison_period_value'] },
  search_logs: { c1: ['query=...'] },
  checklist: [],
  orchestrator_version: 's8-evidence-orchestrator-1.0.0',
}

describe('EvidenceResult', () => {
  it('renders 5-state verdict badge, calculation, citation with source and as_of', () => {
    render(<EvidenceResult payload={SUPPORTED_PAYLOAD} />)
    // 주장 카드와 그룹 배지 양쪽에 나타나므로 카드 영역으로 좁혀서 확인한다.
    const card = screen.getByLabelText('판정 c1')
    expect(card.textContent).toContain('지지됨')
    expect(screen.getByLabelText('계산식').textContent).toContain('multiple')
    expect(screen.getByText(/기준일 2025-11-14/)).toBeInTheDocument()
    const link = screen.getByText('원문 보기')
    expect(link).toHaveAttribute(
      'href',
      'https://opendart.fss.or.kr/api/document.xml?rcept_no=rc1',
    )
    expect(screen.getByText(/s8-evidence-orchestrator-1.0.0/)).toBeInTheDocument()
    assertNoForbiddenPhrases()
  })

  it('shows provider fault distinctly from "no data"', () => {
    render(<EvidenceResult error={{ status: 'EXTERNAL_ERROR', reason_code: 'PROVIDER_RATE_LIMITED' }} />)
    expect(screen.getByRole('alert').textContent).toContain('외부 데이터 제공자 장애')
    expect(screen.getByText(/PROVIDER_RATE_LIMITED/)).toBeInTheDocument()
  })

  it('does not render an opinion or missing-evidence claim as false', () => {
    const payload = {
      ...SUPPORTED_PAYLOAD,
      claim_results: [
        {
          claim_id: 'op1',
          verdict: 'UNVERIFIABLE',
          reason_code: 'OPINION_OR_PREDICTION',
          calculation: null,
          used_evidence_ids: [],
          missing_fields: [],
          verified_citation_ids: [],
          rejected_citation_ids: [],
          citations: [],
          conflicts: [],
          search_attempts: [],
          confidence_basis: '',
        },
      ],
      group_results: { op1: 'UNVERIFIABLE' },
      checklist: [
        { item: '판정: UNVERIFIABLE', related_claim_ids: ['op1'], status: 'CANNOT_VERIFY', source_links: [] },
      ],
    }
    render(<EvidenceResult payload={payload} />)
    // 의견/검증불가는 "검증 불가"로 표시되고 "반증됨"(거짓)으로 표시되지 않는다.
    expect(screen.getAllByText('검증 불가').length).toBeGreaterThan(0)
    expect(screen.queryByText('반증됨')).not.toBeInTheDocument()
  })

  it('surfaces conflicts and the review checklist item', () => {
    const payload = {
      ...SUPPORTED_PAYLOAD,
      claim_results: [
        {
          ...SUPPORTED_PAYLOAD.claim_results[0],
          conflicts: [{ supporting: 'rc1:0', refuting: 'rc2:0', reason: '공존' }],
          confidence_basis: '확정 판정과 함께 상충 근거 1건 감지',
        },
      ],
      checklist: [
        { item: '지지 근거와 반증 근거가 함께 발견됨', related_claim_ids: ['c1'], status: 'REVIEW_CONFLICT', source_links: [] },
      ],
    }
    render(<EvidenceResult payload={payload} />)
    expect(screen.getByRole('note').textContent).toContain('반증 근거가 함께 발견')
    expect(screen.getByText(/함께 발견됨/)).toBeInTheDocument()
    assertNoForbiddenPhrases()
  })
})
