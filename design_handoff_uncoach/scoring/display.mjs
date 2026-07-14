// 결(結) — 1~5점 척도의 UI 표시 매핑
//
// 기존 프로토타입은 1~3점(위험/무난/적절) 3색 체계였다. 이제 채점은 1~5점이므로
// 5단계 레벨을 정의하되, 테마 CSS 변수(--bad/--warn/--good 및 -soft)를 그대로 써서
// 테마 스와핑(소프트 블루/세이지 그린/잉크 미니멀)과 호환된다.
// 중간 단계(2,4)는 color-mix로 두 기준색을 섞어 시각적으로 구분한다.
//
// 게이지 폭 = score/5 * 100%.

export const LEVELS5 = {
  1: { label: '위험', color: 'var(--bad)',
       soft: 'var(--bad-soft)' },
  2: { label: '주의', color: 'color-mix(in srgb, var(--bad) 60%, var(--warn))',
       soft: 'color-mix(in srgb, var(--bad-soft) 60%, var(--warn-soft))' },
  3: { label: '무난', color: 'var(--warn)',
       soft: 'var(--warn-soft)' },
  4: { label: '양호', color: 'color-mix(in srgb, var(--good) 60%, var(--warn))',
       soft: 'color-mix(in srgb, var(--good-soft) 60%, var(--warn-soft))' },
  5: { label: '적절', color: 'var(--good)',
       soft: 'var(--good-soft)' },
};

// 새 축 키 ↔ 표시 메타(기존 ①②③ 위계 유지)
export const AXES = [
  { key: 'context_intent',      num: '①', name: '맥락·의도', short: '맥락', weight: 40 },
  { key: 'relation_formality',  num: '②', name: '관계·격식', short: '격식', weight: 30 },
  { key: 'strategy_expression', num: '③', name: '전략·표현', short: '전략', weight: 30 },
];

const clamp5 = n => Math.max(1, Math.min(5, Math.round(Number(n) || 1)));

export function levelOf(score) { return LEVELS5[clamp5(score)]; }

// 게이지 바 채움 비율(%). 1→20, 3→60, 5→100.
export function gaugePercent(score) { return Math.round(clamp5(score) / 5 * 100); }

// 총점(0~100)을 밴드 라벨로. 결과 카드 상단 색조에 쓴다.
export function totalBand(total) {
  if (total >= 80) return LEVELS5[5];
  if (total >= 60) return LEVELS5[4];
  if (total >= 40) return LEVELS5[3];
  if (total >= 25) return LEVELS5[2];
  return LEVELS5[1];
}

/**
 * 한 축의 결과를 렌더 재료로 변환.
 * @returns {{key,num,name,short,weight,score,pct,label,color,soft,reason,isFocus}}
 */
export function axisRow(axis, score, { reason = '', focusAxis } = {}) {
  const meta = AXES.find(a => a.key === axis) || { key: axis, num: '', name: axis, short: axis, weight: 0 };
  const s = clamp5(score);
  const lv = LEVELS5[s];
  return {
    ...meta, score: s, pct: gaugePercent(s),
    label: lv.label, color: lv.color, soft: lv.soft,
    reason, isFocus: focusAxis === axis,
  };
}

// 채점 결과(scoreDraft 반환값) → 축 행 배열(위계 순)
export function toAxisRows(result) {
  return AXES.map(a => axisRow(a.key, result.scores[a.key], {
    reason: result.reasons ? result.reasons[a.key] : '',
    focusAxis: result.focusAxis,
  }));
}
