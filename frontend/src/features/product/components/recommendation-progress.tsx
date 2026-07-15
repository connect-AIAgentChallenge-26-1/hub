"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ProductApi, withColdStartRetry } from "../api/client";
import type { JobStage, ProductJob } from "../api/types";
import { ErrorPanel, LoadingPanel } from "./product-shell";
import { CheckIcon, LoaderIcon } from "@/features/live-playground/components/icons";

const stages: Array<{ stage: JobStage; label: string; detail: string }> = [
  { stage: "QUEUED", label: "작업 접수", detail: "202 Accepted 작업을 안전한 queue에 등록합니다." },
  { stage: "LOCAL_SEARCH", label: "장소 후보 검색", detail: "필수 위치·유형을 유지해 Naver Local 후보를 찾습니다." },
  { stage: "BLOG_SEARCH", label: "후보별 근거 확인", detail: "후보명과 연결되는 Blog 근거를 수집합니다." },
  { stage: "SCORING", label: "점수와 Top 3 확정", detail: "LLM 전에 서버가 0~80 점수와 순위를 확정합니다." },
  { stage: "REASON_GENERATION", label: "추천 이유 검증", detail: "Elice 문장이 같은 후보의 근거만 인용하는지 검사합니다." },
  { stage: "PERSISTING", label: "결과 정리", detail: "검증된 이유·주의사항·공유 문구를 최종 snapshot에 반영합니다." },
  { stage: "FINISHED", label: "완료", detail: "정확히 세 후보를 사용자에게 제공합니다." },
];

export function RecommendationProgress({ jobId }: { jobId: string }) {
  const api = useMemo(() => new ProductApi(), []);
  const router = useRouter();
  const [job, setJob] = useState<ProductJob | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [coldStart, setColdStart] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => {
    let active = true;
    let disconnect: (() => void) | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const complete = (value: ProductJob) => {
      if (!active) return;
      setJob(value);
      setReconnecting(false);
      if (value.status === "COMPLETED") {
        retryTimer = setTimeout(() => router.replace(`/recommendations/${jobId}`), 500);
      } else if (value.status === "FAILED") {
        setError(new Error(value.failure?.message ?? "추천 작업에 실패했습니다."));
      }
    };

    const connect = () => {
      disconnect = api.subscribeRecommendation(jobId, {
        onSnapshot: complete,
        onProgress: complete,
        onCompleted: complete,
        onFailed: complete,
        onHeartbeat: () => setReconnecting(false),
        onConnectionError: () => {
          if (!active) return;
          setReconnecting(true);
          void api.getRecommendation(jobId).then(complete).catch(() => {
            // EventSource는 Last-Event-ID를 유지해 자동 재연결하고 GET snapshot이 정본을 복구한다.
          });
        },
      });
    };

    const load = async () => {
      try {
        const value = await withColdStartRetry(
          () => api.getRecommendation(jobId),
          () => active && setColdStart(true),
          () => active,
        );
        if (!active) return;
        setColdStart(false);
        complete(value);
        if (value.status !== "COMPLETED" && value.status !== "FAILED") connect();
      } catch (value) {
        if (!active) return;
        setError(value);
      }
    };

    void load();
    return () => {
      active = false;
      disconnect?.();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [api, jobId, router]);

  if (error) return <ErrorPanel error={error} retry={() => window.location.reload()} />;
  if (!job) return <LoadingPanel title={coldStart ? "무료 데모 서버를 깨우는 중" : "추천 작업을 확인하는 중"} detail={coldStart ? "Cold start를 최대 90초까지 기다립니다. 같은 작업을 중복 생성하지 않습니다." : "202 Accepted로 생성된 작업의 최신 snapshot을 가져옵니다."} />;

  const activeIndex = stages.findIndex((value) => value.stage === job.stage);
  return (
    <section className="surface-card p-5 sm:p-8" aria-labelledby="progress-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="eyebrow"><LoaderIcon className="h-4 w-4" /> 실시간 추천 진행</p>
          <h1 id="progress-title" className="mt-2 text-2xl font-black sm:text-3xl">근거가 있는 후보를 찾고 있어요</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">연결이 끊겨도 작업은 계속되며, SSE 재연결과 GET snapshot으로 상태를 복구합니다.</p>
        </div>
        <div className="rounded-2xl bg-slate-950 px-5 py-3 text-center text-white"><p className="text-3xl font-black tabular-nums">{job.progress}%</p><p className="text-[10px] uppercase tracking-wider text-slate-400">server progress</p></div>
      </div>
      <div className="mt-6 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-teal-600 transition-[width] duration-500" style={{ width: `${job.progress}%` }} /></div>
      {reconnecting && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900" role="status">진행 stream을 다시 연결하고 snapshot 정본을 확인하고 있습니다.</p>}
      <ol className="mt-7 space-y-3" aria-live="polite">
        {stages.map((item, index) => {
          const done = index < activeIndex || job.status === "COMPLETED";
          const activeStage = index === activeIndex && !done;
          return <li key={item.stage} className={`flex gap-3 rounded-2xl border p-4 ${activeStage ? "border-teal-300 bg-teal-50" : "border-slate-200 bg-white"}`}>
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${done ? "bg-teal-700 text-white" : activeStage ? "bg-white text-teal-700" : "bg-slate-100 text-slate-400"}`}>{done ? <CheckIcon className="h-4 w-4" /> : activeStage ? <LoaderIcon className="h-4 w-4" /> : index + 1}</span>
            <div><p className="text-sm font-bold">{item.label}</p><p className="mt-1 text-xs leading-5 text-slate-500">{item.detail}</p></div>
          </li>;
        })}
      </ol>
    </section>
  );
}
