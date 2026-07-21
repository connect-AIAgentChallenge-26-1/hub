const STORAGE_KEY = "mbti-study-routine-result";
const RECORD_KEY = "mbti-study-routine-records";
const FEEDBACK_KEY = "mbti-study-routine-feedback";
// 메타인지 보정(예측→회상→대조) 결과. 수용성·실행 기록과 다른 축(학습결과)으로 분리 저장한다.
const CALIBRATION_KEY = "mbti-study-routine-recall";
// 과제(task)·상태(state) 입력(C-1a). resultId 수명주기와 무관하게 독립 저장한다.
const TASK_STATE_KEY = "mbti-study-routine-task-state";
// 하루 스케줄 생성기 필수시간 입력(#29). 새로고침해도 주간 타임테이블이 재현되도록 로컬 저장(서버 저장 아님).
const ESSENTIAL_HOURS_KEY = "mbti-study-routine-essential-hours";

function safeParse(raw, fallback) {
  if (!raw) {
    return fallback;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function saveResult(payload) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      ...payload,
      updatedAt: new Date().toISOString(),
    }),
  );
}

export function loadResult() {
  const raw = localStorage.getItem(STORAGE_KEY);
  const parsed = safeParse(raw, null);
  return parsed && typeof parsed === "object" ? parsed : null;
}

export function saveRecord(record) {
  const records = loadRecords();
  const nextRecords = [
    {
      ...record,
      date: new Date().toISOString(),
    },
    ...records,
  ].slice(0, 5);

  localStorage.setItem(RECORD_KEY, JSON.stringify(nextRecords));
  return nextRecords;
}

export function loadRecords() {
  const raw = localStorage.getItem(RECORD_KEY);
  const parsed = safeParse(raw, []);
  return Array.isArray(parsed) ? parsed : [];
}

export function saveFeedback(feedback) {
  const records = loadFeedback().filter((item) => item.resultId !== feedback.resultId);
  const nextRecords = [
    {
      ...feedback,
      createdAt: new Date().toISOString(),
    },
    ...records,
  ].slice(0, 10);

  localStorage.setItem(FEEDBACK_KEY, JSON.stringify(nextRecords));
  return nextRecords;
}

export function loadFeedback() {
  const raw = localStorage.getItem(FEEDBACK_KEY);
  const parsed = safeParse(raw, []);
  return Array.isArray(parsed) ? parsed : [];
}

export function saveCalibration(entry) {
  const records = loadCalibration().filter((item) => item.resultId !== entry.resultId);
  const nextRecords = [
    {
      ...entry,
      createdAt: new Date().toISOString(),
    },
    ...records,
  ].slice(0, 10);

  localStorage.setItem(CALIBRATION_KEY, JSON.stringify(nextRecords));
  return nextRecords;
}

export function loadCalibration() {
  const raw = localStorage.getItem(CALIBRATION_KEY);
  const parsed = safeParse(raw, []);
  return Array.isArray(parsed) ? parsed : [];
}

export function saveTaskState(taskState) {
  localStorage.setItem(TASK_STATE_KEY, JSON.stringify(taskState));
}

export function loadTaskState() {
  const raw = localStorage.getItem(TASK_STATE_KEY);
  const parsed = safeParse(raw, null);
  return parsed && typeof parsed === "object" ? parsed : null;
}

export function saveEssentialHours(hours) {
  localStorage.setItem(ESSENTIAL_HOURS_KEY, JSON.stringify(hours));
}

export function loadEssentialHours() {
  const raw = localStorage.getItem(ESSENTIAL_HOURS_KEY);
  const parsed = safeParse(raw, null);
  return parsed && typeof parsed === "object" ? parsed : null;
}

export function clearStoredData() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(RECORD_KEY);
  localStorage.removeItem(FEEDBACK_KEY);
  localStorage.removeItem(CALIBRATION_KEY);
  localStorage.removeItem(TASK_STATE_KEY);
  localStorage.removeItem(ESSENTIAL_HOURS_KEY);
}
