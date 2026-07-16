import { useState } from "react";
import ScoreSelector from "./ScoreSelector";
import { getDaysUntil, formatDday } from "../utils/daysUntil";

const INITIAL_FORM = {
  name: "",
  examDate: "",
  understanding: 3,
  difficulty: 3,
};

function SubjectInputPage({
  subjects,
  onAddSubject,
  onUpdateSubject,
  onRemoveSubject,
  onShowResult,
}) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [editingId, setEditingId] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  const isEditing = editingId !== null;
  const daysUntilForm = form.examDate ? getDaysUntil(form.examDate) : null;

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));

    if (errorMessage !== "") {
      setErrorMessage("");
    }
  }

  function resetForm() {
    setForm(INITIAL_FORM);
    setEditingId(null);
    setErrorMessage("");
  }

  function isDuplicateName(name) {
    const normalized = name.trim().toLowerCase();
    return subjects.some(
      (subject) =>
        subject.id !== editingId &&
        subject.name.trim().toLowerCase() === normalized
    );
  }

  function handleSubmit() {
    const name = form.name.trim();

    if (name === "") {
      setErrorMessage("과목명을 입력해 주세요.");
      return;
    }

    if (form.examDate === "") {
      setErrorMessage("시험 날짜를 선택해 주세요.");
      return;
    }

    if (isDuplicateName(name)) {
      setErrorMessage("이미 추가한 과목이에요.");
      return;
    }

    const payload = {
      name,
      examDate: form.examDate,
      understanding: form.understanding,
      difficulty: form.difficulty,
    };

    if (isEditing) {
      onUpdateSubject(editingId, payload);
    } else {
      onAddSubject(payload);
    }

    resetForm();
  }

  function handleEdit(subject) {
    setForm({
      name: subject.name,
      examDate: subject.examDate,
      understanding: subject.understanding,
      difficulty: subject.difficulty,
    });
    setEditingId(subject.id);
    setErrorMessage("");
  }

  function handleRemove(subject) {
    if (editingId === subject.id) {
      resetForm();
    }
    onRemoveSubject(subject.id);
  }

  function handleShowResult() {
    if (subjects.length === 0) {
      setErrorMessage("과목을 한 개 이상 추가해 주세요.");
      return;
    }

    onShowResult();
  }

  return (
    <section>
      <div className="card">
        <h2 className="section-title">
          {isEditing ? "과목 정보 수정" : "과목 정보 입력"}
        </h2>

        <div className="form-stack">
          <div className="form-group">
            <label className="form-label" htmlFor="subjectName">
              과목명
            </label>
            <input
              id="subjectName"
              className={`form-input${errorMessage ? " has-error" : ""}`}
              type="text"
              placeholder="예: 한방병리학"
              value={form.name}
              onChange={(event) => updateField("name", event.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="examDate">
              시험 날짜
            </label>
            <input
              id="examDate"
              className="form-input"
              type="date"
              value={form.examDate}
              onChange={(event) => updateField("examDate", event.target.value)}
            />
            {daysUntilForm !== null && (
              <p className={`form-hint${daysUntilForm < 0 ? " is-warning" : ""}`}>
                {daysUntilForm < 0
                  ? `이미 지난 날짜예요 (${formatDday(daysUntilForm)})`
                  : formatDday(daysUntilForm)}
              </p>
            )}
          </div>

          <ScoreSelector
            label="이해도"
            value={form.understanding}
            onChange={(value) => updateField("understanding", value)}
            minLabel="잘 모름"
            maxLabel="잘 앎"
          />

          <ScoreSelector
            label="난이도"
            value={form.difficulty}
            onChange={(value) => updateField("difficulty", value)}
            minLabel="쉬움"
            maxLabel="어려움"
          />

          <p className="form-error">{errorMessage}</p>

          <div className="form-actions">
            <button
              type="button"
              className="button button-secondary"
              onClick={handleSubmit}
            >
              {isEditing ? "수정 완료" : "+ 과목 추가"}
            </button>
            {isEditing && (
              <button
                type="button"
                className="button button-ghost"
                onClick={resetForm}
              >
                취소
              </button>
            )}
          </div>
        </div>
      </div>

      {subjects.length > 0 ? (
        <>
          <h3 className="subsection-title">추가된 과목 ({subjects.length})</h3>

          <ul className="entry-list">
            {subjects.map((subject) => (
              <li
                key={subject.id}
                className={`entry-item${
                  editingId === subject.id ? " is-editing" : ""
                }`}
              >
                <div className="entry-main">
                  <span className="entry-name">{subject.name}</span>
                  <span className="entry-meta">
                    {formatDday(getDaysUntil(subject.examDate))} · 이해도{" "}
                    {subject.understanding} · 난이도 {subject.difficulty}
                  </span>
                </div>
                <div className="entry-actions">
                  <button
                    type="button"
                    className="entry-action"
                    onClick={() => handleEdit(subject)}
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    className="entry-action entry-action-danger"
                    aria-label={`${subject.name} 삭제`}
                    onClick={() => handleRemove(subject)}
                  >
                    삭제
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="empty-hint">
          아직 추가된 과목이 없어요. 위에서 과목을 추가해 주세요.
        </p>
      )}

      <button
        type="button"
        className="button button-orange"
        onClick={handleShowResult}
      >
        결과 확인
      </button>
    </section>
  );
}

export default SubjectInputPage;
