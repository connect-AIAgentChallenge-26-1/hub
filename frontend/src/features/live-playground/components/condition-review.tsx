"use client";

import { useMemo, useState } from "react";
import {
  PLACE_TYPES,
  type DraftSnapshot,
  type Preference,
  type RecommendationCondition,
} from "../api/types";
import { ArrowIcon, CheckIcon } from "./icons";

interface ConditionReviewProps {
  draft: DraftSnapshot;
  pending: boolean;
  onConfirm(condition: RecommendationCondition): void;
}

const placeTypeLabels: Record<(typeof PLACE_TYPES)[number], string> = {
  RESTAURANT: "음식점",
  CAFE: "카페",
  BAR: "주점",
  OTHER: "기타",
};

export function ConditionReview({ draft, pending, onConfirm }: ConditionReviewProps) {
  const [condition, setCondition] = useState<RecommendationCondition>(() => ({
    ...draft.condition,
    preferences: draft.condition.preferences.map((item) => ({
      ...item,
      priority: item.priority ?? 5,
    })),
  }));
  const [exclusions, setExclusions] = useState(draft.condition.exclusions.join(", "));
  const error = useMemo(() => validate(condition), [condition]);

  const update = <K extends keyof RecommendationCondition>(
    field: K,
    value: RecommendationCondition[K],
  ) => setCondition((current) => ({ ...current, [field]: value }));

  return (
    <section className="surface-card overflow-hidden" aria-labelledby="review-title">
      <div className="border-b border-slate-200/80 bg-white/70 px-5 py-5 sm:px-7">
        <div className="eyebrow"><CheckIcon className="h-4 w-4" /> Step 2</div>
        <h2 id="review-title" className="mt-2 text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">
          AI가 이해한 조건을 확인해 주세요
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          이 화면의 값을 확정하기 전에는 Naver 장소 검색을 시작하지 않습니다.
        </p>
      </div>

      <form
        className="space-y-6 p-5 sm:p-7"
        onSubmit={(event) => {
          event.preventDefault();
          if (!error && !pending) {
            onConfirm({
              ...condition,
              exclusions: exclusions.split(",").map((value) => value.trim()).filter(Boolean),
            });
          }
        }}
      >
        {draft.warnings.length > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3" role="note">
            <p className="text-sm font-semibold text-amber-950">추정하지 않고 남겨 둔 항목</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {draft.warnings.map((warning) => <span key={warning} className="warning-chip">{warningLabel(warning)}</span>)}
            </div>
          </div>
        )}

        <fieldset className="grid gap-5 sm:grid-cols-2">
          <legend className="sr-only">필수 장소 조건</legend>
          <div>
            <label className="field-label" htmlFor="location-query">지역 <span aria-hidden="true">*</span></label>
            <input
              id="location-query"
              className="field-control mt-2"
              value={condition.locationQuery}
              maxLength={100}
              onChange={(event) => update("locationQuery", event.target.value)}
              required
            />
          </div>
          <div>
            <label className="field-label" htmlFor="place-type">장소 유형 <span aria-hidden="true">*</span></label>
            <select
              id="place-type"
              className="field-control mt-2"
              value={condition.placeType}
              onChange={(event) => update("placeType", event.target.value as RecommendationCondition["placeType"])}
            >
              {PLACE_TYPES.map((value) => <option key={value} value={value}>{placeTypeLabels[value]}</option>)}
            </select>
          </div>
          {condition.placeType === "OTHER" && (
            <div className="sm:col-span-2">
              <label className="field-label" htmlFor="place-detail">세부 유형 <span aria-hidden="true">*</span></label>
              <input
                id="place-detail"
                className="field-control mt-2"
                value={condition.placeTypeDetail ?? ""}
                maxLength={30}
                onChange={(event) => update("placeTypeDetail", event.target.value || null)}
                required
              />
            </div>
          )}
        </fieldset>

        <fieldset>
          <legend className="field-label">선택 조건</legend>
          <p className="mt-1 text-xs text-slate-500">입력하지 않은 값은 비워 두며 AI가 임의로 채우지 않습니다.</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <NumberField id="party-size" label="인원" suffix="명" value={condition.partySize} min={1} max={100} onChange={(value) => update("partySize", value)} />
            <NumberField id="budget-min" label="1인 최소 예산" suffix="원" value={condition.budgetPerPersonMin} min={0} max={10_000_000} onChange={(value) => update("budgetPerPersonMin", value)} />
            <NumberField id="budget-max" label="1인 최대 예산" suffix="원" value={condition.budgetPerPersonMax} min={0} max={10_000_000} onChange={(value) => update("budgetPerPersonMax", value)} />
          </div>
        </fieldset>

        <fieldset>
          <legend className="field-label">선호 조건과 우선순위</legend>
          <p className="mt-1 text-xs text-slate-500">후보가 부족하면 가장 낮은 우선순위 선호 하나만 완화할 수 있습니다.</p>
          <div className="mt-3 space-y-3">
            {condition.preferences.length === 0 && <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">입력된 선호가 없습니다.</p>}
            {condition.preferences.map((preference, index) => (
              <PreferenceRow
                key={`${index}-${preference.value}`}
                index={index}
                preference={preference}
                onChange={(next) => update("preferences", condition.preferences.map((item, itemIndex) => itemIndex === index ? next : item))}
                onRemove={() => update("preferences", condition.preferences.filter((_, itemIndex) => itemIndex !== index))}
              />
            ))}
            {condition.preferences.length < 10 && (
              <button
                type="button"
                className="secondary-button"
                onClick={() => update("preferences", [...condition.preferences, { value: "", priority: 5 }])}
              >
                선호 추가
              </button>
            )}
          </div>
        </fieldset>

        <div>
          <label className="field-label" htmlFor="exclusions">제외 조건</label>
          <input
            id="exclusions"
            className="field-control mt-2"
            value={exclusions}
            onChange={(event) => setExclusions(event.target.value)}
            placeholder="쉼표로 구분: 흡연, 시끄러운"
          />
        </div>

        {error && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800" role="alert">{error}</p>}

        <div className="flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-slate-500">확정하면 실제 검색 호출이 시작되며, 점수와 순위는 서버가 결정합니다.</p>
          <button className="primary-button shrink-0" disabled={Boolean(error) || pending} type="submit">
            {pending ? "추천을 시작하는 중…" : "조건 확정하고 추천 시작"}
            <ArrowIcon className="h-5 w-5" />
          </button>
        </div>
      </form>
    </section>
  );
}

function NumberField({ id, label, suffix, value, min, max, onChange }: {
  id: string; label: string; suffix: string; value: number | null; min: number; max: number;
  onChange(value: number | null): void;
}) {
  return (
    <div>
      <label className="text-xs font-semibold text-slate-600" htmlFor={id}>{label}</label>
      <div className="relative mt-1.5">
        <input
          id={id}
          type="number"
          className="field-control pr-10 tabular-nums"
          value={value ?? ""}
          min={min}
          max={max}
          onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">{suffix}</span>
      </div>
    </div>
  );
}

function PreferenceRow({ index, preference, onChange, onRemove }: {
  index: number; preference: Preference; onChange(value: Preference): void; onRemove(): void;
}) {
  return (
    <div className="grid grid-cols-[1fr_5.5rem_auto] items-end gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
      <div>
        <label className="text-xs font-semibold text-slate-600" htmlFor={`preference-${index}`}>선호 {index + 1}</label>
        <input id={`preference-${index}`} className="field-control mt-1.5" value={preference.value} maxLength={50} onChange={(event) => onChange({ ...preference, value: event.target.value })} />
      </div>
      <div>
        <label className="text-xs font-semibold text-slate-600" htmlFor={`priority-${index}`}>우선순위</label>
        <input id={`priority-${index}`} type="number" className="field-control mt-1.5 tabular-nums" min={1} max={10} value={preference.priority ?? ""} onChange={(event) => onChange({ ...preference, priority: event.target.value === "" ? null : Number(event.target.value) })} />
      </div>
      <button type="button" className="mb-1 rounded-lg px-2 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 focus-visible:outline-2 focus-visible:outline-rose-600" onClick={onRemove} aria-label={`선호 ${index + 1} 삭제`}>삭제</button>
    </div>
  );
}

function validate(condition: RecommendationCondition): string | null {
  if (!condition.locationQuery.trim()) return "지역을 입력해 주세요.";
  if (condition.placeType === "OTHER" && !condition.placeTypeDetail?.trim()) return "기타 장소의 세부 유형을 입력해 주세요.";
  if (condition.budgetPerPersonMin != null && condition.budgetPerPersonMax != null && condition.budgetPerPersonMin > condition.budgetPerPersonMax) return "최소 예산은 최대 예산보다 클 수 없습니다.";
  if (condition.preferences.some((item) => !item.value.trim() || item.priority == null || item.priority < 1 || item.priority > 10)) return "모든 선호 값과 1~10 우선순위를 확인해 주세요.";
  return null;
}

function warningLabel(value: string): string {
  const labels: Record<string, string> = {
    PARTY_SIZE_NOT_PROVIDED: "인원 미입력",
    BUDGET_NOT_PROVIDED: "예산 미입력",
    BUDGET_EVIDENCE_UNAVAILABLE: "가격 근거 없음",
  };
  return labels[value] ?? value;
}
