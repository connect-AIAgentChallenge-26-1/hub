import {
  ProductApi,
  ProductApiError,
  ProductContractError,
} from "../api/client";
import type { ProductDraftCondition, ProductCondition } from "../api/types";
import {
  buildProductTelemetryRequest,
  durationBucket,
  viewportClass,
  type ProductSurface,
  type ProductTelemetryEvent,
} from "./contract";

/** Telemetry is best-effort and must never change the user-facing workflow outcome. */
export async function emitProductTelemetry(
  api: ProductApi,
  event: ProductTelemetryEvent,
): Promise<boolean> {
  try {
    await api.recordProductEvent(buildProductTelemetryRequest(event));
    return true;
  } catch {
    return false;
  }
}

export function reportColdStartRecovered(
  api: ProductApi,
  surface: ProductSurface,
  elapsedMs: number,
): void {
  void emitProductTelemetry(api, {
    name: "coldStartRecovered",
    context: {
      surface,
      durationBucket: durationBucket(elapsedMs),
      viewportClass: viewportClass(),
    },
  });
}

export function reportClientError(
  api: ProductApi,
  surface: ProductSurface,
  error: unknown,
  overrideCategory?: "sse",
): void {
  const category = overrideCategory ?? classifyError(error);
  void emitProductTelemetry(api, {
    name: "clientError",
    context: {
      surface,
      errorCategory: category,
      recoverable: isRecoverable(error, category) ? "true" : "false",
      viewportClass: viewportClass(),
    },
  });
}

export type ConditionFieldName = Extract<
  ProductTelemetryEvent,
  { name: "conditionFieldChanged" }
>["context"]["fieldName"];

export function changedConditionFields(
  draft: ProductDraftCondition,
  confirmed: ProductCondition,
): ConditionFieldName[] {
  const changed: ConditionFieldName[] = [];
  if ((draft.locationQuery ?? "") !== confirmed.locationQuery) changed.push("locationQuery");
  if (draft.placeType !== confirmed.placeType) changed.push("placeType");
  if (draft.placeTypeDetail !== confirmed.placeTypeDetail) changed.push("placeTypeDetail");
  if (draft.partySize !== confirmed.partySize) changed.push("partySize");
  if (draft.budgetPerPersonMin !== confirmed.budgetPerPersonMin ||
      draft.budgetPerPersonMax !== confirmed.budgetPerPersonMax) {
    changed.push("budgetRange");
  }
  if (!sameArray(draft.preferences, confirmed.preferences)) changed.push("preferences");
  if (!sameArray(draft.exclusions, confirmed.exclusions)) changed.push("exclusions");
  return changed;
}

function sameArray(left: unknown[], right: unknown[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function classifyError(error: unknown): "api" | "contract" | "network" | "unknown" {
  if (error instanceof ProductApiError) return "api";
  if (error instanceof ProductContractError) return "contract";
  if (error instanceof TypeError) return "network";
  return "unknown";
}

function isRecoverable(
  error: unknown,
  category: "api" | "contract" | "network" | "sse" | "unknown",
): boolean {
  if (category === "network" || category === "sse") return true;
  return error instanceof ProductApiError && error.problem.status >= 500;
}
