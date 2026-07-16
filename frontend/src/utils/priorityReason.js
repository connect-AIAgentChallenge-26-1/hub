import { getDaysUntil } from "./daysUntil";
import { getScoreBreakdown } from "./priorityCalculator";

// 우선순위 점수의 근거를 한 문장으로 만든다.
export function buildPriorityReason(subject) {
  const daysUntil = getDaysUntil(subject.examDate);
  const breakdown = getScoreBreakdown({
    understanding: subject.understanding,
    difficulty: subject.difficulty,
    daysUntil,
  });

  const parts = [];

  if (breakdown.understanding >= 75) {
    parts.push("아직 이해도가 낮고");
  } else if (breakdown.understanding >= 50) {
    parts.push("이해도가 아직 부족하고");
  }

  if (breakdown.difficulty >= 75) {
    parts.push("난이도가 높으며");
  } else if (breakdown.difficulty >= 50) {
    parts.push("난이도가 있는 편이고");
  }

  if (daysUntil !== null) {
    if (daysUntil <= 0) {
      parts.push("시험이 이미 시작됐어요");
    } else if (daysUntil <= 7) {
      parts.push(`시험이 ${daysUntil}일밖에 안 남았어요`);
    } else if (daysUntil <= 14) {
      parts.push("시험이 얼마 안 남았어요");
    }
  }

  if (parts.length === 0) {
    return "여유가 있는 편이니 다른 과목을 먼저 챙겨도 좋아요.";
  }

  return `${parts.join(" ")}.`;
}
