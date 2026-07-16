"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ProductApi, withColdStartRetry } from "../api/client";
import type { ProductJob } from "../api/types";
import { ProductPlaceCard } from "./place-card";
import { ErrorPanel, LoadingPanel } from "./product-shell";
import { CheckIcon } from "@/features/live-playground/components/icons";

export function RecommendationResult({ jobId }: { jobId: string }) {
  const api = useMemo(() => new ProductApi(), []);
  const router = useRouter();
  const [job, setJob] = useState<ProductJob | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [sharing, setSharing] = useState(false);
  const [coldStart, setColdStart] = useState(false);

  useEffect(() => {
    let active = true;
    void withColdStartRetry(
      () => api.getRecommendation(jobId),
      () => active && setColdStart(true),
      () => active,
    ).then((value) => {
      if (!active) return;
      setColdStart(false);
      if (value.status !== "COMPLETED") {
        router.replace(`/recommendations/${jobId}/progress`);
        return;
      }
      setJob(value);
    }).catch((value) => active && setError(value));
    return () => { active = false; };
  }, [api, jobId, router]);

  async function createRoom() {
    if (sharing) return;
    setSharing(true);
    try {
      const room = await api.createRoom(jobId);
      router.push(`/rooms/${room.shareToken}`);
    } catch (value) {
      setError(value);
      setSharing(false);
    }
  }

  if (error) return <ErrorPanel error={error} retry={() => window.location.reload()} />;
  if (!job) return <LoadingPanel title={coldStart ? "무료 데모 서버를 깨우는 중" : "추천 결과를 불러오는 중"} detail={coldStart ? "Cold start를 최대 90초까지 제한적으로 재시도합니다." : "완료된 Job snapshot에서 Top 3와 검증 상태를 확인합니다."} />;
  return (
    <div className="space-y-6">
      <section className="surface-card bg-slate-950 p-6 text-white sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-teal-300"><CheckIcon className="h-4 w-4" /> 추천 완료</p>
            <h1 className="mt-3 text-3xl font-black tracking-tight">근거가 연결된 Top 3</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">점수와 순위는 서버가 먼저 결정했고, 생성된 이유가 같은 후보의 근거만 인용하는지 검증했습니다.</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs"><Badge label="후보" value={String(job.places.length)} /><Badge label="저하" value={job.degraded ? "있음" : "없음"} /><Badge label="진행" value="100%" /></div>
        </div>
      </section>
      {job.warnings.length > 0 && <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="note">주의: {job.warnings.join(" · ")}</p>}
      <div className="grid gap-5 lg:grid-cols-3">{job.places.map((place, index) => <ProductPlaceCard key={place.placeId} place={place} rank={index + 1} jobId={jobId} />)}</div>
      <section className="surface-card flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="text-lg font-black">혼자 고르기 어렵다면 함께 투표하세요</h2><p className="mt-1 text-sm text-slate-600">공유방은 기본 72시간 유지되고, 주최자만 최종 장소를 확정할 수 있습니다.</p></div>
        <button type="button" className="primary-button justify-center" disabled={sharing} onClick={() => void createRoom()}>{sharing ? "공유방 만드는 중…" : "투표방 만들기"}</button>
      </section>
    </div>
  );
}

function Badge({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2"><p className="text-slate-400">{label}</p><p className="mt-1 font-black">{value}</p></div>;
}
