"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ProductApi, withColdStartRetry } from "../api/client";
import type { FinalResult } from "../api/types";
import { ProductPlaceCard } from "./place-card";
import { ErrorPanel, LoadingPanel } from "./product-shell";
import { CheckIcon } from "@/features/live-playground/components/icons";

export function RoomResult({ shareToken }: { shareToken: string }) {
  const api = useMemo(() => new ProductApi(), []);
  const [result, setResult] = useState<FinalResult | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [coldStart, setColdStart] = useState(false);
  useEffect(() => {
    let active = true;
    void withColdStartRetry(
      () => api.getFinalResult(shareToken),
      () => active && setColdStart(true),
      () => active,
    ).then((value) => {
      if (active) {
        setColdStart(false);
        setResult(value);
      }
    }).catch((value) => active && setError(value));
    return () => { active = false; };
  }, [api, shareToken]);
  if (error) return <ErrorPanel error={error} />;
  if (!result) return <LoadingPanel title={coldStart ? "무료 데모 서버를 깨우는 중" : "최종 선택을 확인하는 중"} detail={coldStart ? "공유 결과에서도 Cold start를 최대 90초까지 제한적으로 재시도합니다." : "확정된 장소 snapshot을 가져옵니다."} />;
  return <div className="mx-auto max-w-2xl space-y-6">
    <section className="surface-card bg-slate-950 p-7 text-center text-white"><CheckIcon className="mx-auto h-10 w-10 text-teal-300" /><p className="mt-4 text-xs font-bold uppercase tracking-widest text-teal-300">최종 장소 확정</p><h1 className="mt-2 text-3xl font-black">함께 고른 장소예요</h1><p className="mt-2 text-sm text-slate-300">{new Date(result.finalizedAt).toLocaleString("ko-KR")} 확정</p></section>
    <ProductPlaceCard place={result.place} rank={1} />
    <Link href="/" className="secondary-button w-full justify-center">새 장소 찾기</Link>
  </div>;
}
