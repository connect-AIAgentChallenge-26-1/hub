// 우선순위 성향 프리셋. 사용자가 결과 화면에서 선택할 수 있다.
export const WEIGHT_PRESETS = {
  balanced: {
    key: "balanced",
    label: "균형",
    understanding: 0.4,
    difficulty: 0.3,
    urgency: 0.3,
  },
  difficulty: {
    key: "difficulty",
    label: "난이도 중시",
    understanding: 0.3,
    difficulty: 0.5,
    urgency: 0.2,
  },
  urgency: {
    key: "urgency",
    label: "임박도 중시",
    understanding: 0.3,
    difficulty: 0.2,
    urgency: 0.5,
  },
};

export const DEFAULT_WEIGHT_KEY = "balanced";

// 시험이 이 일수 이상 남으면 급함 점수는 0으로 본다.
const URGENCY_HORIZON = 30;

// 이해도 / 난이도 / 급함을 각각 0~100 점수로 분해한다.
export function getScoreBreakdown({ understanding, difficulty, daysUntil }) {
  return {
    // 이해도가 낮을수록 먼저 공부해야 하므로 점수를 높인다. (1 -> 100, 5 -> 0)
    understanding: ((5 - understanding) / 4) * 100,
    // 난이도가 높을수록 우선순위를 높인다. (1 -> 0, 5 -> 100)
    difficulty: ((difficulty - 1) / 4) * 100,
    urgency: calculateUrgencyScore(daysUntil),
  };
}

export function calculatePriorityScore(input, weights = WEIGHT_PRESETS.balanced) {
  const breakdown = getScoreBreakdown(input);

  const score =
    breakdown.understanding * weights.understanding +
    breakdown.difficulty * weights.difficulty +
    breakdown.urgency * weights.urgency;

  return Math.round(score);
}

function calculateUrgencyScore(daysUntil) {
  if (daysUntil === null || daysUntil >= URGENCY_HORIZON) {
    return 0;
  }

  if (daysUntil <= 0) {
    return 100;
  }

  return ((URGENCY_HORIZON - daysUntil) / URGENCY_HORIZON) * 100;
}
