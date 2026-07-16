import { getDaysUntil } from "./daysUntil";
import { calculatePriorityScore, WEIGHT_PRESETS } from "./priorityCalculator";

// 서버에 우선순위 계산을 요청한다. 서버가 응답하지 않으면 로컬 계산으로 대체한다.
export async function fetchPriorityScores(subjects, weightKey) {
  try {
    const response = await fetch("/api/priority", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subjects, weightKey }),
    });

    if (!response.ok) {
      throw new Error(`서버 응답 오류: ${response.status}`);
    }

    const data = await response.json();
    return { subjects: data.subjects, source: "server" };
  } catch {
    return { subjects: scoreSubjectsLocally(subjects, weightKey), source: "local" };
  }
}

export function scoreSubjectsLocally(subjects, weightKey) {
  const weights = WEIGHT_PRESETS[weightKey] || WEIGHT_PRESETS.balanced;

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
