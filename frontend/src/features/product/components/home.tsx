"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ProductApi, withColdStartRetry } from "../api/client";
import { ProductNotice } from "./product-shell";
import { ArrowIcon, ShieldIcon, SparklesIcon } from "@/features/live-playground/components/icons";

const examples = [
  "성수에서 2명이 조용히 대화할 수 있는 카페를 찾아줘. 흡연 장소는 제외해줘.",
  "강남에서 4명이 갈 음식점을 찾아줘. 1인당 3만원 이하이고 웨이팅 긴 곳은 빼줘.",
];
export function ProductHome() {
  const api = useMemo(() => new ProductApi(), []);
  const router = useRouter();
  const [requestText, setRequestText] = useState(examples[0]!);
  const [pending, setPending] = useState(false);
  const [wakingServer, setWakingServer] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!requestText.trim() || pending) return;
    setPending(true);
    setWakingServer(false);
    setError(null);
    try {
      await withColdStartRetry(
        () => api.ensureSession(),
        () => setWakingServer(true),
      );
      setWakingServer(false);
      const draft = await api.createDraft(requestText.trim());
      router.push(`/recommendations/new/${draft.draftId}`);
    } catch (value) {
      setError(value instanceof Error ? value.message : "조건 초안을 만들지 못했습니다.");
      setWakingServer(false);
      setPending(false);
    }
  }

  return (
    <main id="main-content">
      <section className="hero-grid relative overflow-hidden bg-slate-950 px-4 py-14 text-white sm:px-6 sm:py-24">
        <div className="relative z-10 mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-teal-300/20 bg-teal-300/10 px-3 py-1.5 text-xs font-bold text-teal-200"><SparklesIcon className="h-4 w-4" /> 근거를 확인할 수 있는 장소 추천</div>
            <h1 className="mt-6 text-4xl font-black leading-tight tracking-[-0.04em] sm:text-6xl">조건은 내가 확정하고,<br /><span className="text-teal-300">선택은 함께.</span></h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300">자연어로 원하는 장소를 말하면 조건 초안을 먼저 보여 드립니다. 확인한 조건으로만 후보를 찾고, 점수와 근거를 공개합니다.</p>
            <ul className="mt-7 grid gap-3 text-sm text-slate-300 sm:grid-cols-3">
              <li className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">조건 자동 확정 없음</li>
              <li className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">결정론적 Top 3</li>
              <li className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">공유 투표·최종 확정</li>
            </ul>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white p-5 text-slate-950 shadow-2xl sm:p-7">
            <p className="eyebrow"><SparklesIcon className="h-4 w-4" /> 장소 조건 입력</p>
            <label htmlFor="product-request" className="mt-4 block text-lg font-black">어떤 장소를 찾고 있나요?</label>
            <textarea id="product-request" className="field-control mt-3 min-h-36 resize-y leading-6" maxLength={1_000} value={requestText} onChange={(event) => setRequestText(event.target.value)} />
            <div className="mt-3 flex flex-wrap gap-2">
              {examples.map((example, index) => <button key={example} type="button" className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-teal-50 hover:text-teal-800" onClick={() => setRequestText(example)}>예시 {index + 1}</button>)}
            </div>
            {error && <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">{error}</p>}
            {wakingServer && <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status">무료 데모 서버를 시작하고 있습니다. 최대 90초 동안 세션 연결만 제한적으로 재시도합니다.</p>}
            <button type="button" className="primary-button mt-5 w-full justify-center" disabled={pending || !requestText.trim()} onClick={submit}>{wakingServer ? "무료 데모 서버 시작 중…" : pending ? "조건을 구조화하는 중…" : "AI 조건 초안 확인"}<ArrowIcon className="h-5 w-5" /></button>
            <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-slate-500"><ShieldIcon className="mt-0.5 h-4 w-4 shrink-0" />개인정보나 민감한 내용을 입력하지 마세요. 입력 조건은 추천 처리에만 사용합니다.</p>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6"><ProductNotice /></section>
    </main>
  );
}
