import type { Insight } from './insight.js';
import { normalizeInsightUrl } from './normalize_insight_url.js';

const REQUIRED_STRING_FIELDS = [
  'id',
  'originalUrl',
  'normalizedUrl',
  'domain',
  'title',
  'titleOrigin',
  'createdAt',
  'updatedAt',
] as const;
const ISO_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/;

export function parseInsight(value: unknown): Insight | null {
  if (!hasInsightShape(value)) {
    return null;
  }

  if (![value.id, value.title, value.domain].every(hasText)) {
    return null;
  }

  const normalizedUrl = normalizeInsightUrl(value.originalUrl);

  if (
    !normalizedUrl.ok ||
    normalizedUrl.normalizedUrl !== value.normalizedUrl ||
    normalizedUrl.domain !== value.domain
  ) {
    return null;
  }

  const createdAt = parseIsoTimestamp(value.createdAt);
  const updatedAt = parseIsoTimestamp(value.updatedAt);

  if (createdAt === null || updatedAt === null || updatedAt < createdAt) {
    return null;
  }

  return value;
}

function hasInsightShape(value: unknown): value is Insight {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Partial<Record<keyof Insight, unknown>>;

  return (
    REQUIRED_STRING_FIELDS.every(
      (field) => typeof candidate[field] === 'string'
    ) &&
    isTitleOrigin(candidate.titleOrigin) &&
    isNullableString(candidate.memo) &&
    isNullableUuid(candidate.categoryId)
  );
}

function hasText(value: string) {
  return value.trim().length > 0;
}

function isNullableString(value: unknown) {
  return value === null || typeof value === 'string';
}

function isNullableUuid(value: unknown): value is string | null {
  return (
    value === null ||
    (typeof value === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        value
      ))
  );
}

function isTitleOrigin(value: unknown): value is Insight['titleOrigin'] {
  return (
    value === 'capture' ||
    value === 'fallback' ||
    value === 'metadata' ||
    value === 'user'
  );
}

function parseIsoTimestamp(value: string) {
  const match = ISO_TIMESTAMP_PATTERN.exec(value);

  if (match === null) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[7] === undefined ? 0 : Number(match[7]);
  const offsetMinute = match[8] === undefined ? 0 : Number(match[8]);

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > getDaysInMonth(year, month) ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 23 ||
    offsetMinute > 59
  ) {
    return null;
  }

  const timestamp = Date.parse(value);

  return Number.isFinite(timestamp) ? timestamp : null;
}

function getDaysInMonth(year: number, month: number) {
  const date = new Date(0);

  date.setUTCFullYear(year, month, 0);

  return date.getUTCDate();
}
