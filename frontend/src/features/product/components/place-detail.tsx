"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ProductApi, withColdStartRetry } from "../api/client";
import type { ProductPlace } from "../api/types";
import { ScoreDetails } from "./place-card";
import { ErrorPanel, LoadingPanel } from "./product-shell";

export function PlaceDetail({ jobId, placeId }: { jobId: string; placeId: string }) {
  const api = useMemo(() => new ProductApi(), []);
  const [place, setPlace] = useState<ProductPlace | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [coldStart, setColdStart] = useState(false);
  useEffect(() => {
    let active = true;
    void withColdStartRetry(
      () => api.getRecommendation(jobId),
      () => active && setColdStart(true),
      () => active,
    ).then((job) => {
      const found = job.places.find((value) => value.placeId === placeId);
      if (!found) throw new Error("추천 후보를 찾을 수 없습니다.");
      if (active) {
        setColdStart(false);
        setPlace(found);
      }
    }).catch((value) => active && setError(value));
    return () => { active = false; };
  }, [api, jobId, placeId]);

  if (error) return <ErrorPanel error={error} />;
  if (!place) return <LoadingPanel title={coldStart ? "무료 데모 서버를 깨우는 중" : "장소 근거를 확인하는 중"} detail={coldStart ? "Cold start를 최대 90초까지 제한적으로 재시도합니다." : "완료된 추천 snapshot에서 후보를 찾습니다."} />;
  return <article className="space-y-5">
    <Link href={`/recommendations/${jobId}`} className="text-sm font-bold text-teal-800">← Top 3로 돌아가기</Link>
    <section className="surface-card overflow-hidden">
      <div className="bg-slate-950 p-6 text-white sm:p-8"><p className="text-sm font-bold text-teal-300">{place.category}</p><h1 className="mt-2 text-3xl font-black">{place.name}</h1><p className="mt-3 text-sm text-slate-300">{place.roadAddress || place.address}</p></div>
      <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-2">
        <div><h2 className="text-lg font-black">결정론적 점수 구성</h2><p className="mt-1 text-sm leading-6 text-slate-600">가격 근거가 없으므로 예산은 추정하지 않고 0점입니다.</p><div className="mt-4"><ScoreDetails place={place} /></div></div>
        <div><h2 className="text-lg font-black">검증된 추천 이유</h2><ul className="mt-4 space-y-3">{place.reasonStatements.map((reason) => <li key={reason.text} className="rounded-xl bg-slate-50 p-4 text-sm leading-6">{reason.text}<span className="mt-1 block text-xs text-slate-400">근거 {reason.evidenceIds.join(", ")}</span></li>)}</ul></div>
      </div>
    </section>
  </article>;
}
