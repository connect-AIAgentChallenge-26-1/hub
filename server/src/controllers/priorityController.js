import { scoreSubjects, WEIGHT_PRESETS, DEFAULT_WEIGHT_KEY } from "../services/priorityService.js";

function isValidSubject(subject) {
  return (
    subject &&
    typeof subject.understanding === "number" &&
    typeof subject.difficulty === "number"
  );
}

export function postPriority(req, res) {
  const { subjects, weightKey } = req.body || {};

  if (!Array.isArray(subjects)) {
    return res.status(400).json({ error: "subjects 배열이 필요합니다." });
  }

  if (!subjects.every(isValidSubject)) {
    return res.status(400).json({
      error: "각 과목에는 숫자형 understanding, difficulty 값이 필요합니다.",
    });
  }

  const resolvedWeightKey = WEIGHT_PRESETS[weightKey] ? weightKey : DEFAULT_WEIGHT_KEY;
  const scored = scoreSubjects(subjects, resolvedWeightKey);

  return res.json({ subjects: scored, weightKey: resolvedWeightKey });
}
