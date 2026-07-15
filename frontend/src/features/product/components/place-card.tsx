import Link from "next/link";
import type { ProductPlace } from "../api/types";
import { ExternalIcon, MapPinIcon, ShieldIcon } from "@/features/live-playground/components/icons";

export function ProductPlaceCard({ place, rank, jobId }: {
  place: ProductPlace;
  rank: number;
  jobId?: string;
}) {
  return (
    <article className="surface-card flex h-full flex-col overflow-hidden" aria-labelledby={`product-place-${place.placeId}`}>
      <div className="border-b border-slate-200 bg-gradient-to-br from-teal-50 via-white to-amber-50 p-5">
        <div className="flex items-center justify-between">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-950 text-sm font-black text-white" aria-label={`${rank}위`}>{rank}</span>
          <p className="text-2xl font-black text-teal-800 tabular-nums">{place.score}<span className="text-xs text-slate-400">/80</span></p>
        </div>
        <h2 id={`product-place-${place.placeId}`} className="mt-4 text-xl font-black">{place.name}</h2>
        <p className="mt-1 text-sm font-semibold text-teal-800">{place.category}</p>
        <p className="mt-3 flex gap-2 text-sm leading-5 text-slate-600"><MapPinIcon className="mt-0.5 h-4 w-4 shrink-0" />{place.roadAddress || place.address}</p>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-center gap-2 text-xs font-bold text-teal-800"><ShieldIcon className="h-4 w-4" /> {place.evidenceLevel === "LOCAL_AND_BLOG" ? "장소+Blog 근거" : "장소 근거"}</div>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
          {place.reasonStatements.map((reason) => <li key={`${reason.text}-${reason.evidenceIds.join()}`} className="rounded-xl bg-slate-50 px-3 py-2.5">{reason.text}</li>)}
        </ul>
        {place.cautions[0] && <p className="mt-3 text-xs leading-5 text-amber-800">※ {place.cautions[0]}</p>}
        <div className="mt-auto flex flex-col gap-2 pt-5">
          {jobId && <Link className="primary-button justify-center" href={`/recommendations/${jobId}/places/${place.placeId}`}>상세 근거 보기</Link>}
          <a className="secondary-button justify-center" href={place.sourceUrl} target="_blank" rel="noopener noreferrer">원문 확인 <ExternalIcon className="h-4 w-4" /></a>
        </div>
      </div>
    </article>
  );
}

export function ScoreDetails({ place }: { place: ProductPlace }) {
  const rows = [
    ["위치 일치", place.scoreBreakdown.location, 30],
    ["장소 유형", place.scoreBreakdown.placeType, 25],
    ["선호 조건", place.scoreBreakdown.preference, 15],
    ["Blog 근거", place.scoreBreakdown.blogEvidence, 10],
    ["예산 근거", place.scoreBreakdown.budget, 0],
  ] as const;
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {rows.map(([label, value, maximum]) => (
        <div key={label} className="rounded-xl border border-slate-200 p-3">
          <dt className="text-xs text-slate-500">{label}</dt>
          <dd className="mt-1 font-black tabular-nums">{value}{maximum > 0 && <span className="text-xs font-medium text-slate-400">/{maximum}</span>}</dd>
        </div>
      ))}
    </dl>
  );
}
