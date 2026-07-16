"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { HttpPlaygroundApi, PlaygroundApiError } from "../api/client";
import { MockPlaygroundApi } from "../api/mock-client";
import type { RecommendationCondition, RunFailure } from "../api/types";
import { initialPlaygroundState, playgroundReducer } from "../model/state";
import { ConditionReview } from "./condition-review";
import { AlertIcon, CheckIcon, LoaderIcon, ShieldIcon, SparklesIcon } from "./icons";
import { RequestForm } from "./request-form";
import { ResultList } from "./result-list";
import { TraceTimeline } from "./trace-timeline";

const apiMode = process.env.NEXT_PUBLIC_PLAYGROUND_API_MODE === "api" ? "api" : "mock";

export function LivePlayground() {
  const [state, dispatch] = useReducer(playgroundReducer, initialPlaygroundState);
  const [interactive, setInteractive] = useState(false);
  const api = useMemo(
    () => apiMode === "api" ? new HttpPlaygroundApi() : new MockPlaygroundApi(),
    [],
  );
  const disconnectRef = useRef<(() => void) | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setInteractive(true);
    return () => {
      disconnectRef.current?.();
      if (reconnectTimerRef.current != null) window.clearTimeout(reconnectTimerRef.current);
    };
  }, []);

  async function extractDraft(requestText: string) {
    dispatch({ type: "EXTRACTION_REQUESTED" });
    try {
      const draft = await api.createDraft({ requestText });
      dispatch({ type: "DRAFT_READY", draft });
    } catch (error) {
      dispatch({ type: "FAILED", failure: failureFrom(error, "CONDITION_EXTRACTION_FAILED") });
    }
  }

  async function confirmAndRun(condition: RecommendationCondition) {
    const draft = state.draft;
    if (!draft) return;
    dispatch({ type: "RUN_REQUESTED", draft });
    try {
      const confirmed = await api.updateDraft(draft.draftId, {
        condition,
      });
      const accepted = await api.startRun(confirmed.draftId);
      dispatch({ type: "RUN_ACCEPTED", run: accepted.snapshot });
      if (accepted.snapshot.status === "COMPLETED") {
        dispatch({ type: "RUN_COMPLETED", run: accepted.snapshot });
        return;
      }
      if (accepted.snapshot.status === "FAILED" && accepted.snapshot.error) {
        dispatch({ type: "FAILED", failure: accepted.snapshot.error });
        return;
      }
      disconnectRef.current?.();
      disconnectRef.current = api.subscribeToRun(accepted.runId, accepted.eventsUrl, {
        onSnapshot: (run) => dispatch({ type: "SNAPSHOT_RECEIVED", run }),
        onTrace: (event) => dispatch({ type: "TRACE_RECEIVED", runId: accepted.runId, event }),
        onCompleted: (run) => {
          disconnectRef.current?.();
          disconnectRef.current = null;
          dispatch({ type: "RUN_COMPLETED", run });
        },
        onFailed: (failure) => {
          disconnectRef.current?.();
          disconnectRef.current = null;
          dispatch({ type: "FAILED", failure });
        },
        onConnectionError: () => recoverSnapshot(accepted.runId),
      });
    } catch (error) {
      dispatch({ type: "FAILED", failure: failureFrom(error, "RECOMMENDATION_START_FAILED") });
    }
  }

  function recoverSnapshot(runId: string) {
    dispatch({ type: "CONNECTION_STATE", reconnecting: true });
    if (reconnectTimerRef.current != null) return;
    reconnectTimerRef.current = window.setTimeout(async () => {
      reconnectTimerRef.current = null;
      try {
        const run = await api.getRun(runId);
        dispatch({ type: "SNAPSHOT_RECEIVED", run });
        if (run.status === "COMPLETED") {
          disconnectRef.current?.();
          disconnectRef.current = null;
        }
        if (run.status === "FAILED" && run.error) {
          dispatch({ type: "FAILED", failure: run.error });
        }
      } catch {
        dispatch({ type: "CONNECTION_STATE", reconnecting: true });
      }
    }, 1_000);
  }

  async function cancelAndReset() {
    const runId = state.run?.runId;
    disconnectRef.current?.();
    disconnectRef.current = null;
    if (runId) {
      try {
        await api.cancelRun(runId);
      } catch {
        // 화면 종료를 막지 않는다. 실패 시 서버의 30분 TTL이 최종 정리를 담당한다.
      }
    }
    dispatch({ type: "RESET" });
  }

  const busy = ["EXTRACTING", "STARTING", "RUNNING"].includes(state.phase);
  return (
    <main id="main-content" className="min-h-screen pb-20" data-interactive={interactive}>
      <Hero mode={apiMode} />

      <div className="mx-auto mt-[-2rem] w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <ModeNotice mode={apiMode} />

        <div className="mt-5 grid items-start gap-5 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
          <div className="space-y-5">
            {(state.phase === "INPUT" || state.phase === "EXTRACTING") && (
              <RequestForm
                value={state.requestText}
                interactive={interactive}
                pending={state.phase === "EXTRACTING"}
                onChange={(value) => dispatch({ type: "INPUT_CHANGED", value })}
                onSubmit={extractDraft}
              />
            )}
            {(state.phase === "REVIEW" || state.phase === "STARTING") && state.draft && (
              <ConditionReview
                key={`${state.draft.draftId}-${state.draft.status}`}
                draft={state.draft}
                pending={state.phase === "STARTING"}
                onConfirm={confirmAndRun}
              />
            )}
            {(state.phase === "RUNNING" || state.phase === "COMPLETED") && (
              <TraceTimeline events={state.trace} reconnecting={state.reconnecting} />
            )}
            {state.phase === "ERROR" && state.failure && (
              <FailurePanel failure={state.failure} onReset={cancelAndReset} />
            )}
          </div>

          <aside className="space-y-5 xl:sticky xl:top-5" aria-label="추천 실행 결과">
            {state.phase === "INPUT" || state.phase === "EXTRACTING" || state.phase === "REVIEW" || state.phase === "STARTING" ? (
              <ProcessPreview activePhase={state.phase} />
            ) : null}
            {state.phase === "RUNNING" && <RunningPanel traceCount={state.trace.length} onCancel={cancelAndReset} />}
            {state.phase === "COMPLETED" && state.run?.result && (
              <>
                <ResultList result={state.run.result} />
                <button className="secondary-button w-full justify-center" onClick={cancelAndReset}>결과를 삭제하고 새 조건으로 찾기</button>
              </>
            )}
          </aside>
        </div>

        {busy && <p className="sr-only" role="status">현재 {phaseLabel(state.phase)} 단계입니다.</p>}
      </div>
    </main>
  );
}

function Hero({ mode }: { mode: "api" | "mock" }) {
  return (
    <header className="hero-grid relative overflow-hidden bg-slate-950 px-4 pb-20 pt-8 text-white sm:px-6 sm:pb-24 sm:pt-12">
      <div className="relative z-10 mx-auto max-w-7xl">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-teal-400 text-slate-950"><SparklesIcon /></span>
            <div><p className="text-lg font-black tracking-tight">PlacePick AI</p><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-teal-300">Engineering playground</p></div>
          </div>
          <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200">{mode === "api" ? "LOCAL LIVE" : "MOCK PREVIEW"}</span>
        </div>
        <div className="mt-12 max-w-3xl sm:mt-16">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-teal-300">From intent to grounded choice</p>
          <h1 className="mt-4 text-4xl font-black leading-[1.08] tracking-[-0.04em] sm:text-6xl">
            추천의 모든 판단을<br /><span className="text-teal-300">눈으로 확인하세요.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
            자연어 조건 추출부터 실제 후보 정제, 근거 점수, Top 3와 LLM 사후 검증까지 같은 사용자 흐름에서 확인합니다.
          </p>
        </div>
      </div>
    </header>
  );
}

function ModeNotice({ mode }: { mode: "api" | "mock" }) {
  return (
    <div className={`rounded-2xl border px-4 py-4 shadow-lg backdrop-blur sm:flex sm:items-center sm:justify-between sm:gap-6 ${mode === "api" ? "border-amber-200 bg-amber-50/95" : "border-teal-200 bg-teal-50/95"}`} role="note">
      <div className="flex items-start gap-3">
        <ShieldIcon className={`mt-0.5 h-5 w-5 shrink-0 ${mode === "api" ? "text-amber-700" : "text-teal-700"}`} />
        <div>
          <p className="text-sm font-bold text-slate-900">{mode === "api" ? "로컬 실제 Provider 모드" : "외부 호출 없는 Mock 모드"}</p>
          <p className="mt-1 text-xs leading-5 text-slate-600">{mode === "api" ? "입력과 결과는 서버 메모리에 최대 30분만 유지되며 결과 화면에서 즉시 삭제할 수 있습니다. 개인정보를 입력하거나 결과를 artifact로 저장하지 마세요." : "합성 fixture로 전체 제품 흐름을 재현합니다. 화면의 장소는 실제 추천 결과가 아닙니다."}</p>
        </div>
      </div>
      <span className="mt-3 inline-flex rounded-full bg-white px-3 py-1 text-[11px] font-bold text-slate-600 shadow-sm sm:mt-0">NO STORE · SAME ORIGIN</span>
    </div>
  );
}

function ProcessPreview({ activePhase }: { activePhase: string }) {
  const items = [
    ["1", "조건 추출", "Elice strict schema와 누락 경고"],
    ["2", "사용자 확인", "수정 가능한 정규화 조건"],
    ["3", "장소·근거 검색", "Naver Local·Blog provenance"],
    ["4", "결정론적 Top 3", "서버 점수와 안정적 정렬"],
    ["5", "이유 사후 검증", "place·evidence 소유 관계"],
  ];
  return (
    <section className="surface-card p-5 sm:p-7" aria-labelledby="preview-title">
      <p className="eyebrow">Product flow</p>
      <h2 id="preview-title" className="mt-2 text-xl font-bold text-slate-950">이 화면에서 확인할 것</h2>
      <ol className="mt-5 space-y-3">
        {items.map(([number, title, detail]) => (
          <li key={number} className="flex gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xs font-black text-slate-700">{number}</span>
            <div><p className="text-sm font-bold text-slate-900">{title}</p><p className="mt-0.5 text-xs leading-5 text-slate-500">{detail}</p></div>
          </li>
        ))}
      </ol>
      <p className="mt-5 rounded-xl bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">현재 단계: <strong className="text-teal-800">{phaseLabel(activePhase)}</strong></p>
    </section>
  );
}

function RunningPanel({ traceCount, onCancel }: { traceCount: number; onCancel(): void }) {
  return (
    <section className="surface-card p-6 text-center" aria-labelledby="running-title">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 text-teal-700"><LoaderIcon className="h-7 w-7" /></span>
      <h2 id="running-title" className="mt-4 text-xl font-black text-slate-950">실제 추천 Core 실행 중</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">현재까지 {traceCount}개 검증 단계를 받았습니다. 결과가 확정될 때까지 이 화면을 유지합니다.</p>
      <button type="button" className="mt-5 text-sm font-semibold text-rose-700 underline decoration-rose-300 underline-offset-4" onClick={onCancel}>실행 취소하고 입력으로 돌아가기</button>
    </section>
  );
}

function FailurePanel({ failure, onReset }: { failure: RunFailure; onReset(): void }) {
  return (
    <section className="surface-card border-rose-200 p-6" aria-labelledby="failure-title" role="alert">
      <AlertIcon className="h-8 w-8 text-rose-700" />
      <p className="mt-4 text-xs font-bold uppercase tracking-[0.14em] text-rose-700">{failure.errorCode}</p>
      <h2 id="failure-title" className="mt-1 text-xl font-black text-slate-950">{failure.title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{failure.detail}</p>
      <button type="button" className="secondary-button mt-5" onClick={onReset}>입력으로 돌아가기</button>
    </section>
  );
}

function failureFrom(error: unknown, fallbackCode: string): RunFailure {
  if (error instanceof PlaygroundApiError) {
    return {
      errorCode: error.problem.errorCode ?? fallbackCode,
      title: error.problem.title,
      detail: error.problem.detail,
      traceId: error.problem.traceId,
    };
  }
  return {
    errorCode: fallbackCode,
    title: "요청을 완료하지 못했습니다.",
    detail: error instanceof Error ? error.message : "표시 가능한 오류 정보가 없습니다.",
  };
}

function phaseLabel(phase: string): string {
  const labels: Record<string, string> = {
    INPUT: "자연어 입력",
    EXTRACTING: "조건 추출",
    REVIEW: "조건 검토",
    STARTING: "추천 준비",
    RUNNING: "검색·점수·이유 검증",
    COMPLETED: "추천 완료",
    ERROR: "안전한 중단",
  };
  return labels[phase] ?? phase;
}
