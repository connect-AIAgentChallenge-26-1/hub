// auto-merge 판정 규칙 — .github/workflows/auto-merge.yml이 import하는 순수
// 로직. GitHub API 호출 없이 GraphQL PR 노드만 받아 결정을 돌려주므로
// fixture로 단위 테스트할 수 있다 (docs/harness.md H6).
//
// H6 계약:
// - main 대상 PR만 처리한다. CI 성공 + 리뷰 승인(APPROVED)일 때만 병합한다.
// - 충돌 PR은 close하지 않고 연기 코멘트만 남긴다.
// - 연기 코멘트는 상태별 1회만.
//
// "1회만"은 label로 보장한다. 댓글 텍스트에 marker를 심어 최근 N개 댓글
// 안에서 찾는 방식은 PR이 오래 열려 있으면(댓글이 창 밖으로 밀림) 창을
// 아무리 늘려도 무한정 재발할 수 있다. label은 PR당 유일하게 존재하고
// pagination 걱정 없이 조회되므로 PR 생애 전체에서 상태를 정확히 추적한다.
//
// label은 상태 전환 시 지우지 않고 누적만 한다(staleStateLabels는 존재하지
// 않는다). 전환할 때 지우면 A→B→A처럼 같은 상태로 돌아왔을 때 label이 이미
// 사라진 상태라 "생애 전체 1회"가 깨지고 다시 코멘트가 달린다 — 이전에 있던
// 실제 결함이었다(2026-07-12 23:51 리뷰). 한 번 안내한 상태는 그 PR이 살아있는
// 동안 다시 안내하지 않는다.

export const BOT_LOGIN = 'github-actions[bot]'

export const STATE_LABEL_PREFIX = 'auto-merge:'

const marker = (key) => `<!-- ${STATE_LABEL_PREFIX}${key} -->`

const skip = (name) => ({ name, action: 'skip' })

const defer = (name, key, message) => ({
  name,
  action: 'comment',
  stateKey: key,
  stateLabel: `${STATE_LABEL_PREFIX}${key}`,
  body: `${message}\n\n${marker(key)}`,
})

const ciState = (pr) => pr.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state ?? null

/**
 * @param pr GraphQL PR node: { baseRefName, labels, reviewDecision, mergeable,
 *           commits(statusCheckRollup) }
 * @returns { name, action: 'skip'|'comment'|'merge', stateKey?, stateLabel?, body? }
 */
export function decide(pr) {
  // main으로 들어오는 PR이 병합 대상이다. 그 외 base는 이 워크플로 소관이 아니다.
  if (pr.baseRefName !== 'main') {
    return skip('main 대상이 아닌 PR → 스킵')
  }
  if (pr.labels?.nodes?.some((l) => l.name.toLowerCase() === 'review')) {
    return skip('review 라벨 → 스킵')
  }
  // reviewDecision은 저장소 리뷰 규칙 기준 집계값이라 reviews(last:1)처럼
  // 마지막 코멘트 리뷰 하나에 좌우되지 않는다.
  if (pr.reviewDecision === 'CHANGES_REQUESTED') {
    return defer(
      '변경 요청 상태 → 연기',
      'changes-requested',
      '변경 요청 중인 브랜치의 머지를 연기합니다.',
    )
  }
  if (pr.mergeable === 'CONFLICTING') {
    return defer(
      '충돌 → 연기',
      'conflicting',
      '충돌로 인해 자동 병합을 연기합니다. 충돌을 해결한 뒤 다시 시도해 주세요.',
    )
  }
  if (pr.reviewDecision !== 'APPROVED') {
    return defer(
      '미승인 → 연기',
      'not-approved',
      '리뷰 승인 대기 중이라 자동 병합을 연기합니다.',
    )
  }
  const state = ciState(pr)
  if (state !== 'SUCCESS') {
    return defer(
      'CI 미통과 → 연기',
      'ci-failing',
      `CI 상태(${state ?? 'NO_CHECKS'})가 통과하지 않아 자동 병합을 연기합니다.`,
    )
  }
  return { name: 'CI 성공 + 승인 → 머지', action: 'merge' }
}

function stateLabelNames(pr) {
  return (pr.labels?.nodes ?? [])
    .map((l) => l.name)
    .filter((name) => name.startsWith(STATE_LABEL_PREFIX))
}

/** PR이 이미 이 상태의 label을 달고 있으면(=이미 이 상태로 1회 코멘트했으면) true. */
export function hasStateLabel(pr, stateLabel) {
  return stateLabelNames(pr).includes(stateLabel)
}
