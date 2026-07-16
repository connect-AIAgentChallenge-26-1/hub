import { useEffect, useRef, useState } from "react";
import SubjectInputPage from "./components/SubjectInputPage";
import ResultScreen from "./components/ResultScreen";
import { WEIGHT_PRESETS, DEFAULT_WEIGHT_KEY } from "./utils/priorityCalculator";
import { fetchPriorityScores, scoreSubjectsLocally } from "./utils/priorityApi";
import "./App.css";

const SUBJECTS_STORAGE_KEY = "exam-priority:subjects";
const WEIGHT_STORAGE_KEY = "exam-priority:weight";

function loadSubjects() {
  try {
    const raw = localStorage.getItem(SUBJECTS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadWeightKey() {
  const saved = localStorage.getItem(WEIGHT_STORAGE_KEY);
  return saved && WEIGHT_PRESETS[saved] ? saved : DEFAULT_WEIGHT_KEY;
}

function App() {
  const [currentScreen, setCurrentScreen] = useState("input");
  const [subjects, setSubjects] = useState(loadSubjects);
  const [weightKey, setWeightKey] = useState(loadWeightKey);
  // 우선순위 점수는 서버에서 계산해 받는다. 초기값과 폴백은 로컬 계산을 쓴다.
  const [scoredSubjects, setScoredSubjects] = useState(() =>
    scoreSubjectsLocally(subjects, weightKey)
  );
  const nextIdRef = useRef(
    subjects.reduce((max, subject) => Math.max(max, subject.id), 0) + 1
  );

  useEffect(() => {
    localStorage.setItem(SUBJECTS_STORAGE_KEY, JSON.stringify(subjects));
  }, [subjects]);

  useEffect(() => {
    localStorage.setItem(WEIGHT_STORAGE_KEY, weightKey);
  }, [weightKey]);

  // 과목이나 성향이 바뀌면 즉시 로컬 계산으로 채우고, 서버 응답이 오면 교체한다.
  useEffect(() => {
    let ignore = false;

    setScoredSubjects(scoreSubjectsLocally(subjects, weightKey));

    fetchPriorityScores(subjects, weightKey).then((result) => {
      if (!ignore) {
        setScoredSubjects(result.subjects);
      }
    });

    return () => {
      ignore = true;
    };
  }, [subjects, weightKey]);

  function handleAddSubject(subjectInput) {
    const newSubject = { id: nextIdRef.current, ...subjectInput };
    nextIdRef.current += 1;
    setSubjects((prev) => [...prev, newSubject]);
  }

  function handleUpdateSubject(id, subjectInput) {
    setSubjects((prev) =>
      prev.map((subject) =>
        subject.id === id ? { ...subject, ...subjectInput } : subject
      )
    );
  }

  function handleRemoveSubject(id) {
    setSubjects((prev) => prev.filter((subject) => subject.id !== id));
  }

  return (
    <main className="app-container">
      <header className="app-header">
        <h1 className="app-title">시험 우선순위 계산기</h1>
        <p className="app-description">
          과목 정보를 입력하면 오늘 먼저 공부할 과목을 알려드려요.
        </p>
      </header>

      {currentScreen === "input" ? (
        <SubjectInputPage
          subjects={subjects}
          onAddSubject={handleAddSubject}
          onUpdateSubject={handleUpdateSubject}
          onRemoveSubject={handleRemoveSubject}
          onShowResult={() => setCurrentScreen("result")}
        />
      ) : (
        <ResultScreen
          subjects={scoredSubjects}
          weightKey={weightKey}
          onChangeWeight={setWeightKey}
          onBack={() => setCurrentScreen("input")}
        />
      )}
    </main>
  );
}

export default App;
