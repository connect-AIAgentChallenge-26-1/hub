// 우선순위 성향 프리셋. 클라이언트의 priorityCalculator.js와 값을 맞춘다.
export const WEIGHT_PRESETS = {
  balanced: { understanding: 0.4, difficulty: 0.3, urgency: 0.3 },
  difficulty: { understanding: 0.3, difficulty: 0.5, urgency: 0.2 },
  urgency: { understanding: 0.3, difficulty: 0.2, urgency: 0.5 },
};

export const DEFAULT_WEIGHT_KEY = "balanced";

// 시험이 이 일수 이상 남으면 급함 점수는 0으로 본다.
const URGENCY_HORIZON = 30;

export function getDaysUntil(examDate, today = new Date()) {
  if (!examDate) {
    return null;
  }

  const target = new Date(`${examDate}T00:00:00`);
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffMs = target.getTime() - base.getTime();

  return Math.round(diffMs / (1000 * 60 * 60 * 24));
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

export function calculatePriorityScore({ understanding, difficulty, daysUntil }, weights) {
  const understandingScore = ((5 - understanding) / 4) * 100;
  const difficultyScore = ((difficulty - 1) / 4) * 100;
  const urgencyScore = calculateUrgencyScore(daysUntil);

  const score =
    understandingScore * weights.understanding +
    difficultyScore * weights.difficulty +
    urgencyScore * weights.urgency;

  return Math.round(score);
}

// 과목 목록에 우선순위 점수를 채워 돌려준다.
export function scoreSubjects(subjects, weightKey) {
  const weights = WEIGHT_PRESETS[weightKey] || WEIGHT_PRESETS[DEFAULT_WEIGHT_KEY];

  return subjects.map((subject) => ({
    ...subject,
    priorityScore: calculatePriorityScore(
      {
        understanding: subject.understanding,
        difficulty: subject.difficulty,
        daysUntil: getDaysUntil(subject.examDate),
      },
      weights
    ),
  }));
}
