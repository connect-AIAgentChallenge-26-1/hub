// 설문 흐름(단계·응답·결과·피드백·기록)의 상태와 로직을 한 곳에 모은다.
// ProjectIntro의 props 드릴링을 막기 위해 로직만 훅으로 분리한다(과분리 금지 원칙: 화면은 저결합 step만 분리).
// 교차 상태가 큰 메타인지(useMetacognition)·서버(useServerSync)는 별도 훅이며,
// resetFlow/clear처럼 두 훅에 걸치는 초기화는 컨테이너에서 조합한다.
import { useEffect, useMemo, useRef, useState } from "react";
import { STUDY_QUESTIONS, STRESS_QUESTIONS } from "../data/questions";
import { matchMethods } from "../data/mbtiMethodMatching";
import { computeTaskStateAdjustments } from "../data/taskState";
import { buildDailySchedule, buildWeeklyPlan } from "../lib/schedule";
import { ALGORITHM_VERSION, createRecommendations } from "../lib/recommendations";
import {
  calculateMethodAffinities,
  calculatePreferenceProfile,
  calculateScores,
} from "../lib/scoring";
import {
  clearStoredData,
  loadFeedback,
  loadRecords,
  loadResult,
  loadTaskState,
  saveFeedback,
  saveRecord,
  saveResult,
  saveTaskState,
} from "../lib/storage";

const SCHEMA_VERSION = 1;
// 두 독립 신호(MBTI 매칭 + task/state)가 같은 방향을 가리킬 때도 개인 응답을 압도하지 않도록 두는 상한.
const MAX_COMBINED_ADJUSTMENT = 20;

function mergeAdjustments(...sources) {
  const merged = {};
  sources.forEach((source) => {
    Object.entries(source ?? {}).forEach(([methodId, value]) => {
      merged[methodId] = (merged[methodId] ?? 0) + value;
    });
  });
  Object.keys(merged).forEach((methodId) => {
    merged[methodId] = Math.max(-MAX_COMBINED_ADJUSTMENT, Math.min(MAX_COMBINED_ADJUSTMENT, merged[methodId]));
  });
  return merged;
}

// 응답 처리 순서와 무관하게 같은 최종 입력이면 같은 지문을 만든다.
function buildInputFingerprint({ mbti, mbtiKnown, mbtiSource, studyAnswers, stressAnswers }) {
  const study = STUDY_QUESTIONS.map((question) => `${question.id}=${studyAnswers[question.id] ?? ""}`).join("&");
  const stress = STRESS_QUESTIONS.map((question) => `${question.id}=${stressAnswers[question.id] ?? ""}`).join("&");
  return [`mbti=${mbtiKnown ? mbti : "UNKNOWN"}`, `src=${mbtiSource}`, study, stress].join("|");
}

function isCompleteAnswers(questions, answers) {
  return questions.every((question) =>
    question.options.some((option) => option.id === answers[question.id]),
  );
}

function createResultId() {
  return globalThis.crypto?.randomUUID?.() ?? `result-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function useAssessmentFlow() {
  const [storedSnapshot] = useState(() => loadResult());
  const [storedRecords] = useState(() => loadRecords());
  const [storedFeedback] = useState(() => loadFeedback());
  const [storedTaskState] = useState(() => loadTaskState());
  const [step, setStep] = useState(0);
  const [resultId, setResultId] = useState(() => storedSnapshot?.resultId ?? createResultId());
  const [mbti, setMbti] = useState(() =>
    storedSnapshot?.profile?.mbti === "UNKNOWN" ? "" : (storedSnapshot?.profile?.mbti ?? ""),
  );
  const [mbtiSource, setMbtiSource] = useState(() =>
    storedSnapshot?.profile?.mbtiSource ??
    (storedSnapshot?.profile?.mbtiKnown ? "official-self-report" : "not-provided"),
  );
  const [studyAnswers, setStudyAnswers] = useState(() => storedSnapshot?.studyAnswers ?? {});
  const [stressAnswers, setStressAnswers] = useState(() => storedSnapshot?.stressAnswers ?? {});
  const [completed, setCompleted] = useState(false);
  const [focusLevel, setFocusLevel] = useState(3);
  const [fatigueLevel, setFatigueLevel] = useState(3);
  const [records, setRecords] = useState(storedRecords);
  const [fitScore, setFitScore] = useState(0);
  const [understandingScore, setUnderstandingScore] = useState(3);
  const [actionabilityScore, setActionabilityScore] = useState(3);
  const [feedbackNote, setFeedbackNote] = useState("");
  const [feedbackCount, setFeedbackCount] = useState(storedFeedback.length);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [taskType, setTaskType] = useState(() => storedTaskState?.taskType ?? null);
  const [deadline, setDeadline] = useState(() => storedTaskState?.deadline ?? null);
  const [availableMinutes, setAvailableMinutes] = useState(() => storedTaskState?.availableMinutes ?? null);
  const mbtiKnown = mbtiSource === "official-self-report";
  // AI 간이 추정(ADR-008): 공식은 아니지만 매칭 입력으로는 신뢰해 사용한다. 라벨만 "간이 추정"으로 구분.
  const mbtiEstimated = mbtiSource === "ai-estimated";
  const useMbtiSignal = (mbtiKnown || mbtiEstimated) && Boolean(mbti);
  const hasTaskState = Boolean(taskType || deadline);

  // task/state는 resultId 수명주기와 분리된 독립 저장이라, 값이 바뀔 때마다 그대로 반영한다.
  useEffect(() => {
    if (!taskType && !deadline && availableMinutes === null) {
      return;
    }
    saveTaskState({ taskType, deadline, availableMinutes });
  }, [taskType, deadline, availableMinutes]);

  const result = useMemo(() => {
    const methodAffinities = calculateMethodAffinities(studyAnswers, stressAnswers);
    const baselineScores = calculateScores({
      mbti,
      mbtiKnown,
      studyAnswers,
      stressAnswers,
      useMbtiHints: false,
    });
    const scores = calculateScores({ mbti, mbtiKnown: useMbtiSignal, studyAnswers, stressAnswers });
    // 매칭 에이전트(a): 공식 입력 또는 AI 간이 추정(ADR-008) 시 논문 기반 매칭을 추천 신호로 반영한다.
    const match = useMbtiSignal ? matchMethods(mbti) : { temperament: null, adjustments: {}, reason: "", sources: [] };
    // task/state 에이전트: 과제유형·마감 입력 시에만 조정한다(§C-1a, [A9][F1]).
    const taskState = hasTaskState
      ? computeTaskStateAdjustments({ taskType, deadline })
      : { adjustments: {}, reason: "", sources: [] };
    // 답변만 반영한 순수 baseline(과제 입력 전과 동일 계산) — StepTaskState의 이전/이후 비교용.
    const answerOnlyBaselineResult = createRecommendations(baselineScores, methodAffinities);
    // baseline = task/state만 반영(무-MBTI) → docs 정의대로 "task/state baseline"이 된다.
    const baselineRecommendationResult = createRecommendations(
      baselineScores,
      methodAffinities,
      taskState.adjustments,
    );
    // MBTI 힌트 추가 = task/state + MBTI 매칭을 함께 반영.
    const recommendationResult = createRecommendations(
      scores,
      methodAffinities,
      mergeAdjustments(match.adjustments, taskState.adjustments),
    );
    const preferenceProfile = calculatePreferenceProfile(studyAnswers);

    return {
      baselineScores,
      answerOnlyBaselineRecommendations: answerOnlyBaselineResult.recommendations,
      baselineRecommendations: baselineRecommendationResult.recommendations,
      preferenceProfile,
      scores,
      match,
      taskState,
      schedule: buildDailySchedule(recommendationResult.recommendations, recommendationResult.routine, {
        availableMinutes,
      }),
      weeklyPlan: buildWeeklyPlan(recommendationResult.recommendations, { deadline }),
      ...recommendationResult,
    };
  }, [mbti, mbtiKnown, useMbtiSignal, studyAnswers, stressAnswers, hasTaskState, taskType, deadline, availableMinutes]);

  const canContinueStudy = isCompleteAnswers(STUDY_QUESTIONS, studyAnswers);
  const canContinueStress = isCompleteAnswers(STRESS_QUESTIONS, stressAnswers);
  const hasCompleteResult =
    (mbtiSource === "not-provided" || useMbtiSignal) && canContinueStudy && canContinueStress;

  const inputFingerprint = useMemo(
    // useMbtiSignal 을 mbtiKnown 자리에 넘겨, 추정 유형도 지문에 4글자로 반영한다(src 로 공식/추정 구분).
    () => buildInputFingerprint({ mbti, mbtiKnown: useMbtiSignal, mbtiSource, studyAnswers, stressAnswers }),
    [mbti, useMbtiSignal, mbtiSource, studyAnswers, stressAnswers],
  );

  // 완결된 입력 지문 하나당 immutable (resultId, createdAt) 하나를 유지한다.
  // 입력이 바뀌면 새 결과로 보고 새 ID/생성시각을 발급해, 이전 피드백이 바뀐 결과에 섞이지 않게 한다.
  const resultLifecycleRef = useRef({
    fingerprint: storedSnapshot?.inputFingerprint ?? null,
    resultId: storedSnapshot?.resultId ?? resultId,
    createdAt: storedSnapshot?.profile?.createdAt ?? null,
  });

  useEffect(() => {
    if (!hasCompleteResult) {
      return;
    }
    const committed = resultLifecycleRef.current;
    if (committed.fingerprint === inputFingerprint) {
      return; // 이미 저장된 동일 입력 — updatedAt만 흔들지 않는다.
    }

    let activeResultId;
    if (committed.fingerprint === null && committed.createdAt === null) {
      activeResultId = resultId; // 이 세션 첫 완성: 현재 resultId를 그대로 확정한다.
    } else {
      activeResultId = createResultId(); // 입력이 바뀐 새 결과: 새 immutable ID.
      setResultId(activeResultId);
    }
    const createdAt = new Date().toISOString();
    resultLifecycleRef.current = { fingerprint: inputFingerprint, resultId: activeResultId, createdAt };

    saveResult({
      resultId: activeResultId,
      schemaVersion: SCHEMA_VERSION,
      inputFingerprint,
      profile: {
        mbti: useMbtiSignal ? mbti : "UNKNOWN",
        mbtiKnown,
        mbtiEstimated,
        mbtiSource,
        createdAt,
      },
      studyAnswers,
      stressAnswers,
      result,
    });
  }, [hasCompleteResult, inputFingerprint, mbti, mbtiKnown, mbtiEstimated, useMbtiSignal, mbtiSource, result, resultId, stressAnswers, studyAnswers]);

  function continueWithoutOfficialMbti() {
    setMbti("");
    setMbtiSource("not-provided");
    setStep(2);
  }

  // AI 간이 추정 결과를 흐름에 반영(ADR-008). 공식 아님 — src="ai-estimated" 로 라벨 구분.
  function applyEstimatedMbti(estimatedMbti) {
    setMbti(estimatedMbti);
    setMbtiSource("ai-estimated");
    setStep(2); // 공부 설문으로 계속
  }

  function handleRecordSave() {
    const next = saveRecord({
      algorithmVersion: ALGORITHM_VERSION,
      completed,
      fatigueLevel,
      focusLevel,
      resultId,
    });
    setRecords(next);
  }

  function handleFeedbackSave() {
    if (!fitScore) {
      return;
    }

    const next = saveFeedback({
      algorithmVersion: ALGORITHM_VERSION,
      assessmentSource: mbtiSource,
      baselineTopRecommendations: result.baselineRecommendations.map((item) => item.id),
      actionabilityScore,
      fitScore,
      note: feedbackNote.trim(),
      officialMbti: mbtiKnown ? mbti : null,
      preferenceSignalCode: result.preferenceProfile.code,
      resultId,
      topRecommendations: result.recommendations.map((item) => item.id),
      understandingScore,
    });
    setFeedbackCount(next.length);
    setFeedbackNote("");
  }

  // 자신이 소유한 흐름 상태만 초기화한다(메타인지 리셋은 컨테이너에서 조합).
  function resetFlowState() {
    const freshId = createResultId();
    resultLifecycleRef.current = { fingerprint: null, resultId: freshId, createdAt: null };
    setMbti("");
    setMbtiSource("");
    setResultId(freshId);
    setStudyAnswers({});
    setStressAnswers({});
    setCompleted(false);
    setFocusLevel(3);
    setFatigueLevel(3);
    setFitScore(0);
    setUnderstandingScore(3);
    setActionabilityScore(3);
    setFeedbackNote("");
    setTaskType(null);
    setDeadline(null);
    setAvailableMinutes(null);
    setStep(1);
  }

  // localStorage와 흐름 상태를 모두 비운다(메타인지 리셋·보정카운트 0은 컨테이너에서 조합).
  function clearLocalState() {
    clearStoredData();
    const freshId = createResultId();
    resultLifecycleRef.current = { fingerprint: null, resultId: freshId, createdAt: null };
    setMbti("");
    setMbtiSource("");
    setResultId(freshId);
    setStudyAnswers({});
    setStressAnswers({});
    setCompleted(false);
    setFocusLevel(3);
    setFatigueLevel(3);
    setRecords([]);
    setFitScore(0);
    setUnderstandingScore(3);
    setActionabilityScore(3);
    setFeedbackNote("");
    setFeedbackCount(0);
    setTaskType(null);
    setDeadline(null);
    setAvailableMinutes(null);
    setStep(0);
  }

  return {
    step,
    setStep,
    resultId,
    mbti,
    setMbti,
    mbtiSource,
    setMbtiSource,
    mbtiKnown,
    mbtiEstimated,
    studyAnswers,
    setStudyAnswers,
    stressAnswers,
    setStressAnswers,
    completed,
    setCompleted,
    focusLevel,
    setFocusLevel,
    fatigueLevel,
    setFatigueLevel,
    records,
    fitScore,
    setFitScore,
    understandingScore,
    setUnderstandingScore,
    actionabilityScore,
    setActionabilityScore,
    feedbackNote,
    setFeedbackNote,
    feedbackCount,
    showAnalysis,
    setShowAnalysis,
    taskType,
    setTaskType,
    deadline,
    setDeadline,
    availableMinutes,
    setAvailableMinutes,
    hasTaskState,
    result,
    canContinueStudy,
    canContinueStress,
    hasCompleteResult,
    continueWithoutOfficialMbti,
    applyEstimatedMbti,
    handleRecordSave,
    handleFeedbackSave,
    resetFlowState,
    clearLocalState,
  };
}
