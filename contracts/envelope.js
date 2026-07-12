// Envelope<T> contract — mirrors docs/skills.md "공통 데이터 계약".
// This module is the executable counterpart of that prose contract so C0
// can carry a real contract test instead of documentation alone.

export const ENVELOPE_SCHEMA_VERSION = '1.0.0'

export const ENVELOPE_STATUS = Object.freeze([
  'SUCCESS',
  'PARTIAL_SUCCESS',
  'VALIDATION_ERROR',
  'AUTHENTICATION_ERROR',
  'AUTHORIZATION_ERROR',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'EXTERNAL_ERROR',
  'INTERNAL_ERROR',
])

const NON_ERROR_STATUS = new Set(['SUCCESS', 'PARTIAL_SUCCESS'])

// docs/skills.md의 envelope 블록에서 ?가 없는 필드 전부. source_ids[]는
// 외부 출처가 없어도 빈 배열로 항상 존재해야 한다.
const REQUIRED_FIELDS = [
  'schema_version',
  'request_id',
  'trace_id',
  'as_of',
  'status',
  'warnings',
  'source_ids',
  'model_or_rule_version',
  'started_at',
  'completed_at',
]

const STRING_FIELDS = ['schema_version', 'request_id', 'trace_id', 'model_or_rule_version']

const TIMESTAMP_FIELDS = ['started_at', 'completed_at']

const AS_OF_PATTERN = /^\d{4}-\d{2}-\d{2}$/

// 정규식은 "0000-00-00" 같은 자릿수만 맞는 값도 통과시킨다. 실제 달력에 존재하는
// 날짜인지까지 검사해야 Python(Pydantic date) 미러와 동일한 강도로 거부한다.
function isCalendarDate(value) {
  if (!AS_OF_PATTERN.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(y, m - 1, d))
  return (
    parsed.getUTCFullYear() === y && parsed.getUTCMonth() === m - 1 && parsed.getUTCDate() === d
  )
}

function isTimestamp(value) {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value))
}

/**
 * Validates an envelope object against the common contract.
 * Returns { valid, errors[] } instead of throwing so callers (unit tests,
 * future backend contract tests) can assert on the full error set at once.
 */
export function validateEnvelope(envelope) {
  const errors = []

  if (envelope === null || typeof envelope !== 'object') {
    return { valid: false, errors: ['envelope must be an object'] }
  }

  for (const field of REQUIRED_FIELDS) {
    if (!(field in envelope)) {
      errors.push(`missing required field: ${field}`)
    }
  }

  if ('warnings' in envelope) {
    if (!Array.isArray(envelope.warnings)) {
      errors.push('warnings must be an array')
    } else if (envelope.warnings.some((w) => typeof w !== 'string')) {
      errors.push('warnings items must be strings')
    }
  }

  if ('status' in envelope && !ENVELOPE_STATUS.includes(envelope.status)) {
    errors.push(`status must be one of ${ENVELOPE_STATUS.join(', ')}`)
  }

  for (const field of STRING_FIELDS) {
    if (field in envelope && typeof envelope[field] !== 'string') {
      errors.push(`${field} must be a string`)
    }
  }

  // 문자열이 아닌 as_of(숫자 등)와 자릿수만 맞고 실존하지 않는 날짜(2월 30일 등)
  // 모두 계약 위반이다 — Python Pydantic(date) 미러와 동일한 강도로 거부한다.
  if (
    'as_of' in envelope &&
    (typeof envelope.as_of !== 'string' || !isCalendarDate(envelope.as_of))
  ) {
    errors.push('as_of must be a valid YYYY-MM-DD calendar date string')
  }

  for (const field of TIMESTAMP_FIELDS) {
    if (field in envelope && !isTimestamp(envelope[field])) {
      errors.push(`${field} must be a parseable timestamp string`)
    }
  }

  if (
    'status' in envelope &&
    ENVELOPE_STATUS.includes(envelope.status) &&
    !NON_ERROR_STATUS.has(envelope.status) &&
    !envelope.reason_code
  ) {
    errors.push('reason_code is required when status is not SUCCESS/PARTIAL_SUCCESS')
  }

  if ('source_ids' in envelope) {
    if (!Array.isArray(envelope.source_ids)) {
      errors.push('source_ids must be an array when present')
    } else if (envelope.source_ids.some((id) => typeof id !== 'string')) {
      errors.push('source_ids items must be strings')
    }
  }

  return { valid: errors.length === 0, errors }
}
