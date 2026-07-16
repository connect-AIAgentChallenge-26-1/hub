"use client";

import { SearchIcon, SparklesIcon } from "./icons";

interface RequestFormProps {
  value: string;
  interactive: boolean;
  pending: boolean;
  onChange(value: string): void;
  onSubmit(value: string): void;
}

const examples = [
  "서울에서 2명이 조용한 카페를 찾습니다. 흡연 장소는 제외합니다.",
  "서울 음식점을 찾습니다.",
  "서울 디저트 카페를 찾습니다. 흡연 장소는 제외합니다.",
];

export function RequestForm({ value, interactive, pending, onChange, onSubmit }: RequestFormProps) {
  const valid = value.trim().length >= 5 && value.length <= 500;
  return (
    <section className="surface-card overflow-hidden" aria-labelledby="request-title">
      <div className="border-b border-slate-200/80 bg-white/70 px-5 py-5 sm:px-7">
        <div className="eyebrow"><SparklesIcon className="h-4 w-4" /> Step 1</div>
        <h2 id="request-title" className="mt-2 text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">
          어떤 장소를 찾고 있나요?
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          자연어를 실제 조건 Draft로 바꾼 뒤, 검색을 시작하기 전에 직접 확인할 수 있습니다.
        </p>
      </div>
      <form
        className="space-y-5 p-5 sm:p-7"
        onSubmit={(event) => {
          event.preventDefault();
          const submittedValue = new FormData(event.currentTarget).get("requestText");
          if (typeof submittedValue !== "string") return;
          const normalized = submittedValue.trim();
          if (normalized.length >= 5 && normalized.length <= 500 && interactive && !pending) {
            onChange(submittedValue);
            onSubmit(normalized);
          }
        }}
      >
        <div>
          <label htmlFor="request-text" className="field-label">장소 요청</label>
          <div className="relative mt-2">
            <textarea
              id="request-text"
              name="requestText"
              value={value}
              onChange={(event) => onChange(event.target.value)}
              maxLength={500}
              rows={5}
              disabled={!interactive || pending}
              aria-describedby="request-help request-count"
              className="field-control min-h-36 resize-y pr-12 text-[15px] leading-7"
            />
            <SearchIcon className="pointer-events-none absolute right-4 top-4 h-5 w-5 text-slate-400" />
          </div>
          <div className="mt-2 flex items-start justify-between gap-4 text-xs text-slate-500">
            <p id="request-help">이름·연락처 등 개인정보 없이 장소 조건만 입력하세요.</p>
            <p id="request-count" className="shrink-0 tabular-nums">{value.length}/500</p>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">빠른 예시</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {examples.map((example, index) => (
              <button
                key={example}
                type="button"
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-medium text-slate-600 transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
                disabled={!interactive || pending}
                onClick={() => onChange(example)}
              >
                예시 {index + 1}
              </button>
            ))}
          </div>
        </div>

        <button type="submit" className="primary-button w-full sm:w-auto" disabled={!interactive || !valid || pending}>
          {pending ? "조건을 추출하는 중…" : "AI 조건 Draft 만들기"}
          <SparklesIcon className="h-5 w-5" />
        </button>
      </form>
    </section>
  );
}
