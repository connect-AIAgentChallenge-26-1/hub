export const PRODUCT_TELEMETRY_NAMES = [
  "webVital",
  "sseRecovered",
  "partialRecommendationShown",
  "alternativeRecommendationRequested",
  "conditionFieldChanged",
  "coldStartRecovered",
  "clientError",
] as const;

export type ProductTelemetryName = (typeof PRODUCT_TELEMETRY_NAMES)[number];
export type ViewportClass = "mobile" | "tablet" | "desktop";
export type ProductSurface =
  | "home"
  | "draft"
  | "progress"
  | "result"
  | "place"
  | "room"
  | "roomResult";

export type ProductTelemetryEvent =
  | {
      name: "webVital";
      context: {
        metricName: "LCP" | "INP" | "CLS" | "TTFB";
        metricRating: "good" | "needs-improvement" | "poor";
        metricValueBucket: "fast" | "moderate" | "slow";
        viewportClass: ViewportClass;
      };
    }
  | {
      name: "sseRecovered";
      context: {
        streamType: "recommendation" | "room";
        recoveryMode: "snapshot" | "stream";
        viewportClass: ViewportClass;
      };
    }
  | {
      name: "partialRecommendationShown";
      context: {
        resultCount: "1" | "2";
        explorationRound: "initial" | "alternative";
        viewportClass: ViewportClass;
      };
    }
  | {
      name: "alternativeRecommendationRequested";
      context: {
        explorationRound: "initial" | "alternative";
        viewportClass: ViewportClass;
      };
    }
  | {
      name: "conditionFieldChanged";
      context: {
        fieldName:
          | "locationQuery"
          | "placeType"
          | "placeTypeDetail"
          | "partySize"
          | "budgetRange"
          | "preferences"
          | "exclusions";
        viewportClass: ViewportClass;
      };
    }
  | {
      name: "coldStartRecovered";
      context: {
        surface: ProductSurface;
        durationBucket: "under10s" | "10to30s" | "30to90s";
        viewportClass: ViewportClass;
      };
    }
  | {
      name: "clientError";
      context: {
        surface: ProductSurface;
        errorCategory: "api" | "contract" | "network" | "sse" | "unknown";
        recoverable: "true" | "false";
        viewportClass: ViewportClass;
      };
    };

export interface ProductTelemetryRequest {
  eventId: string;
  name: ProductTelemetryName;
  occurredAt: string;
  context: Record<string, string>;
}

const VALUE_ALLOWLIST: Record<ProductTelemetryName, Record<string, readonly string[]>> = {
  webVital: {
    metricName: ["LCP", "INP", "CLS", "TTFB"],
    metricRating: ["good", "needs-improvement", "poor"],
    metricValueBucket: ["fast", "moderate", "slow"],
    viewportClass: ["mobile", "tablet", "desktop"],
  },
  sseRecovered: {
    streamType: ["recommendation", "room"],
    recoveryMode: ["snapshot", "stream"],
    viewportClass: ["mobile", "tablet", "desktop"],
  },
  partialRecommendationShown: {
    resultCount: ["1", "2"],
    explorationRound: ["initial", "alternative"],
    viewportClass: ["mobile", "tablet", "desktop"],
  },
  alternativeRecommendationRequested: {
    explorationRound: ["initial", "alternative"],
    viewportClass: ["mobile", "tablet", "desktop"],
  },
  conditionFieldChanged: {
    fieldName: [
      "locationQuery",
      "placeType",
      "placeTypeDetail",
      "partySize",
      "budgetRange",
      "preferences",
      "exclusions",
    ],
    viewportClass: ["mobile", "tablet", "desktop"],
  },
  coldStartRecovered: {
    surface: ["home", "draft", "progress", "result", "place", "room", "roomResult"],
    durationBucket: ["under10s", "10to30s", "30to90s"],
    viewportClass: ["mobile", "tablet", "desktop"],
  },
  clientError: {
    surface: ["home", "draft", "progress", "result", "place", "room", "roomResult"],
    errorCategory: ["api", "contract", "network", "sse", "unknown"],
    recoverable: ["true", "false"],
    viewportClass: ["mobile", "tablet", "desktop"],
  },
};

/**
 * The runtime check is intentional: TypeScript types disappear in the browser and must not be
 * the only barrier preventing a URL, message, stack, or raw user value from entering telemetry.
 */
export function buildProductTelemetryRequest(
  event: ProductTelemetryEvent,
  eventId = crypto.randomUUID(),
  occurredAt = new Date().toISOString(),
): ProductTelemetryRequest {
  const allowed = VALUE_ALLOWLIST[event.name];
  const entries = Object.entries(event.context);
  const expectedKeys = Object.keys(allowed);
  if (entries.length !== expectedKeys.length ||
      entries.some(([key, value]) => !allowed[key]?.includes(value))) {
    throw new Error("허용되지 않은 제품 텔레메트리 context입니다.");
  }
  return {
    eventId,
    name: event.name,
    occurredAt,
    context: Object.fromEntries(entries),
  };
}

export function viewportClass(width = globalThis.innerWidth): ViewportClass {
  if (width < 640) return "mobile";
  if (width < 1024) return "tablet";
  return "desktop";
}

export function explorationRound(round: number): "initial" | "alternative" {
  return round === 0 ? "initial" : "alternative";
}

export function durationBucket(durationMs: number): "under10s" | "10to30s" | "30to90s" {
  if (durationMs < 10_000) return "under10s";
  if (durationMs < 30_000) return "10to30s";
  return "30to90s";
}
