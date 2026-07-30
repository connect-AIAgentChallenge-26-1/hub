// Reused verbatim from gameforge-agent-prototype.html's analysis report mock
// (128 / 14 / 6) — kept as one consistent pair so the stat tiles and the
// report body never contradict each other on a demo recording.
export const MOCK_ANALYSIS_STATS = {
  dependencyCount: 128,
  duplicateCount: 14,
  refactorTargetCount: 6,
};

export const MOCK_ANALYSIS_REPORT = `# Analysis Report

> 본 리포트는 정적 분석 기반 추정치이며, 완전한 컴파일 분석은 아닙니다.

## 통계 요약
- 클래스 의존성 수: 128
- 중복 코드 블록 수: 14
- 리팩토링 대상 수: 6

## 상세 목록

### 중복 코드 블록
- PlayerController.Move()와 EnemyController.Move()가 거의 동일한 이동 처리 로직을 중복 구현하고 있습니다.
- InventoryUI.Refresh()가 3곳에서 거의 동일하게 반복 구현되어 있습니다.

### 리팩토링 대상
- GameManager — God Class 의심, 메서드 42개 (기준 초과)
- SaveSystem — UI와 지나치게 강하게 결합되어 있어 책임 분리가 필요합니다.`;
