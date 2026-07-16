import { getDaysUntil } from "../utils/daysUntil";
import { getScoreBreakdown } from "../utils/priorityCalculator";

const FACTORS = [
  { key: "understanding", label: "이해도", modifier: "understanding" },
  { key: "difficulty", label: "난이도", modifier: "difficulty" },
  { key: "urgency", label: "급함", modifier: "urgency" },
];

function ScoreBreakdown({ subject }) {
  const breakdown = getScoreBreakdown({
    understanding: subject.understanding,
    difficulty: subject.difficulty,
    daysUntil: getDaysUntil(subject.examDate),
  });

  return (
    <div className="score-breakdown">
      {FACTORS.map((factor) => (
        <div key={factor.key} className="breakdown-row">
          <span className="breakdown-label">{factor.label}</span>
          <span className="breakdown-track">
            <span
              className={`breakdown-fill breakdown-fill-${factor.modifier}`}
              style={{ width: `${Math.round(breakdown[factor.key])}%` }}
            />
          </span>
        </div>
      ))}
    </div>
  );
}

export default ScoreBreakdown;
