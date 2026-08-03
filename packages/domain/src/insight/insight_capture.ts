import type { Insight } from './insight.js';

export const INSIGHT_CAPTURE_SOURCES = [
  'web',
  'chrome_extension',
  'ios_share',
  'android_share',
] as const;

export type InsightCaptureSource = (typeof INSIGHT_CAPTURE_SOURCES)[number];

export type InsightCaptureRequest = {
  source: InsightCaptureSource;
  title?: string;
  url: string;
};

export type InsightCaptureFailureReason =
  | 'invalid-request'
  | 'invalid-url'
  | 'permission-denied'
  | 'unsupported-protocol'
  | 'write-failed';

export type InsightCaptureResult =
  | { created: boolean; insight: Insight; ok: true }
  | { ok: false; reason: InsightCaptureFailureReason };

export type InsightCaptureService = {
  capture(request: InsightCaptureRequest): Promise<InsightCaptureResult>;
};

export function isInsightCaptureSource(
  value: unknown
): value is InsightCaptureSource {
  return (
    typeof value === 'string' &&
    INSIGHT_CAPTURE_SOURCES.some((source) => source === value)
  );
}
