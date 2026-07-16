import { useState } from "react";
import PriorityBadge from "./PriorityBadge";
import WeightSelector from "./WeightSelector";
import ScoreBreakdown from "./ScoreBreakdown";
import { getDaysUntil, formatDday } from "../utils/daysUntil";
import { buildPriorityReason } from "../utils/priorityReason";

const THIS_WEEK_DAYS = 7;

function ResultScreen({ subjects, weightKey, onChangeWeight, onBack }) {
  const [sortKey, setSortKey] = useState("score");
  const [onlyThisWeek, setOnlyThisWeek] = useState(false);

  const filteredSubjects = onlyThisWeek
    ? subjects.filter((subject) => {
        const daysUntil = getDaysUntil(subject.examDate);
        return daysUntil !== null && daysUntil <= THIS_WEEK_DAYS;
      })
    : subjects;

  const rankedSubjects = [...filteredSubjects].sort((a, b) => {
    if (sortKey === "dday") {
      return getDaysUntil(a.examDate) - getDaysUntil(b.examDate);
    }
    return b.priorityScore - a.priorityScore;
  });

  // 추천 과목은 필터와 무관하게 항상 점수 1위 과목으로 고른다.
  const recommendedSubject = [...subjects].sort(
    (a, b) => b.priorityScore - a.priorityScore
  )[0];

  return (
    <section>
      {recommendedSubject ? (
        <div className="recommend-card">
          <p className="recommend-eyebrow">오늘의 추천 과목</p>
          <h2 className="recommend-name">{recommendedSubject.name}</h2>
          <p className="recommend-score">
            우선순위 점수 {recommendedSubject.priorityScore}점 ·{" "}
            {formatDday(getDaysUntil(recommendedSubject.examDate))}
          </p>
          <p className="recommend-reason">
            {buildPriorityReason(recommendedSubject)}
          </p>
        </div>
      ) : (
        <div className="empty-state">
          <p>등록된 과목이 없어요. 과목을 추가하고 다시 확인해 주세요.</p>
        </div>
      )}

      <WeightSelector value={weightKey} onChange={onChangeWeight} />

      <div className="result-toolbar">
        <div className="sort-toggle" role="group" aria-label="정렬 기준">
          <button
            type="button"
            className={`chip${sortKey === "score" ? " is-selected" : ""}`}
            onClick={() => setSortKey("score")}
          >
            점수순
          </button>
          <button
            type="button"
            className={`chip${sortKey === "dday" ? " is-selected" : ""}`}
            onClick={() => setSortKey("dday")}
          >
            D-day순
          </button>
        </div>

        <label className="filter-check">
          <input
            type="checkbox"
            checked={onlyThisWeek}
            onChange={(event) => setOnlyThisWeek(event.target.checked)}
          />
          이번 주 시험만
        </label>
      </div>

      <h3 className="subsection-title">등록된 과목</h3>

      {rankedSubjects.length > 0 ? (
        <ul className="subject-list">
          {rankedSubjects.map((subject, index) => (
            <li key={subject.id} className="subject-item">
              <div className="subject-row">
                <span className="subject-rank">{index + 1}</span>
                <div className="subject-main">
                  <span className="subject-name">{subject.name}</span>
                  <span className="subject-meta">
                    {formatDday(getDaysUntil(subject.examDate))} · 이해도{" "}
                    {subject.understanding} · 난이도 {subject.difficulty}
                  </span>
                </div>
                <PriorityBadge priorityScore={subject.priorityScore} />
                <span className="subject-score">{subject.priorityScore}점</span>
              </div>
              <ScoreBreakdown subject={subject} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-hint">이번 주에 시험이 있는 과목이 없어요.</p>
      )}

      <button type="button" className="button button-secondary" onClick={onBack}>
        다시 입력하기
      </button>
    </section>
  );
}

export default ResultScreen;
