import type { RecommendationPlace, RecommendationResult } from "../api/types";
import { AlertIcon, CheckIcon, ExternalIcon, MapPinIcon, ShieldIcon } from "./icons";

export function ResultList({ result }: { result: RecommendationResult }) {
  return (
    <section aria-labelledby="result-title" className="space-y-5">
      <div className="surface-card overflow-hidden bg-slate-950 p-6 text-white sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-teal-300">
              <CheckIcon className="h-4 w-4" /> Verified result
            </div>
            <h2 id="result-title" className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">근거가 연결된 Top 3</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">서버가 점수와 순위를 먼저 확정하고, Elice 문장이 같은 후보의 근거를 인용하는지 다시 검증했습니다.</p>
            <p className="mt-3 text-xs font-semibold text-slate-400 tabular-nums">
              이번 실행: Naver Local {result.placeSearchCalls}회 · Naver Blog {result.blogSearchCalls}회 · Elice 이유 {result.reasonGenerationCalls}회
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <SummaryBadge label="후보" value={String(result.places.length)} />
            <SummaryBadge label="저하" value={result.degraded ? "있음" : "없음"} />
            <SummaryBadge label="대체" value={result.reasonFallback ? "있음" : "없음"} />
          </div>
        </div>
      </div>

      {result.warnings.length > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950" role="note">
          <AlertIcon className="mt-0.5 h-5 w-5 shrink-0" />
          <div><strong>결과 해석 주의</strong><p className="mt-1 text-amber-800">{result.warnings.join(" · ")}</p></div>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        {result.places.map((place) => <ResultCard key={place.placeId} place={place} />)}
      </div>
    </section>
  );
}

export function ResultCard({ place }: { place: RecommendationPlace }) {
  const headingId = `place-${place.placeId}`;
  return (
    <article className="surface-card flex min-h-full flex-col overflow-hidden" aria-labelledby={headingId}>
      <div className="relative border-b border-slate-200 bg-gradient-to-br from-teal-50 via-white to-amber-50 px-5 pb-5 pt-6">
        <div className="flex items-start justify-between gap-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-sm font-black text-white" aria-label={`${place.rank}위`}>{place.rank}</span>
          <div className="text-right">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Evidence score</p>
            <p className="mt-0.5 text-3xl font-black tracking-tight text-teal-800 tabular-nums">{place.score}<span className="text-sm font-bold text-slate-400">/80</span></p>
          </div>
        </div>
        <h3 id={headingId} className="mt-5 text-xl font-black tracking-tight text-slate-950">{place.name}</h3>
        <p className="mt-1 text-sm font-medium text-teal-800">{place.category}</p>
        <p className="mt-3 flex items-start gap-2 text-sm leading-5 text-slate-600"><MapPinIcon className="mt-0.5 h-4 w-4 shrink-0" />{place.roadAddress || place.address}</p>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <ScoreBreakdown place={place} />
        <div className="mt-5 border-t border-slate-200 pt-5">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-sm font-bold text-slate-900">검증된 추천 이유</h4>
            <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-1 text-[11px] font-bold text-teal-800"><ShieldIcon className="h-3.5 w-3.5" /> {place.evidenceLevel === "LOCAL_AND_BLOG" ? "장소+블로그" : "장소 근거"}</span>
          </div>
          <ul className="mt-3 space-y-3">
            {place.reasonStatements.map((reason) => (
              <li key={`${reason.text}-${reason.evidenceIds.join()}`} className="rounded-xl bg-slate-50 px-3 py-3 text-sm leading-6 text-slate-700">
                {reason.text}
                <span className="mt-1 block text-[11px] font-semibold text-slate-400">근거 {reason.evidenceIds.join(", ")}</span>
              </li>
            ))}
          </ul>
        </div>

        {place.cautions.length > 0 && (
          <ul className="mt-4 space-y-1 text-xs leading-5 text-amber-800">
            {place.cautions.map((caution) => <li key={caution}>※ {caution}</li>)}
          </ul>
        )}

        <div className="mt-auto pt-5">
          <a href={place.sourceUrl} target="_blank" rel="noopener noreferrer" className="secondary-button w-full justify-center">
            원문 장소 정보 확인 <ExternalIcon className="h-4 w-4" />
          </a>
        </div>
      </div>
    </article>
  );
}

function ScoreBreakdown({ place }: { place: RecommendationPlace }) {
  const entries = [
    ["위치", place.scoreBreakdown.location, 30],
    ["유형", place.scoreBreakdown.placeType, 25],
    ["선호", place.scoreBreakdown.preference, 15],
    ["블로그", place.scoreBreakdown.blogEvidence, 10],
  ] as const;
  return (
    <div>
      <h4 className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">점수 구성</h4>
      <dl className="mt-3 grid grid-cols-2 gap-2">
        {entries.map(([label, value, maximum]) => (
          <div key={label} className="rounded-xl border border-slate-200 px-3 py-2">
            <dt className="text-[11px] text-slate-500">{label}</dt>
            <dd className="mt-0.5 text-sm font-black text-slate-800 tabular-nums">{value}<span className="font-medium text-slate-400">/{maximum}</span></dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function SummaryBadge({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2"><p className="text-[10px] uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 text-sm font-bold">{value}</p></div>;
}
