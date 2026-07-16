"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ProductApi, withColdStartRetry } from "../api/client";
import { PRODUCT_PLACE_TYPES, type ProductCondition, type ProductDraft } from "../api/types";
import { ErrorPanel, LoadingPanel } from "./product-shell";
import { ArrowIcon, CheckIcon } from "@/features/live-playground/components/icons";

const labels = { RESTAURANT: "음식점", CAFE: "카페", BAR: "주점", OTHER: "기타" } as const;

export function DraftReview({ draftId }: { draftId: string }) {
  const api = useMemo(() => new ProductApi(), []);
  const router = useRouter();
  const [draft, setDraft] = useState<ProductDraft | null>(null);
  const [condition, setCondition] = useState<ProductCondition | null>(null);
  const [exclusions, setExclusions] = useState("");
  const [pending, setPending] = useState(false);
  const [coldStart, setColdStart] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    void withColdStartRetry(
      () => api.getDraft(draftId),
      () => active && setColdStart(true),
      () => active,
    ).then((value) => {
      if (!active) return;
      setColdStart(false);
      setDraft(value);
      setCondition({
        ...value.extractedCondition,
        preferences: value.extractedCondition.preferences.map((item) => ({ ...item, priority: item.priority ?? 5 })),
      });
      setExclusions(value.extractedCondition.exclusions.join(", "));
    }).catch((value) => active && setError(value));
    return () => { active = false; };
  }, [api, draftId]);

  if (error) return <ErrorPanel error={error} retry={() => window.location.reload()} />;
  if (!draft || !condition) return <LoadingPanel title={coldStart ? "무료 데모 서버를 깨우는 중" : "조건 초안을 불러오는 중"} detail={coldStart ? "Cold start를 최대 90초까지 제한적으로 재시도합니다." : "새로고침해도 익명 세션의 Draft를 복구합니다."} />;

  const validation = validateCondition(condition, exclusions);
  const update = <K extends keyof ProductCondition>(field: K, value: ProductCondition[K]) =>
    setCondition((current) => current == null ? current : { ...current, [field]: value });
  const updatePlaceType = (placeType: ProductCondition["placeType"]) =>
    setCondition((current) => current == null ? current : {
      ...current,
      placeType,
      placeTypeDetail: placeType === "OTHER" ? current.placeTypeDetail : null,
    });

  async function confirm() {
    if (validation || pending || !condition) return;
    setPending(true);
    setError(null);
    try {
      const confirmed = await api.confirmDraft(draftId, {
        ...condition,
        exclusions: exclusions.split(",").map((item) => item.trim()).filter(Boolean),
      });
      const accepted = await api.startRecommendation(confirmed.draftId);
      router.push(`/recommendations/${accepted.jobId}/progress`);
    } catch (value) {
      setError(value);
      setPending(false);
    }
  }

  return (
    <section className="surface-card overflow-hidden">
      <div className="border-b border-slate-200 bg-white px-5 py-6 sm:px-8">
        <p className="eyebrow"><CheckIcon className="h-4 w-4" /> 조건 확인</p>
        <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">AI가 이해한 조건을 확인해 주세요</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">수정·확정 전에는 장소 검색과 추천 작업을 시작하지 않습니다.</p>
      </div>
      <form className="space-y-6 p-5 sm:p-8" onSubmit={(event) => { event.preventDefault(); void confirm(); }}>
        {draft.warnings.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="note">AI가 추정하지 않은 항목: {draft.warnings.join(" · ")}</div>}
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="지역" id="product-location"><input id="product-location" className="field-control mt-2" value={condition.locationQuery} maxLength={100} onChange={(event) => update("locationQuery", event.target.value)} /></Field>
          <Field label="장소 유형" id="product-place-type"><select id="product-place-type" className="field-control mt-2" value={condition.placeType} onChange={(event) => updatePlaceType(event.target.value as ProductCondition["placeType"])}>{PRODUCT_PLACE_TYPES.map((value) => <option key={value} value={value}>{labels[value]}</option>)}</select></Field>
          {condition.placeType === "OTHER" && <Field label="세부 유형" id="product-place-detail"><input id="product-place-detail" className="field-control mt-2" value={condition.placeTypeDetail ?? ""} maxLength={30} onChange={(event) => update("placeTypeDetail", event.target.value || null)} /></Field>}
        </div>
        <fieldset>
          <legend className="field-label">인원과 예산</legend>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <NumberInput id="product-party" label="인원(명)" value={condition.partySize} min={1} max={100} onChange={(value) => update("partySize", value)} />
            <NumberInput id="product-budget-min" label="최소 예산(원)" value={condition.budgetPerPersonMin} max={10_000_000} onChange={(value) => update("budgetPerPersonMin", value)} />
            <NumberInput id="product-budget-max" label="최대 예산(원)" value={condition.budgetPerPersonMax} max={10_000_000} onChange={(value) => update("budgetPerPersonMax", value)} />
          </div>
        </fieldset>
        <fieldset>
          <legend className="field-label">선호와 우선순위</legend>
          <p className="mt-1 text-xs text-slate-500">후보가 부족하면 가장 낮은 우선순위 하나만 완화할 수 있습니다.</p>
          <div className="mt-3 space-y-3">
            {condition.preferences.map((item, index) => <div key={`${index}-${item.value}`} className="grid grid-cols-[1fr_6rem_auto] gap-2 rounded-xl bg-slate-50 p-3">
              <input aria-label={`선호 ${index + 1}`} className="field-control" maxLength={50} value={item.value} onChange={(event) => update("preferences", condition.preferences.map((value, current) => current === index ? { ...value, value: event.target.value } : value))} />
              <input aria-label={`선호 ${index + 1} 우선순위`} className="field-control" type="number" min={1} max={10} value={item.priority ?? ""} onChange={(event) => update("preferences", condition.preferences.map((value, current) => current === index ? { ...value, priority: event.target.value ? Number(event.target.value) : null } : value))} />
              <button type="button" className="text-xs font-bold text-rose-700" onClick={() => update("preferences", condition.preferences.filter((_, current) => current !== index))}>삭제</button>
            </div>)}
            {condition.preferences.length < 10 && <button type="button" className="secondary-button" onClick={() => update("preferences", [...condition.preferences, { value: "", priority: 5 }])}>선호 추가</button>}
          </div>
        </fieldset>
        <Field label="제외 조건(쉼표 구분)" id="product-exclusions"><input id="product-exclusions" className="field-control mt-2" maxLength={600} value={exclusions} onChange={(event) => setExclusions(event.target.value)} /></Field>
        {validation && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800" role="alert">{validation}</p>}
        <div className="flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-slate-500">확정 요청 후에는 Draft가 한 추천 작업에만 사용됩니다.</p>
          <button className="primary-button justify-center" disabled={Boolean(validation) || pending}>{pending ? "202 추천 작업을 만드는 중…" : "조건 확정하고 추천 시작"}<ArrowIcon className="h-5 w-5" /></button>
        </div>
      </form>
    </section>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return <div><label className="field-label" htmlFor={id}>{label}</label>{children}</div>;
}

function NumberInput({ id, label, value, min = 0, max, onChange }: { id: string; label: string; value: number | null; min?: number; max: number; onChange(value: number | null): void }) {
  return <Field label={label} id={id}><input id={id} type="number" min={min} max={max} step={1} className="field-control mt-2" value={value ?? ""} onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)} /></Field>;
}

function validateCondition(condition: ProductCondition, exclusionsText: string): string | null {
  if (!condition.locationQuery.trim()) return "지역을 입력해 주세요.";
  if (condition.placeType === "OTHER" && !condition.placeTypeDetail?.trim()) return "세부 유형을 입력해 주세요.";
  if (condition.partySize != null && (!Number.isInteger(condition.partySize) || condition.partySize < 1 || condition.partySize > 100)) return "인원은 1~100명의 정수여야 합니다.";
  if ([condition.budgetPerPersonMin, condition.budgetPerPersonMax].some((value) => value != null && (!Number.isInteger(value) || value < 0 || value > 10_000_000))) return "예산은 0~10,000,000원의 정수여야 합니다.";
  if (condition.budgetPerPersonMin != null && condition.budgetPerPersonMax != null && condition.budgetPerPersonMin > condition.budgetPerPersonMax) return "최소 예산은 최대 예산보다 클 수 없습니다.";
  if (condition.preferences.some((item) => !item.value.trim() || item.value.trim().length > 50 || item.priority == null || !Number.isInteger(item.priority) || item.priority < 1 || item.priority > 10)) return "선호 값(50자 이하)과 1~10 정수 우선순위를 확인해 주세요.";
  const exclusionItems = exclusionsText.split(",").map((item) => item.trim()).filter(Boolean);
  if (exclusionItems.length > 10 || exclusionItems.some((item) => item.length > 50)) return "제외 조건은 50자 이하로 최대 10개까지 입력해 주세요.";
  return null;
}
