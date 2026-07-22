"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ProductApi, ProductApiError, withColdStartRetry } from "../api/client";
import type { ProductJob } from "../api/types";
import { ProductPlaceCard } from "./place-card";
import { ErrorPanel, LoadingPanel } from "./product-shell";
import { CheckIcon } from "@/features/live-playground/components/icons";
import {
  emitProductTelemetry,
  reportClientError,
  reportColdStartRecovered,
} from "../telemetry/reporter";
import { explorationRound, viewportClass } from "../telemetry/contract";

export function RecommendationResult({ jobId }: { jobId: string }) {
  const api = useMemo(() => new ProductApi(), []);
  const router = useRouter();
  const [job, setJob] = useState<ProductJob | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [action, setAction] = useState<"ALTERNATIVE" | "ROOM" | null>(null);
  const actionLock = useRef(false);
  const actionErrorRef = useRef<HTMLDivElement>(null);
  const [coldStart, setColdStart] = useState(false);

  useEffect(() => {
    let active = true;
    void withColdStartRetry(
      () => api.getRecommendation(jobId),
      () => active && setColdStart(true),
      () => active,
      (elapsedMs) => reportColdStartRecovered(api, "result", elapsedMs),
    ).then((value) => {
      if (!active) return;
      setColdStart(false);
      if (value.status !== "COMPLETED") {
        router.replace(`/recommendations/${jobId}/progress`);
        return;
      }
      setJob(value);
      if (value.partial) {
        void emitProductTelemetry(api, {
          name: "partialRecommendationShown",
          context: {
            resultCount: value.resultCount === 1 ? "1" : "2",
            explorationRound: explorationRound(value.explorationRound),
            viewportClass: viewportClass(),
          },
        });
      }
    }).catch((value) => {
      if (active) {
        reportClientError(api, "result", value);
        setLoadError(value);
      }
    });
    return () => { active = false; };
  }, [api, jobId, router]);

  async function createRoom() {
    if (actionLock.current) return;
    actionLock.current = true;
    setAction("ROOM");
    setActionError(null);
    try {
      const room = await api.createRoom(jobId);
      router.push(`/rooms/${room.shareToken}`);
    } catch (value) {
      actionLock.current = false;
      setAction(null);
      setActionError(value);
      window.setTimeout(() => actionErrorRef.current?.focus(), 0);
    }
  }

  async function findAlternatives() {
    if (actionLock.current) return;
    actionLock.current = true;
    setAction("ALTERNATIVE");
    setActionError(null);
    try {
      void emitProductTelemetry(api, {
        name: "alternativeRecommendationRequested",
        context: {
          explorationRound: explorationRound(job?.explorationRound ?? 0),
          viewportClass: viewportClass(),
        },
      });
      const accepted = await api.startAlternative(jobId);
      router.push(
        `/recommendations/${accepted.jobId}/progress?sourceJobId=${encodeURIComponent(jobId)}`,
      );
    } catch (value) {
      reportClientError(api, "result", value);
      actionLock.current = false;
      setAction(null);
      setActionError(value);
      window.setTimeout(() => actionErrorRef.current?.focus(), 0);
    }
  }

  if (loadError) return <ErrorPanel error={loadError} retry={() => window.location.reload()} />;
  if (!job) return <LoadingPanel title={coldStart ? "무료 데모 서버를 깨우는 중" : "추천 결과를 불러오는 중"} detail={coldStart ? "Cold start를 최대 90초까지 제한적으로 재시도합니다." : "완료된 Job snapshot에서 추천 순위와 검증 상태를 확인합니다."} />;
  return (
    <div className="space-y-6">
      <section className="surface-card bg-slate-950 p-6 text-white sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-teal-300"><CheckIcon className="h-4 w-4" /> 추천 완료</p>
            <h1 className="mt-3 text-3xl font-black tracking-tight">근거가 연결된 추천 {job.resultCount}곳</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">점수와 순위는 서버가 먼저 결정했고, 추천 이유가 같은 후보의 근거만 사용하는지 검증했습니다.</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs"><Badge label="후보" value={String(job.places.length)} /><Badge label="저하" value={job.degraded ? "있음" : "없음"} /><Badge label="진행" value="100%" /></div>
        </div>
      </section>
      {job.partial && <p className="rounded-2xl border border-teal-200 bg-teal-50 p-4 text-sm text-teal-950" role="status">조건을 충분히 검색한 결과, 검증 가능한 후보 {job.resultCount}곳을 부분 결과로 제공합니다. 이 결과로도 투표방을 만들 수 있습니다.</p>}
      {job.warnings.length > 0 && <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="note">주의: {job.warnings.join(" · ")}</p>}
      <div className={`mx-auto grid gap-5 ${resultGrid(job.resultCount)}`}>{job.places.map((place, index) => <ProductPlaceCard key={place.placeId} place={place} rank={index + 1} jobId={jobId} />)}</div>
      {actionError != null && (
        <div ref={actionErrorRef} tabIndex={-1} className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 outline-none focus:ring-2 focus:ring-amber-500" role="alert">
          <strong>{alternativeExhausted(actionError) ? "다른 추천을 모두 확인했습니다" : "요청을 완료하지 못했습니다"}</strong>
          <p className="mt-1">{actionError instanceof Error ? actionError.message : "잠시 후 다시 시도해 주세요."}</p>
        </div>
      )}
      <section className="surface-card flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="text-lg font-black">혼자 고르기 어렵다면 함께 투표하세요</h2><p className="mt-1 text-sm text-slate-600">공유방은 기본 72시간 유지되고, 주최자만 최종 장소를 확정할 수 있습니다.</p></div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="button" className="secondary-button justify-center" disabled={action != null} aria-busy={action === "ALTERNATIVE"} onClick={() => void findAlternatives()}>{action === "ALTERNATIVE" ? "다른 후보를 찾는 중…" : "다른 추천 보기"}</button>
          <button type="button" className="primary-button justify-center" disabled={action != null} aria-busy={action === "ROOM"} onClick={() => void createRoom()}>{action === "ROOM" ? "공유방 만드는 중…" : "투표방 만들기"}</button>
        </div>
      </section>
    </div>
  );
}

function resultGrid(count: number): string {
  if (count === 1) return "max-w-xl grid-cols-1";
  if (count === 2) return "max-w-4xl md:grid-cols-2";
  return "max-w-7xl lg:grid-cols-3";
}

function alternativeExhausted(error: unknown): boolean {
  return error instanceof ProductApiError &&
    error.problem.status === 409 &&
    error.problem.errorCode === "NO_ALTERNATIVE_CANDIDATES";
}

function Badge({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2"><p className="text-slate-400">{label}</p><p className="mt-1 font-black">{value}</p></div>;
}
