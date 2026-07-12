import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProjectIntro from './ProjectIntro'

// CLAUDE.md 절대 원칙 1: 추천 금지 — 목표가·매수·매도 지시·관망·분할매수·보류
// 같은 행동 라벨을 어떤 화면 상태에서도 출력하지 않는다.
const FORBIDDEN_PHRASES = [
  '목표가',
  '관망',
  '분할매수',
  '보류',
  '매수하세요',
  '매도하세요',
  '사세요',
  '파세요',
  '매수 추천',
  '매도 추천',
]

function assertNoForbiddenPhrases() {
  const text = document.body.textContent
  for (const phrase of FORBIDDEN_PHRASES) {
    expect(text).not.toContain(phrase)
  }
}

describe('ProjectIntro', () => {
  it('renders the headline and initial verdict example', () => {
    render(<ProjectIntro />)
    expect(
      screen.getByRole('heading', { name: '대학생 투자자를 위한 근거 검증 Agent' }),
    ).toBeInTheDocument()
    assertNoForbiddenPhrases()
  })

  it('never shows recommendation language across every claim example', async () => {
    const user = userEvent.setup()
    render(<ProjectIntro />)

    const chips = screen.getAllByRole('button', { name: /샀다/ })
    expect(chips.length).toBeGreaterThan(0)

    for (const chip of chips) {
      await user.click(chip)
      assertNoForbiddenPhrases()
    }
  })
})
