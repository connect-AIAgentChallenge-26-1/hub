"use client";

import { useMemo } from "react";
import { useReportWebVitals } from "next/web-vitals";
import { ProductApi } from "../api/client";
import { emitProductTelemetry } from "./reporter";
import { viewportClass } from "./contract";

const ALLOWED_METRICS = new Set(["LCP", "INP", "CLS", "TTFB"] as const);

export function WebVitalsReporter() {
  const api = useMemo(() => new ProductApi(), []);
  useReportWebVitals((metric) => {
    if (!isAllowedMetric(metric.name) || !isAllowedRating(metric.rating)) return;
    void emitProductTelemetry(api, {
      name: "webVital",
      context: {
        metricName: metric.name,
        metricRating: metric.rating,
        metricValueBucket: valueBucket(metric.name, metric.value),
        viewportClass: viewportClass(),
      },
    });
  });
  return null;
}

function isAllowedMetric(value: string): value is "LCP" | "INP" | "CLS" | "TTFB" {
  return ALLOWED_METRICS.has(value as "LCP" | "INP" | "CLS" | "TTFB");
}

function isAllowedRating(
  value: string,
): value is "good" | "needs-improvement" | "poor" {
  return value === "good" || value === "needs-improvement" || value === "poor";
}

export function valueBucket(
  name: "LCP" | "INP" | "CLS" | "TTFB",
  value: number,
): "fast" | "moderate" | "slow" {
  const [good, poor] = {
    LCP: [2_500, 4_000],
    INP: [200, 500],
    CLS: [0.1, 0.25],
    TTFB: [800, 1_800],
  }[name];
  if (value <= good) return "fast";
  if (value <= poor) return "moderate";
  return "slow";
}
