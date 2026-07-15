import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ClaimDisclosure from './ClaimDisclosure'

// CLAUDE.md 절대 원칙 1 — 이 컴포넌트도 다른 화면과 동일하게 추천·행동 지시
// 문구를 출력하지 않아야 한다.
const FORBIDDEN_PHRASES = ['목표가', '관망', '분할매수', '보류', '매수하세요', '매도하세요']

function assertNoForbiddenPhrases() {
  const text = document.body.textContent
  for (const phrase of FORBIDDEN_PHRASES) {
    expect(text).not.toContain(phrase)
  }
}

const AUTO_CLAIM = {
  claim_id: 'c1',
  original_span: '영업이익이 2배 이상 늘었다',
  ambiguity_flags: [],
}

const AMBIGUOUS_CLAIM = {
  claim_id: 'c2',
  original_span: '실적이 좋아졌다',
  ambiguity_flags: ['comparison_period_unclear'],
}

describe('ClaimDisclosure', () => {
  it('renders a claim without ambiguity_flags as an auto-summary card with no question', () => {
    render(<ClaimDisclosure claims={[AUTO_CLAIM]} />)
    expect(screen.getByText(AUTO_CLAIM.original_span)).toBeInTheDocument()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    assertNoForbiddenPhrases()
  })

  it('renders a claim with ambiguity_flags as a confirm question with radio options', () => {
    render(<ClaimDisclosure claims={[AMBIGUOUS_CLAIM]} />)
    expect(screen.getByText('비교 기간이 맞는지 확인해주세요.')).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(2)
    assertNoForbiddenPhrases()
  })

  it('falls back to a generic label for an unrecognized ambiguity flag', () => {
    const claim = { ...AMBIGUOUS_CLAIM, ambiguity_flags: ['some_new_flag'] }
    render(<ClaimDisclosure claims={[claim]} />)
    expect(screen.getByText('"some_new_flag" 항목을 확인해주세요.')).toBeInTheDocument()
  })

  it('shows a hint that an unanswered ambiguous claim stays unverifiable', () => {
    render(<ClaimDisclosure claims={[AMBIGUOUS_CLAIM]} />)
    expect(screen.getByRole('status')).toHaveTextContent('확인 필요(검증 불가)')
  })

  it('answering "맞습니다" reports the claim as resolved via onResolutionChange', async () => {
    const user = userEvent.setup()
    const onResolutionChange = vi.fn()
    render(<ClaimDisclosure claims={[AMBIGUOUS_CLAIM]} onResolutionChange={onResolutionChange} />)

    await user.click(screen.getByRole('radio', { name: '맞습니다' }))

    expect(onResolutionChange).toHaveBeenCalledWith(new Set(['c2']))
  })

  it('answering "아니요" keeps the claim out of the resolved set', async () => {
    const user = userEvent.setup()
    const onResolutionChange = vi.fn()
    render(<ClaimDisclosure claims={[AMBIGUOUS_CLAIM]} onResolutionChange={onResolutionChange} />)

    await user.click(screen.getByRole('radio', { name: /아니요/ }))

    expect(onResolutionChange).toHaveBeenCalledWith(new Set())
  })

  it('classifies a mixed batch independently and never shows recommendation language', async () => {
    const user = userEvent.setup()
    render(<ClaimDisclosure claims={[AUTO_CLAIM, AMBIGUOUS_CLAIM]} />)

    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    const radios = screen.getAllByRole('radio')
    await user.click(radios[0])
    assertNoForbiddenPhrases()
  })
})
