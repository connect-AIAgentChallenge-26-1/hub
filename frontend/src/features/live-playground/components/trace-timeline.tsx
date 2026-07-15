import type { WorkflowTraceEvent } from "../api/types";
import { CheckIcon, LoaderIcon } from "./icons";

interface TraceTimelineProps {
  events: WorkflowTraceEvent[];
  reconnecting: boolean;
}

export function TraceTimeline({ events, reconnecting }: TraceTimelineProps) {
  return (
    <section className="surface-card p-5 sm:p-7" aria-labelledby="trace-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="eyebrow"><LoaderIcon className="h-4 w-4" /> Live trace</div>
          <h2 id="trace-title" className="mt-2 text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">
            추천이 만들어지는 과정
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            임의 진행률 대신, 서버가 실제로 검증해 완료한 단계만 순서대로 표시합니다.
          </p>
        </div>
        <div className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white tabular-nums">
          {events.length}개 단계 확인
        </div>
      </div>

      {reconnecting && (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">
          진행 연결을 다시 확인하고 있습니다. 결과 정본은 snapshot으로 복구합니다.
        </p>
      )}

      <div className="mt-6" aria-live="polite" aria-atomic="false">
        {events.length === 0 ? (
          <div className="flex items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-600">
            <LoaderIcon className="h-5 w-5 text-teal-700" /> 첫 번째 검증 단계를 기다리고 있습니다.
          </div>
        ) : (
          <ol className="space-y-0">
            {events.map((event, index) => (
              <li key={event.eventId} className="relative grid grid-cols-[2rem_1fr] gap-3 pb-6 last:pb-0">
                {index < events.length - 1 && <span className="absolute left-[0.94rem] top-8 h-[calc(100%-1.5rem)] w-px bg-teal-200" aria-hidden="true" />}
                <span className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full ${event.status === "FAILED" || event.status === "CANCELLED" ? "bg-rose-100 text-rose-700" : "bg-teal-700 text-white"}`}>
                  {event.status === "RUNNING" ? <LoaderIcon className="h-4 w-4" /> : <CheckIcon className="h-4 w-4" />}
                </span>
                <article className="min-w-0 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-slate-900">{event.title}</h3>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-slate-500">{stageLabel(event.stage)}</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{event.description}</p>
                  {Object.keys(event.metrics).length > 0 && (
                    <dl className="mt-3 flex flex-wrap gap-2">
                      {Object.entries(event.metrics).map(([key, value]) => (
                        <div key={key} className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs">
                          <dt className="inline text-slate-500">{metricLabel(key)} </dt>
                          <dd className="inline font-bold text-slate-800 tabular-nums">{formatValue(value)}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  {event.candidates.length > 0 && (
                    <details className="mt-3 rounded-xl bg-slate-50 px-3 py-2">
                      <summary className="cursor-pointer text-xs font-semibold text-slate-700">후보 처리 내역 {event.candidates.length}개</summary>
                      <ul className="mt-2 space-y-2">
                        {event.candidates.map((candidate) => (
                          <li key={`${candidate.label}-${candidate.status}`} className="flex items-start justify-between gap-3 text-xs">
                            <span className="text-slate-600"><strong className="text-slate-800">{candidate.label}</strong> · {candidate.category}<br />{candidate.explanation}</span>
                            <span className={candidate.status === "FILTERED" ? "text-rose-700" : "text-teal-700"}>{candidate.status === "FILTERED" ? "제외" : "유지"}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </article>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

function stageLabel(stage: WorkflowTraceEvent["stage"]): string {
  const labels: Record<WorkflowTraceEvent["stage"], string> = {
    USER_REQUEST_ACCEPTED: "요청 접수",
    CONDITION_EXTRACTED: "조건 추출",
    USER_CONDITION_CONFIRMED: "사용자 확인",
    RECOMMENDATION_WORKFLOW_STARTED: "Core 시작",
    SEARCH_QUERY_PLANNED: "검색 계획",
    NAVER_LOCAL_COMPLETED: "Naver Local",
    CANDIDATES_NORMALIZED: "후보 정제",
    PRELIMINARY_RANKING_COMPLETED: "예비 순위",
    NAVER_BLOG_COMPLETED: "Naver Blog",
    NAVER_BLOG_FAILED: "Blog 저하",
    FINAL_RANKING_COMPLETED: "Top 3",
    ELICE_REASON_REQUESTED: "Elice 요청",
    ELICE_REASON_COMPLETED: "이유 검증",
    RECOMMENDATION_WORKFLOW_COMPLETED: "완료",
    RECOMMENDATION_WORKFLOW_FAILED: "실패",
    RECOMMENDATION_WORKFLOW_CANCELLED: "취소",
  };
  return labels[stage];
}

function formatValue(value: string | number | boolean): string {
  if (typeof value === "boolean") return value ? "예" : "아니오";
  return String(value);
}

function metricLabel(key: string): string {
  const labels: Record<string, string> = {
    schemaValid: "Schema",
    warningCount: "경고",
    providerCalls: "Provider 호출",
    received: "수신",
    eligible: "유효",
    filtered: "제외",
    duplicates: "중복",
    relaxed: "완화",
    evidence: "근거",
    scoreCeiling: "점수 상한",
    budgetScore: "예산 점수",
    resultCount: "최종 후보",
    minimumScore: "최저 점수",
    maximumScore: "최고 점수",
    fallback: "Fallback",
    invalidStatements: "거부 문장",
    linked: "실제 연결",
    degraded: "근거 저하",
    reasonFallback: "이유 대체",
    inputCharacters: "입력 글자",
    preferenceCount: "선호",
    preferenceTokens: "검색 선호",
    query: "실제 검색어",
    queryLength: "검색어 길이",
    providerTotal: "Provider 전체",
    displayLimit: "요청 상한",
    candidatePool: "근거 수집 후보",
    evidenceCount: "허용 근거",
    placeCount: "장소",
    localCalls: "Local 호출",
    blogCalls: "Blog 호출",
    reasonCalls: "이유 호출",
    failureCode: "실패 코드",
    errorCode: "결과 코드",
  };
  return labels[key] ?? key;
}
