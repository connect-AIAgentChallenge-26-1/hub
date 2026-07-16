"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ProductApi, withColdStartRetry } from "../api/client";
import type { ProductRoom, VoteValue } from "../api/types";
import { ErrorPanel, LoadingPanel } from "./product-shell";
import { MapPinIcon } from "@/features/live-playground/components/icons";

export function RoomView({ shareToken }: { shareToken: string }) {
  const api = useMemo(() => new ProductApi(), []);
  const router = useRouter();
  const [room, setRoom] = useState<ProductRoom | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [coldStart, setColdStart] = useState(false);

  useEffect(() => {
    let active = true;
    let disconnect: (() => void) | null = null;
    void withColdStartRetry(
      () => api.getRoom(shareToken),
      () => active && setColdStart(true),
      () => active,
    ).then((value) => {
      if (!active) return;
      setColdStart(false);
      setRoom(value);
      if (value.status === "FINALIZED") {
        router.replace(`/rooms/${shareToken}/result`);
        return;
      }
      disconnect = api.subscribeRoom(shareToken, {
        onSnapshot: (next) => { setRoom(next); setReconnecting(false); },
        onChanged: (next) => { setRoom(next); setReconnecting(false); },
        onFinalized: (next) => { setRoom(next); router.replace(`/rooms/${shareToken}/result`); },
        onHeartbeat: () => setReconnecting(false),
        onConnectionError: () => {
          setReconnecting(true);
          void api.getRoom(shareToken).then((next) => {
            if (active) { setRoom(next); setReconnecting(false); }
          }).catch(() => undefined);
        },
      });
    }).catch((value) => active && setError(value));
    return () => { active = false; disconnect?.(); };
  }, [api, router, shareToken]);

  async function vote(placeId: string, value: VoteValue) {
    if (!room || pendingKey) return;
    setPendingKey(placeId);
    setError(null);
    try {
      const current = room.myVotes[placeId];
      if (current === value) await api.deleteVote(shareToken, placeId);
      else await api.putVote(shareToken, placeId, value);
      setRoom(await api.getRoom(shareToken));
    } catch (cause) {
      setError(cause);
    } finally {
      setPendingKey(null);
    }
  }

  async function finalize(placeId: string) {
    if (pendingKey) return;
    setPendingKey(`final:${placeId}`);
    try {
      await api.finalizeRoom(shareToken, placeId);
      router.push(`/rooms/${shareToken}/result`);
    } catch (cause) {
      setError(cause);
      setPendingKey(null);
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
  }

  if (error && !room) return <ErrorPanel error={error} retry={() => window.location.reload()} />;
  if (!room) return <LoadingPanel title={coldStart ? "무료 데모 서버를 깨우는 중" : "투표방을 여는 중"} detail={coldStart ? "공유 링크에서도 Cold start를 최대 90초까지 제한적으로 재시도합니다." : "공유 token으로 후보와 최신 집계를 확인합니다."} />;

  return <div className="space-y-6">
    <section className="surface-card bg-slate-950 p-6 text-white sm:p-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-xs font-bold uppercase tracking-widest text-teal-300">함께 고르는 장소</p><h1 className="mt-2 text-3xl font-black">좋아요와 아쉬워요를 남겨 주세요</h1><p className="mt-2 text-sm text-slate-300">표는 언제든 바꾸거나 삭제할 수 있고, 세션·장소당 하나만 집계됩니다.</p></div>
        <button type="button" className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-slate-950" onClick={() => void copyLink()}>{copied ? "링크 복사됨" : "공유 링크 복사"}</button>
      </div>
      {reconnecting && <p className="mt-4 rounded-xl bg-amber-300/10 p-3 text-xs text-amber-200" role="status">실시간 집계를 다시 연결하고 있습니다. 최신 snapshot으로 복구합니다.</p>}
    </section>
    {error != null && <div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800" role="alert">{error instanceof Error ? error.message : "투표 요청에 실패했습니다."}</div>}
    <div className="grid gap-5 lg:grid-cols-3">
      {room.places.map((place, index) => {
        const aggregate = room.aggregate.find((value) => value.placeId === place.placeId) ?? { likeCount: 0, dislikeCount: 0 };
        const myVote = room.myVotes[place.placeId];
        return <article key={place.placeId} className="surface-card overflow-hidden">
          <div className="border-b border-slate-200 bg-gradient-to-br from-teal-50 to-white p-5"><span className="text-xs font-black text-teal-800">후보 {index + 1}</span><h2 className="mt-2 text-xl font-black">{place.name}</h2><p className="mt-1 text-sm text-teal-800">{place.category}</p><p className="mt-3 flex gap-2 text-sm text-slate-600"><MapPinIcon className="h-4 w-4" />{place.roadAddress || place.address}</p></div>
          <div className="p-5">
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className={`rounded-xl border px-3 py-3 text-sm font-bold ${myVote === "LIKE" ? "border-teal-600 bg-teal-50 text-teal-800" : "border-slate-200"}`} disabled={pendingKey != null} onClick={() => void vote(place.placeId, "LIKE")} aria-pressed={myVote === "LIKE"}>좋아요 <span className="tabular-nums">{aggregate.likeCount}</span></button>
              <button type="button" className={`rounded-xl border px-3 py-3 text-sm font-bold ${myVote === "DISLIKE" ? "border-rose-500 bg-rose-50 text-rose-800" : "border-slate-200"}`} disabled={pendingKey != null} onClick={() => void vote(place.placeId, "DISLIKE")} aria-pressed={myVote === "DISLIKE"}>아쉬워요 <span className="tabular-nums">{aggregate.dislikeCount}</span></button>
            </div>
            <p className="mt-3 text-center text-xs text-slate-500">선택한 버튼을 다시 누르면 내 표가 삭제됩니다.</p>
            {room.canFinalize && <button type="button" className="primary-button mt-4 w-full justify-center" disabled={pendingKey != null} onClick={() => void finalize(place.placeId)}>이 장소로 최종 확정</button>}
          </div>
        </article>;
      })}
    </div>
    <p className="text-center text-xs text-slate-500">방 만료: {new Date(room.expiresAt).toLocaleString("ko-KR")}</p>
  </div>;
}
