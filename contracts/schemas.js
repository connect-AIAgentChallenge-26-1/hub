// Claim / Fact / Evidence / Citation typed contracts — mirrors the typed
// blocks in docs/skills.md "공통 데이터 계약". Each spec declares required
// fields plus their type/enum/pattern (and nested comparator shape), so a
// value with the right keys but wrong types no longer passes the contract.
// Changing a shape requires updating docs/skills.md in the same change
// (AGENTS.md "계약 변경은 문서 먼저").

export const SCHEMA_VERSIONS = Object.freeze({
  structured_claim: '1.0.0',
  financial_fact: '1.0.0',
  raw_source_record: '1.0.0',
  evidence: '1.0.0',
  numeric_evidence: '1.0.0',
})

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export const EVIDENCE_DOMAIN = Object.freeze([
  'financial',
  'market',
  'flow',
  'valuation',
  'peer',
])

export const EVIDENCE_RELATION = Object.freeze([
  'SUPPORTS',
  'REFUTES',
  'NEUTRAL',
  'CONFLICTS',
])

export const FS_DIV = Object.freeze(['CFS', 'OFS'])

// spec entry: { type, optional?, enum?, pattern?, patternLabel?, items?, fields? }
// type ∈ string | number | boolean | array | object | any

// docs/skills.md "Structured Claim" — comparator는 중첩 구조까지 강제한다.
export const STRUCTURED_CLAIM_SPEC = Object.freeze({
  claim_id: { type: 'string' },
  claim_group_id: { type: 'string', optional: true },
  original_span: { type: 'string' },
  corp_code: { type: 'string' },
  stock_code: { type: 'string' },
  claim_type: { type: 'string' },
  metric: { type: 'string' },
  evidence_domain: { type: 'string', enum: EVIDENCE_DOMAIN },
  comparison_entity_ref: { type: 'string', optional: true },
  peer_universe_ref: { type: 'string', optional: true },
  comparator: {
    type: 'object',
    fields: {
      op: { type: 'string' },
      target_value: { type: 'number' },
      target_unit: { type: 'string' },
      tolerance_value: { type: 'number', optional: true },
      tolerance_unit: { type: 'string', optional: true },
    },
  },
  direction: { type: 'string' },
  current_period: { type: 'string' },
  comparison_period: { type: 'string' },
  as_of: { type: 'string', pattern: DATE_PATTERN, patternLabel: 'YYYY-MM-DD' },
  verifiable: { type: 'boolean' },
  ambiguity_flags: { type: 'array', items: 'string' },
  condition: { type: 'string', optional: true },
})

// docs/skills.md "Financial Fact"
export const FINANCIAL_FACT_SPEC = Object.freeze({
  corp_code: { type: 'string' },
  stock_code: { type: 'string' },
  account_id: { type: 'string' },
  account_name: { type: 'string' },
  raw_value: { type: 'number' },
  raw_unit: { type: 'string' },
  normalized_value: { type: 'number' },
  normalized_unit: { type: 'string' },
  fiscal_period: { type: 'string' },
  reprt_code: { type: 'string' },
  report_type: { type: 'string' },
  fs_div: { type: 'string', enum: FS_DIV },
  is_cumulative: { type: 'boolean' },
  is_provisional: { type: 'boolean' },
  rcept_no: { type: 'string' },
  filed_at: { type: 'string' },
  source_url: { type: 'string' },
  collected_at: { type: 'string' },
})

// docs/skills.md "Raw Source Record" — provider 원문은 raw_payload에 그대로.
export const RAW_SOURCE_RECORD_SPEC = Object.freeze({
  raw_record_id: { type: 'string' },
  source_provider: { type: 'string' },
  source_url: { type: 'string', optional: true },
  source_native_id: { type: 'string', optional: true },
  corp_code: { type: 'string', optional: true },
  stock_code: { type: 'string', optional: true },
  published_at: { type: 'string', optional: true },
  revised_at: { type: 'string', optional: true },
  target_period: { type: 'string', optional: true },
  raw_payload: { type: 'object' },
  checksum: { type: 'string' },
  collected_at: { type: 'string' },
})

// docs/skills.md "Evidence" — claim_id/presentation_item_id 배타 규칙은
// validateEvidence가 spec 위에 추가로 강제한다.
export const EVIDENCE_SPEC = Object.freeze({
  evidence_id: { type: 'string' },
  corp_code: { type: 'string' },
  claim_id: { type: 'string', optional: true },
  presentation_item_id: { type: 'string', optional: true },
  evidence_type: { type: 'string' },
  document_id: { type: 'string' },
  rcept_no: { type: 'string' },
  filed_at: { type: 'string' },
  target_period: { type: 'string' },
  source_url: { type: 'string' },
  quote: { type: 'string' },
  chunk_offset: { type: 'number' },
  retrieval_score: { type: 'number' },
  relation: { type: 'string', enum: EVIDENCE_RELATION },
  relation_reason: { type: 'string' },
  relation_rule_version: { type: 'string' },
  integrity_status: { type: 'string' },
  as_of: { type: 'string', pattern: DATE_PATTERN, patternLabel: 'YYYY-MM-DD' },
})

// docs/skills.md "Numeric Evidence" — provenance는 문서가 구조를 정의하지
// 않으므로 존재만 요구한다(환각 금지: 문서에 없는 제약을 만들지 않는다).
export const NUMERIC_EVIDENCE_SPEC = Object.freeze({
  numeric_evidence_id: { type: 'string' },
  evidence_domain: { type: 'string', enum: EVIDENCE_DOMAIN },
  corp_code: { type: 'string' },
  comparison_entity_ref: { type: 'string', optional: true },
  peer_universe_ref: { type: 'string', optional: true },
  metric: { type: 'string' },
  value: { type: 'number' },
  unit: { type: 'string' },
  target_period: { type: 'string' },
  as_of: { type: 'string', pattern: DATE_PATTERN, patternLabel: 'YYYY-MM-DD' },
  formula: { type: 'string', optional: true },
  source_ids: { type: 'array', items: 'string' },
  provenance: { type: 'any' },
  integrity_status: { type: 'string' },
})

// Citation is not a standalone type in skills.md — it is the subset of
// Evidence fields S20 (Citation Integrity) checks against source text.
export const CITATION_SPEC = Object.freeze({
  evidence_id: { type: 'string' },
  quote: { type: 'string' },
  source_url: { type: 'string' },
  chunk_offset: { type: 'number' },
  integrity_status: { type: 'string' },
  as_of: { type: 'string', pattern: DATE_PATTERN, patternLabel: 'YYYY-MM-DD' },
})

function typeOf(value) {
  if (Array.isArray(value)) return 'array'
  if (value === null) return 'null'
  return typeof value
}

function checkField(path, entry, value, errors) {
  if (entry.type !== 'any' && typeOf(value) !== entry.type) {
    errors.push(`${path} must be a ${entry.type}`)
    return
  }
  if (entry.enum && !entry.enum.includes(value)) {
    errors.push(`${path} must be one of ${entry.enum.join(', ')}`)
  }
  if (entry.pattern && !entry.pattern.test(value)) {
    errors.push(`${path} must match ${entry.patternLabel}`)
  }
  if (entry.items && Array.isArray(value)) {
    for (const [i, item] of value.entries()) {
      if (typeOf(item) !== entry.items) {
        errors.push(`${path}[${i}] must be a ${entry.items}`)
      }
    }
  }
  if (entry.fields) {
    validateInto(path, entry.fields, value, errors)
  }
}

function validateInto(prefix, spec, obj, errors) {
  for (const [field, entry] of Object.entries(spec)) {
    const path = prefix ? `${prefix}.${field}` : field
    if (!(field in obj) || obj[field] === undefined) {
      if (!entry.optional) errors.push(`missing required field: ${path}`)
      continue
    }
    checkField(path, entry, obj[field], errors)
  }
}

/**
 * Validates a value against a typed spec (required fields, types, enums,
 * date patterns, nested shapes). Returns { valid, errors[] } instead of
 * throwing so tests can assert on the full error set at once.
 */
export function validateShape(spec, obj) {
  if (obj === null || typeOf(obj) !== 'object') {
    return { valid: false, errors: ['value must be an object'] }
  }
  const errors = []
  validateInto('', spec, obj, errors)
  return { valid: errors.length === 0, errors }
}

/**
 * Evidence carries exactly one of claim_id (기능 C 검증 근거) or
 * presentation_item_id (기능 A provenance), never both, never neither
 * (docs/skills.md "claim_id와 presentation_item_id 중 정확히 하나가 필수다").
 */
export function validateEvidence(evidence) {
  const { errors: shapeErrors } = validateShape(EVIDENCE_SPEC, evidence)
  const errors = [...shapeErrors]

  if (evidence && typeof evidence === 'object') {
    const hasClaimId = evidence.claim_id !== undefined && evidence.claim_id !== null
    const hasPresentationId =
      evidence.presentation_item_id !== undefined && evidence.presentation_item_id !== null

    if (hasClaimId === hasPresentationId) {
      errors.push(
        'exactly one of claim_id or presentation_item_id is required, not both or neither',
      )
    }
  }

  return { valid: errors.length === 0, errors }
}
