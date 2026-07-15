import Link from "next/link";
import type { ReactNode } from "react";
import { SparklesIcon } from "@/features/live-playground/components/icons";

export function ProductShell({ children }: { children: ReactNode }) {
  const mock = process.env.NEXT_PUBLIC_PRODUCT_API_MODE === "mock" ||
    (process.env.NEXT_PUBLIC_PRODUCT_API_MODE == null && process.env.NODE_ENV !== "production");
  const playgroundEnabled = process.env.NODE_ENV !== "production";
  return (
    <div className="min-h-screen bg-[#f6f8f7] text-slate-950">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2.5 font-black tracking-tight">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-700 text-white"><SparklesIcon /></span>
            <span>PlacePick AI</span>
          </Link>
          <div className="flex items-center gap-3">
            {mock && <span className="rounded-full bg-amber-100 px-3 py-1 text-[11px] font-bold text-amber-900">MOCK DEMO</span>}
            {playgroundEnabled && <Link href="/playground" className="text-xs font-semibold text-slate-500 hover:text-teal-800">엔지니어링 Playground</Link>}
          </div>
        </div>
      </header>
      {children}
      <footer className="border-t border-slate-200 bg-white px-4 py-8 text-center text-xs leading-5 text-slate-500">
        가격·영업 상태·이동 시간은 추정하지 않습니다. 방문 전 원문 장소 정보를 확인해 주세요.
      </footer>
    </div>
  );
}

export function PageContainer({ children, narrow = false }: { children: ReactNode; narrow?: boolean }) {
  return <main id="main-content" className={`mx-auto min-h-[calc(100vh-8rem)] w-full px-4 py-8 sm:px-6 sm:py-12 ${narrow ? "max-w-3xl" : "max-w-7xl"}`}>{children}</main>;
}

export function ProductNotice() {
  const mock = process.env.NEXT_PUBLIC_PRODUCT_API_MODE === "mock" ||
    (process.env.NEXT_PUBLIC_PRODUCT_API_MODE == null && process.env.NODE_ENV !== "production");
  if (!mock) return null;
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950" role="note">
      이 화면은 외부 API를 호출하지 않는 합성 Mock 제품 흐름입니다. 장소와 투표 결과는 데모 데이터입니다.
    </div>
  );
}

export function LoadingPanel({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="surface-card p-8 text-center" role="status">
      <span className="mx-auto block h-10 w-10 animate-spin rounded-full border-4 border-teal-100 border-t-teal-700" aria-hidden="true" />
      <h1 className="mt-5 text-xl font-black">{title}</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">{detail}</p>
    </div>
  );
}

export function ErrorPanel({ error, retry }: { error: unknown; retry?(): void }) {
  const message = error instanceof Error ? error.message : "요청을 완료하지 못했습니다.";
  return (
    <div className="surface-card border-rose-200 p-7" role="alert">
      <p className="text-xs font-bold uppercase tracking-widest text-rose-700">안전하게 중단됨</p>
      <h1 className="mt-2 text-xl font-black">요청을 처리하지 못했습니다</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">{message}</p>
      {retry && <button type="button" className="primary-button mt-5" onClick={retry}>다시 시도</button>}
    </div>
  );
}
