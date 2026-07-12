import { describe, expect, it } from 'vitest'
import { decide, hasStateLabel, staleStateLabels } from './auto-merge-rules.js'

// GraphQL PR 노드 fixture — 기본값은 "main 대상 · 승인 · CI 성공"의 병합 가능 PR.
function pr(overrides = {}) {
  return {
    number: 1,
    baseRefName: 'main',
    labels: { nodes: [] },
    reviewDecision: 'APPROVED',
    mergeable: 'MERGEABLE',
    commits: { nodes: [{ commit: { statusCheckRollup: { state: 'SUCCESS' } } }] },
    ...overrides,
  }
}

describe('decide', () => {
  it('merges a main-targeted PR that is approved with passing CI (H6 기본 경로)', () => {
    expect(decide(pr())).toEqual({ name: 'CI 성공 + 승인 → 머지', action: 'merge' })
  })

  it('skips PRs whose base is not main — main 대상 PR이 병합 경로에 도달해야 한다', () => {
    const decision = decide(pr({ baseRefName: 'feature/x' }))
    expect(decision.action).toBe('skip')
    // 회귀 방지: main 대상 PR은 절대 스킵되지 않는다 (기존 결함은 정반대였다).
    expect(decide(pr()).action).not.toBe('skip')
  })

  it('skips PRs carrying the review label', () => {
    const decision = decide(pr({ labels: { nodes: [{ name: 'Review' }] } }))
    expect(decision.action).toBe('skip')
  })

  it('defers with a state label when changes are requested', () => {
    const decision = decide(pr({ reviewDecision: 'CHANGES_REQUESTED' }))
    expect(decision.action).toBe('comment')
    expect(decision.stateLabel).toBe('auto-merge:changes-requested')
    expect(decision.body).toContain('변경 요청')
  })

  it('defers a conflicting PR instead of closing it', () => {
    const decision = decide(pr({ mergeable: 'CONFLICTING' }))
    expect(decision.action).toBe('comment')
    expect(decision.stateLabel).toBe('auto-merge:conflicting')
    expect(decision.body).toContain('충돌')
  })

  it('defers when review is not yet approved (REVIEW_REQUIRED or null)', () => {
    for (const reviewDecision of ['REVIEW_REQUIRED', null]) {
      const decision = decide(pr({ reviewDecision }))
      expect(decision.action).toBe('comment')
      expect(decision.stateLabel).toBe('auto-merge:not-approved')
    }
  })

  it('defers when CI is failing or absent, naming the state', () => {
    const failing = decide(
      pr({ commits: { nodes: [{ commit: { statusCheckRollup: { state: 'FAILURE' } } }] } }),
    )
    expect(failing.action).toBe('comment')
    expect(failing.body).toContain('CI 상태(FAILURE)')

    const noChecks = decide(pr({ commits: { nodes: [{ commit: { statusCheckRollup: null } }] } }))
    expect(noChecks.action).toBe('comment')
    expect(noChecks.body).toContain('CI 상태(NO_CHECKS)')
    expect(noChecks.stateLabel).toBe('auto-merge:ci-failing')
  })

  it('checks approval before CI so an unapproved PR with failing CI gets the approval label', () => {
    const decision = decide(
      pr({
        reviewDecision: null,
        commits: { nodes: [{ commit: { statusCheckRollup: { state: 'FAILURE' } } }] },
      }),
    )
    expect(decision.stateLabel).toBe('auto-merge:not-approved')
  })
})

describe('hasStateLabel / staleStateLabels', () => {
  it('detects an existing state label regardless of comment history depth', () => {
    // label 기반이므로 댓글이 아무리 많이 쌓여도(과거 100개 창 한계와 무관하게)
    // "이미 이 상태로 코멘트했다"를 정확히 알 수 있다.
    const withLabel = pr({ labels: { nodes: [{ name: 'auto-merge:not-approved' }] } })
    expect(hasStateLabel(withLabel, 'auto-merge:not-approved')).toBe(true)
    expect(hasStateLabel(withLabel, 'auto-merge:ci-failing')).toBe(false)
  })

  it('returns false when no auto-merge state label is present', () => {
    expect(hasStateLabel(pr(), 'auto-merge:not-approved')).toBe(false)
  })

  it('does not confuse the review label with an auto-merge state label', () => {
    const withReviewLabel = pr({ labels: { nodes: [{ name: 'review' }] } })
    expect(hasStateLabel(withReviewLabel, 'auto-merge:not-approved')).toBe(false)
    expect(staleStateLabels(withReviewLabel, 'auto-merge:not-approved')).toEqual([])
  })

  it('lists stale auto-merge labels to remove when the state transitions', () => {
    const staleLabeled = pr({
      labels: { nodes: [{ name: 'auto-merge:ci-failing' }, { name: 'review' }] },
    })
    expect(staleStateLabels(staleLabeled, 'auto-merge:not-approved')).toEqual([
      'auto-merge:ci-failing',
    ])
  })

  it('reports no stale labels when the PR already carries the current state label', () => {
    const current = pr({ labels: { nodes: [{ name: 'auto-merge:not-approved' }] } })
    expect(staleStateLabels(current, 'auto-merge:not-approved')).toEqual([])
  })
})
