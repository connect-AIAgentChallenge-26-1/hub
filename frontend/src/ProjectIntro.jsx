import { useEffect, useState } from "react";
import { SCORE_LABELS, STUDY_QUESTIONS, STRESS_QUESTIONS } from "./data/questions";
import { buildDayPlan, buildWeeklyTimetable } from "./lib/schedule";
import { loadEssentialHours, saveEssentialHours } from "./lib/storage";
import AnalysisReport from "./components/AnalysisReport";
import { ConsentNotice } from "./components/ConsentNotice";
import { OptionCard, Progress, ScoreBar } from "./components/ui";
import { StepIntro } from "./components/steps/StepIntro";
import { StepMbtiSource } from "./components/steps/StepMbtiSource";
import { StepMbtiChat } from "./components/steps/StepMbtiChat";
import { StepSurvey } from "./components/steps/StepSurvey";
import { StepTaskState } from "./components/steps/StepTaskState";
import "./styles/app.css";
import { ALGORITHM_VERSION } from "./lib/recommendations";
import { useAssessmentFlow } from "./hooks/useAssessmentFlow";
import { RECALL_TARGET, useMetacognition } from "./hooks/useMetacognition";
import { useServerSync } from "./hooks/useServerSync";
import { getSelectedOptionLabels } from "./lib/scoring";

export default function ProjectIntro() {
  const {
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
  } = useAssessmentFlow();

  // AI 간이 추정 채팅(ADR-008): step 1 안에서 여닫는 하위 화면 + 추정 근거 메타(결과 라벨용).
  const [mbtiChatOpen, setMbtiChatOpen] = useState(false);
  const [estimatedMeta, setEstimatedMeta] = useState(null);

  const {
    recallPhase,
    setRecallPhase,
    recallPredicted,
    setRecallPredicted,
    recallActual,
    setRecallActual,
    calibrationCount,
    setCalibrationCount,
    resetRecall,
    saveCalibrationRecord,
  } = useMetacognition(resultId);

  const {
    serverConsent,
    setServerConsent,
    serverMsg,
    serverCount,
    saveToServer,
    listFromServer,
    deleteFromServer,
  } = useServerSync();

  const topScores = Object.entries(result.scores)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  // 신뢰 패널: TOP3 추천이 실제로 반영한 행동지표를 중복 없이 모은다("설문답 → 지표 → 추천" 흐름).
  const usedIndicators = [...new Set(result.recommendations.flatMap((item) => item.basedOn ?? []))];

  // 하루 스케줄 생성기(최소 슬라이스): result 메모와 분리된 로컬 입력으로 계산한다.
  const [savedEssential] = useState(() => loadEssentialHours() ?? {});
  const [sleepHours, setSleepHours] = useState(savedEssential.sleep ?? 7);
  const [classHours, setClassHours] = useState(savedEssential.class ?? 6);
  const [otherHours, setOtherHours] = useState(savedEssential.other ?? 3);
  useEffect(() => {
    // 필수시간 입력을 로컬 저장 → 새로고침해도 하루·주간 계획이 재현된다(서버 저장 아님).
    saveEssentialHours({ sleep: sleepHours, class: classHours, other: otherHours });
  }, [sleepHours, classHours, otherHours]);
  const dayPlan = buildDayPlan({
    essentialHours: { sleep: sleepHours, class: classHours, other: otherHours },
    recommendations: result.recommendations,
    routine: result.routine,
  });
  const weeklyTimetable = buildWeeklyTimetable({ dayPlan, weeklyPlan: result.weeklyPlan });

  function handleServerSave() {
    saveToServer({
      mbti: mbtiKnown ? mbti : null,
      temperament: result.match?.temperament ?? null,
      matchedMethods: result.recommendations.map((item) => item.id),
      baselineMethods: result.baselineRecommendations.map((item) => item.id),
      taskType,
      deadline,
      availableMinutes,
      fitScore,
      understanding: understandingScore,
      actionability: actionabilityScore,
      focus: focusLevel,
      fatigue: fatigueLevel,
      calibrationError:
        recallPredicted !== null && recallActual !== null ? Math.abs(recallPredicted - recallActual) : null,
      algorithmVersion: ALGORITHM_VERSION,
    });
  }

  // 흐름 상태(useAssessmentFlow)와 메타인지 상태(useMetacognition)에 걸치는 초기화는 여기서 조합한다.
  function resetFlow() {
    resetFlowState();
    resetRecall();
  }

  function handleStoredDataClear() {
    if (!window.confirm("이 브라우저에 저장된 결과, 루틴 기록, 추천 평가를 모두 삭제할까요?")) {
      return;
    }
    clearLocalState();
    resetRecall();
    setCalibrationCount(0);
  }

  return (
    <main className="study-app">
      {step === 0 && !showAnalysis ? (
        <StepIntro
          hasCompleteResult={hasCompleteResult}
          canClear={hasCompleteResult || records.length > 0 || feedbackCount > 0}
          onStart={() => setStep(1)}
          onResume={() => setStep(4)}
          onClearData={handleStoredDataClear}
          onShowAnalysis={() => setShowAnalysis(true)}
        />
      ) : (
      <div className="shell">
        <div className="topbar">
          <div className="brand">MBTI 기반 공부법 및 스트레스 관리 웹앱</div>
          <div className="pill">Vite + React · 규칙 기반 추천 · localStorage</div>
        </div>

        {showAnalysis ? (
          <AnalysisReport onClose={() => setShowAnalysis(false)} />
        ) : (
        <>
        <Progress step={step} />

        {step === 1 && !mbtiChatOpen && (
          <StepMbtiSource
            mbti={mbti}
            setMbti={setMbti}
            mbtiSource={mbtiSource}
            setMbtiSource={setMbtiSource}
            onContinueWithout={continueWithoutOfficialMbti}
            onUseAiChat={() => {
              setMbtiSource("ai-estimated");
              setMbtiChatOpen(true);
            }}
            onHome={() => setStep(0)}
            onNext={() => setStep(2)}
          />
        )}

        {step === 1 && mbtiChatOpen && (
          <StepMbtiChat
            onEstimated={(estimatedMbti, meta) => {
              setEstimatedMeta(meta);
              applyEstimatedMbti(estimatedMbti);
              setMbtiChatOpen(false);
            }}
            onFallback={() => {
              setEstimatedMeta(null);
              continueWithoutOfficialMbti();
              setMbtiChatOpen(false);
            }}
            onBack={() => {
              setMbtiSource("");
              setMbtiChatOpen(false);
            }}
            onHome={() => {
              setMbtiChatOpen(false);
              setStep(0);
            }}
          />
        )}

        {step === 2 && (
          <StepSurvey
            stepLabel="Step 2"
            title="공부 성향 설문"
            description="집중·이해·판단·복습·계획 방식을 묻는 짧은 자체 문항입니다. 일부 문항은 4축 선호의 탐색 신호를 만들지만 공식 MBTI 판정에는 사용하지 않습니다."
            questions={STUDY_QUESTIONS}
            answers={studyAnswers}
            onAnswer={(questionId, optionId) => setStudyAnswers((prev) => ({ ...prev, [questionId]: optionId }))}
            onBack={() => setStep(1)}
            onHome={() => setStep(0)}
            onNext={() => setStep(3)}
            canContinue={canContinueStudy}
            nextLabel="스트레스 설문으로 이동"
          />
        )}

        {step === 3 && (
          <StepSurvey
            stepLabel="Step 3"
            title="스트레스 반응 설문"
            description="피로 신호, 자책 반응, 회복 방식, 계획이 밀렸을 때의 반응을 고르세요."
            questions={STRESS_QUESTIONS}
            answers={stressAnswers}
            onAnswer={(questionId, optionId) => setStressAnswers((prev) => ({ ...prev, [questionId]: optionId }))}
            onBack={() => setStep(2)}
            onHome={() => setStep(0)}
            onNext={() => setStep(4)}
            canContinue={canContinueStress}
            nextLabel="결과 보기"
          />
        )}

        {step === 4 && hasCompleteResult && (
          <section className="panel">
            <p className="eyebrow">Result</p>
            <h2>나의 공부 성향 요약</h2>
            <p>{result.summary}</p>
            <div className="answers">
              {[...getSelectedOptionLabels(STUDY_QUESTIONS, studyAnswers), ...getSelectedOptionLabels(STRESS_QUESTIONS, stressAnswers)].map((item) => (
                <span className="answer-chip" key={`${item.question}-${item.answer}`}>
                  {item.question}: {item.answer}
                </span>
              ))}
            </div>

            <div className="two-col">
              <div className="result-card">
                <h3>MBTI 입력 출처</h3>
                <p>
                  {mbtiKnown
                    ? `사용자가 입력한 공식 MBTI 결과: ${mbti}`
                    : mbtiEstimated
                      ? `AI와의 짧은 대화로 간이 추정한 유형: ${mbti} (공식 판정 아님)`
                      : "공식 MBTI 결과를 입력하지 않았습니다. 추천에는 공부·스트레스 응답만 사용했습니다."}
                </p>
                {mbtiEstimated && (
                  <p className="hint" style={{ marginTop: 8 }}>
                    이 값은 탐색적 간이 추정입니다. 공식 MBTI 평가 결과가 아니며, 매칭의 시작점으로만 사용됩니다.
                    {estimatedMeta?.uncertainty ? ` ${estimatedMeta.uncertainty}` : ""}
                  </p>
                )}
              </div>
              <div className="result-card">
                <h3>공부습관 기반 4축 탐색 신호</h3>
                <p className="lead" style={{ marginBottom: 8 }}>{result.preferenceProfile.code}</p>
                <p>{result.preferenceProfile.interpretation}</p>
                <div className="signal-grid">
                  {result.preferenceProfile.axes.map((axis) => (
                    <div className="signal-item" key={axis.axis}>
                      <strong>{axis.analogy}</strong>
                      <span>{axis.label} · {axis.leaning}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {(mbtiKnown || mbtiEstimated) && result.match?.temperament && (
              <div className="feedback-card">
                <p className="eyebrow">MBTI × 공부법 매칭{mbtiEstimated ? " · 간이 추정" : ""}</p>
                <h3>{mbti} · {result.match.temperamentLabel} 맞춤 매칭</h3>
                {mbtiEstimated && (
                  <p className="hint" style={{ marginTop: 0, marginBottom: 8 }}>
                    아래 매칭은 <strong>AI 간이 추정</strong> 유형을 시작점으로 씁니다(공식 판정 아님).
                  </p>
                )}
                <p>{result.match.reason}</p>
                <div className="answers">
                  {result.recommendations.map((item) => (
                    <span className="answer-chip" key={`match-${item.id}`}>{item.title}</span>
                  ))}
                </div>
                <p className="hint" style={{ marginTop: 10 }}>
                  이 매칭은 문헌에서 도출한 출발점입니다(선호일 수 있음). 실제 효과는 실행 후 결과로 확인합니다 — 아래 baseline과 비교해 기록합니다.
                </p>
                <p className="hint" style={{ marginTop: 6 }}>
                  연구에 따르면 결과 차이는 MBTI 유형보다 예측·회상을 맞춰보는 자기조절 습관으로 더 잘 설명됩니다. MBTI는 시작점이고, 실천 카드의 자기 점검이 더 근거 있는 신호입니다.
                </p>
              </div>
            )}

            <div className="feedback-card">
              <p className="eyebrow">Baseline comparison</p>
              <h3>MBTI 신호의 추가 효과를 분리해 기록합니다</h3>
              <p>
                {mbtiKnown
                  ? result.baselineRecommendations.map((item) => item.id).join("|") ===
                    result.recommendations.map((item) => item.id).join("|")
                    ? "이번 응답에서는 MBTI 힌트를 포함해도 TOP 3 추천 순서가 바뀌지 않았습니다."
                    : "이번 응답에서는 MBTI 힌트를 포함했을 때 TOP 3 추천 순서가 달라졌습니다. 이것은 효과가 좋아졌다는 뜻이 아니며 후속 결과로 검증해야 합니다."
                  : `공식 MBTI 결과가 없어 ${hasTaskState ? "task/state 기준" : "행동·상태 기반 기준"}(baseline)을 최종 추천으로 사용했습니다. 공부습관 기반 탐색 코드는 추천 가중치에 넣지 않았습니다.`}
              </p>
              {mbtiKnown && (
                <div className="signal-grid">
                  <div className="signal-item">
                    <strong>{hasTaskState ? "task/state 기준" : "행동·상태 기반 기준"}</strong>
                    <span>{result.baselineRecommendations.map((item) => item.title).join(" → ")}</span>
                  </div>
                  <div className="signal-item">
                    <strong>MBTI 힌트 추가</strong>
                    <span>{result.recommendations.map((item) => item.title).join(" → ")}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="result-layout">
              <div className="result-card">
                <h3>핵심 행동지표</h3>
                <div className="score-list">
                  {topScores.map(([key, value]) => (
                    <ScoreBar key={key} label={SCORE_LABELS[key]} value={value} />
                  ))}
                </div>
                <p className="hint">점수는 사용자를 평가하거나 남과 비교하는 값이 아니라, 오늘 어떤 방식을 먼저 시도해볼지 추천 방향을 정하는 신호입니다.</p>
              </div>
              <div className="result-card">
                <h3>추천 공부법 TOP 3</h3>
                <div className="card-list">
                  {result.recommendations.map((item) => (
                    <article className="method" key={item.title}>
                      <strong>{item.title}</strong>
                      {item.plain && <p className="method-plain">{item.plain}</p>}
                      {item.dailyExample && (
                        <p className="method-example">
                          <span className="method-example-tag">일상 예시</span>
                          {item.dailyExample}
                        </p>
                      )}
                      <p className="method-action">오늘 할 일 · {item.action}</p>
                      <p className="method-reason">{item.reason}</p>
                      {item.basedOn?.length > 0 && (
                        <div className="method-basis">
                          <span className="method-basis-tag">근거 지표</span>
                          {item.basedOn.map((key) => (
                            <span className="basis-chip" key={key}>{SCORE_LABELS[key] ?? key}</span>
                          ))}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </div>
            </div>

            <div className="feedback-card trust-panel">
              <p className="eyebrow">이 추천이 나온 근거 · 한계</p>
              <h3>내 응답이 어떻게 추천으로 이어졌는지</h3>
              <div className="trust-flow">
                <div className="trust-step">
                  <span className="trust-step-tag">① 내 응답 신호</span>
                  <div className="trust-chips">
                    {result.preferenceProfile.axes.map((axis) => (
                      <span className="basis-chip" key={axis.axis}>{axis.analogy} · {axis.leaning}</span>
                    ))}
                  </div>
                </div>
                <div className="trust-arrow" aria-hidden="true">→</div>
                <div className="trust-step">
                  <span className="trust-step-tag">② 반영된 행동지표</span>
                  <div className="trust-chips">
                    {usedIndicators.map((key) => (
                      <span className="basis-chip" key={key}>{SCORE_LABELS[key] ?? key}</span>
                    ))}
                  </div>
                </div>
                <div className="trust-arrow" aria-hidden="true">→</div>
                <div className="trust-step">
                  <span className="trust-step-tag">③ 추천 공부법</span>
                  <div className="trust-chips">
                    {result.recommendations.map((item) => (
                      <span className="basis-chip chip-strong" key={item.id}>{item.title}</span>
                    ))}
                  </div>
                </div>
              </div>
              <p className="hint">
                이 흐름은 규칙 기반 계산입니다. 점수는 우열이 아니라 "무엇을 먼저 시도할지" 신호이며, 실제 효과는 실행 후 결과로만 확인됩니다.
              </p>
              <p className="hint" style={{ marginTop: 6 }}>
                MBTI는 고정된 진단이 아니라 탐색 시작점입니다. 같은 유형이라도 상황·과업에 따라 잘 맞는 방식이 달라질 수 있어, 아래 자기 점검 기록이 더 믿을 만한 신호가 됩니다.
              </p>
            </div>

            <div className="two-col">
              <div className="result-card">
                <h3>피해야 할 공부 방식</h3>
                <ul>{result.avoidList.map((item) => <li key={item}>{item}</li>)}</ul>
              </div>
              <div className="result-card">
                <h3>스트레스 신호</h3>
                <ul>{result.stressSignals.map((item) => <li key={item}>{item}</li>)}</ul>
              </div>
            </div>

            <div className="feedback-card">
              <p className="eyebrow">Recommendation feedback · {ALGORITHM_VERSION}</p>
              <h3>이 추천이 현재 상황에 얼마나 맞나요?</h3>
              <p>이 평가는 사용자가 아니라 추천 시스템의 적합도를 확인합니다. MVP에서는 이 브라우저의 localStorage에만 저장되며 서버나 GitHub로 전송되지 않습니다.</p>
              <div className="rating-grid" aria-label="추천 적합도">
                {[1, 2, 3, 4, 5].map((score) => (
                  <OptionCard active={fitScore === score} key={score} onClick={() => setFitScore(score)}>
                    {score}
                  </OptionCard>
                ))}
              </div>
              <textarea
                aria-label="추천에 대한 선택 의견"
                maxLength={300}
                onChange={(event) => setFeedbackNote(event.target.value)}
                placeholder="선택 사항: 맞았던 점이나 조정이 필요한 점을 적어주세요. 개인정보는 입력하지 마세요."
                value={feedbackNote}
              />
              <div className="range-group">
                <label className="range-row">
                  이해도
                  <input max="5" min="1" onChange={(event) => setUnderstandingScore(Number(event.target.value))} type="range" value={understandingScore} />
                  <span>{understandingScore}</span>
                </label>
                <label className="range-row">
                  실행 가능성
                  <input max="5" min="1" onChange={(event) => setActionabilityScore(Number(event.target.value))} type="range" value={actionabilityScore} />
                  <span>{actionabilityScore}</span>
                </label>
              </div>
              <button className="secondary" disabled={!fitScore} onClick={handleFeedbackSave} style={{ marginTop: 12 }} type="button">
                추천 평가를 이 브라우저에 저장 또는 갱신
              </button>
              {feedbackCount > 0 && <div className="saved">추천 평가 {feedbackCount}개가 이 브라우저에 저장되어 있습니다.</div>}
            </div>

            <div className="feedback-card">
              <p className="eyebrow">Research data · 선택 · 성인 파일럿</p>
              <h3>익명 요약을 연구 데이터로 저장(선택)</h3>
              <ConsentNotice />
              <label className="checkline">
                <input checked={serverConsent} onChange={(event) => setServerConsent(event.target.checked)} type="checkbox" />
                익명 요약을 서버에 저장하는 데 동의합니다.
              </label>
              <div className="actions">
                <button className="secondary" disabled={!serverConsent} onClick={handleServerSave} type="button">
                  서버에 익명 저장
                </button>
                <button className="secondary" onClick={listFromServer} type="button">
                  내 서버 기록 보기
                </button>
                <button className="secondary" onClick={deleteFromServer} type="button">
                  내 서버 기록 삭제
                </button>
              </div>
              {serverMsg && <div className="saved">{serverMsg}</div>}
              {serverCount !== null && <p className="hint" style={{ marginTop: 6 }}>현재 서버에 내 익명 기록 {serverCount}개.</p>}
            </div>

            <div className="actions">
              <button className="secondary" onClick={() => setStep(3)} type="button">
                이전
              </button>
              <button className="secondary" onClick={() => setStep(0)} type="button">
                처음 화면
              </button>
              <button className="primary" onClick={() => setStep(5)} type="button">
                오늘 계획 입력하기
              </button>
            </div>
          </section>
        )}

        {step === 5 && hasCompleteResult && (
          <StepTaskState
            taskType={taskType}
            setTaskType={setTaskType}
            deadline={deadline}
            setDeadline={setDeadline}
            availableMinutes={availableMinutes}
            setAvailableMinutes={setAvailableMinutes}
            hasTaskState={hasTaskState}
            baselineTitles={result.answerOnlyBaselineRecommendations.map((item) => item.title)}
            taskStateTitles={result.baselineRecommendations.map((item) => item.title)}
            onBack={() => setStep(4)}
            onHome={() => setStep(0)}
            onNext={() => setStep(6)}
          />
        )}

        {step === 6 && hasCompleteResult && (
          <section className="panel">
            <p className="eyebrow">Routine</p>
            <h2>{result.routine.title}</h2>
            <p>{result.routine.estimatedMinutes}분 안에 끝나는 작은 루틴으로 먼저 시도해볼 수 있습니다.</p>

            <div className="result-card" style={{ marginTop: 16 }}>
              <h3>오늘의 시간블록 (총 {result.schedule.totalMinutes}분)</h3>
              <div className="answers">
                {result.schedule.blocks.map((block) => (
                  <span className="answer-chip" key={block.order}>
                    {block.order}. {block.title} · {block.minutes}분
                  </span>
                ))}
              </div>
              <p className="hint" style={{ marginTop: 10 }}>
                매칭된 학습법을 오늘 실행할 블록으로 배치했습니다. 상세 시간표는 이후 단계에서 확장합니다.
              </p>
            </div>

            <div className="result-card" style={{ marginTop: 16 }}>
              <h3>주간 분산 계획</h3>
              <p className="hint">{result.weeklyPlan.note}</p>
              {!result.weeklyPlan.compressed && (
                <div className="signal-grid" style={{ marginTop: 10 }}>
                  {result.weeklyPlan.checkpoints.map((point) => (
                    <div className="signal-item" key={point.day}>
                      <strong>{point.day}</strong>
                      <span>{point.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="result-card" style={{ marginTop: 16 }}>
              <h3>오늘 하루 스케줄 만들기</h3>
              <p className="hint">
                하루 24시간에서 꼭 쓰는 시간을 빼고, 남는 시간에 오늘 추천 학습법을 얹어 제안합니다. 알림·캘린더 연동은 하지 않고 제안만 보여줍니다.
              </p>
              <div className="range-group" style={{ marginTop: 12 }}>
                <label className="range-row">
                  수면
                  <input max="12" min="0" onChange={(event) => setSleepHours(Number(event.target.value))} type="range" value={sleepHours} />
                  <span>{sleepHours}h</span>
                </label>
                <label className="range-row">
                  수업·일정
                  <input max="16" min="0" onChange={(event) => setClassHours(Number(event.target.value))} type="range" value={classHours} />
                  <span>{classHours}h</span>
                </label>
                <label className="range-row">
                  식사·이동·기타
                  <input max="12" min="0" onChange={(event) => setOtherHours(Number(event.target.value))} type="range" value={otherHours} />
                  <span>{otherHours}h</span>
                </label>
              </div>
              <p className="hint" style={{ marginTop: 10 }}>{dayPlan.note}</p>
              {dayPlan.blocks.length > 0 && (
                <div className="answers" style={{ marginTop: 10 }}>
                  {dayPlan.blocks.map((block) => (
                    <span className={block.kind === "recovery" ? "answer-chip chip-recovery" : "answer-chip"} key={block.order}>
                      {block.order}. {block.title} · {block.minutes}분
                    </span>
                  ))}
                </div>
              )}

              <h3 style={{ marginTop: 20 }}>이번 주 타임테이블 (골격)</h3>
              <p className="hint">{weeklyTimetable.note}</p>
              <div className="timetable-scroll">
                <table className="timetable">
                  <thead>
                    <tr>
                      <th scope="col">시간대</th>
                      {weeklyTimetable.days.map((day) => (
                        <th scope="col" key={day.label}>{day.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {weeklyTimetable.slots.map((slot) => (
                      <tr key={slot}>
                        <th scope="row">{slot}</th>
                        {weeklyTimetable.days.map((day) => {
                          const cell = day.cells[slot];
                          return (
                            <td key={day.label + slot} className={cell ? `tt-cell tt-${cell.kind}` : "tt-cell"}>
                              {cell ? `${cell.title} · ${cell.minutes}분` : "—"}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="routine">
              <div className="result-card">
                <h3>20~30분 공부 루틴</h3>
                <ul>{result.routine.studySteps.map((item) => <li key={item}>{item}</li>)}</ul>
              </div>
              <div className="result-card">
                <h3>회복 루틴</h3>
                <p>{result.routine.recoveryStep}</p>
                <label className="checkline">
                  <input checked={completed} onChange={(event) => setCompleted(event.target.checked)} type="checkbox" />
                  오늘 루틴 완료
                </label>
                <div className="range-group">
                  <label className="range-row">
                    집중도
                    <input max="5" min="1" onChange={(event) => setFocusLevel(Number(event.target.value))} type="range" value={focusLevel} />
                    <span>{focusLevel}</span>
                  </label>
                  <label className="range-row">
                    피로도
                    <input max="5" min="1" onChange={(event) => setFatigueLevel(Number(event.target.value))} type="range" value={fatigueLevel} />
                    <span>{fatigueLevel}</span>
                  </label>
                </div>
                <button className="primary" onClick={handleRecordSave} style={{ marginTop: 16 }} type="button">
                  기록 저장
                </button>
                {records.length > 0 && <div className="saved">최근 기록 {records.length}개가 저장되어 있습니다.</div>}
              </div>
            </div>
            <div className="feedback-card">
              <p className="eyebrow">Metacognition · self-check</p>
              <h3>루틴 뒤 1분, 예측하고 떠올려보기</h3>
              <p>
                이것은 점수·능력 판정이 아니라 이 한 세션의 자기 점검입니다. 먼저 예측한 뒤 자료 없이 실제로 떠올려, 내가 안다고 느끼는 정도와 실제 회상의 차이를 스스로 확인합니다.
              </p>
              {recallPhase === "predict" && (
                <>
                  <p className="hint" style={{ marginTop: 12 }}>
                    자료를 덮고: 오늘 핵심 {RECALL_TARGET}개 중 지금 몇 개를 떠올릴 수 있을 것 같나요?
                  </p>
                  <div className="rating-grid" aria-label="회상 예측 개수">
                    {Array.from({ length: RECALL_TARGET + 1 }, (_, count) => (
                      <OptionCard
                        active={recallPredicted === count}
                        key={count}
                        onClick={() => setRecallPredicted(count)}
                      >
                        {count}
                      </OptionCard>
                    ))}
                  </div>
                  <button
                    className="secondary"
                    disabled={recallPredicted === null}
                    onClick={() => setRecallPhase("recall")}
                    style={{ marginTop: 12 }}
                    type="button"
                  >
                    이제 자료 없이 떠올려보기
                  </button>
                </>
              )}
              {recallPhase === "recall" && (
                <>
                  <p className="hint" style={{ marginTop: 12 }}>
                    자료를 보지 말고 실제로 떠올려보세요. 실제로 몇 개를 떠올렸나요? (예측: {recallPredicted}개)
                  </p>
                  <div className="rating-grid" aria-label="실제 회상 개수">
                    {Array.from({ length: RECALL_TARGET + 1 }, (_, count) => (
                      <OptionCard
                        active={recallActual === count}
                        key={count}
                        onClick={() => setRecallActual(count)}
                      >
                        {count}
                      </OptionCard>
                    ))}
                  </div>
                  <button
                    className="secondary"
                    disabled={recallActual === null}
                    onClick={saveCalibrationRecord}
                    style={{ marginTop: 12 }}
                    type="button"
                  >
                    자기 점검 기록
                  </button>
                </>
              )}
              {recallPhase === "done" && (
                <>
                  <div className="signal-grid" style={{ marginTop: 12 }}>
                    <div className="signal-item">
                      <strong>예측</strong>
                      <span>{recallPredicted}개</span>
                    </div>
                    <div className="signal-item">
                      <strong>실제 회상</strong>
                      <span>{recallActual}개</span>
                    </div>
                    <div className="signal-item">
                      <strong>보정 오차</strong>
                      <span>{Math.abs(recallPredicted - recallActual)}</span>
                    </div>
                  </div>
                  <p className="hint" style={{ marginTop: 12 }}>
                    {recallPredicted > recallActual
                      ? "예측이 실제보다 높았습니다. ‘안다는 느낌’이 실제 회상보다 앞설 수 있으니, 다음엔 조금 더 인출연습을 해볼 수 있습니다."
                      : recallPredicted < recallActual
                        ? "실제 회상이 예측보다 높았습니다. 스스로를 과소평가했을 수 있습니다."
                        : "예측과 실제가 같았습니다. 이번 세션에서는 자기 점검이 비교적 잘 맞았습니다."}
                  </p>
                  <button className="secondary" onClick={resetRecall} style={{ marginTop: 12 }} type="button">
                    다시 점검하기
                  </button>
                </>
              )}
              {calibrationCount > 0 && <div className="saved">자기 점검 기록 {calibrationCount}개가 이 브라우저에 저장되어 있습니다.</div>}
            </div>

            <div className="actions">
              <button className="secondary" onClick={() => setStep(5)} type="button">
                오늘 계획으로 돌아가기
              </button>
              <button className="secondary" onClick={() => setStep(0)} type="button">
                처음 화면
              </button>
              <button className="secondary" onClick={resetFlow} type="button">
                처음부터 다시하기
              </button>
            </div>
          </section>
        )}
        </>
        )}
        <p className="hint" style={{ marginTop: 18 }}>
          이 프로젝트는 공식 MBTI 평가를 제공·복제하지 않으며 The Myers-Briggs Company 또는 Myers &amp; Briggs Foundation과 제휴하지 않습니다. MBTI와 Myers-Briggs Type Indicator는 해당 권리자의 상표 또는 등록상표입니다.
        </p>
      </div>
      )}
    </main>
  );
}
