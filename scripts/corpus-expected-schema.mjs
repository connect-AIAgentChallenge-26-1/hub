export const CORPUS_EXPECTED_SCHEMA_VERSION = 'noticepilot.corpus.expected.v1'

const NOTICE_TYPES = new Set(['school_notice', 'scholarship', 'assignment', 'competition', 'job_posting', 'ambiguous_date'])
const ITEM_KINDS = new Set(['deadline', 'task', 'submission', 'requirement', 'caution'])
const EVENT_TYPES = new Set(['deadline', 'start', 'end', 'announcement', 'meeting', 'other'])
const TOP_KEYS = ['schemaVersion', 'id', 'sourceTitle', 'noticeType', 'expected']
const EXPECTED_KEYS = ['items', 'calendarEventCandidates']
const ITEM_KEYS = ['assertionId', 'kind', 'title', 'dateExpression', 'normalizedDate', 'evidence', 'reviewRequired']
const CANDIDATE_KEYS = ['assertionId', 'title', 'eventType', 'dateExpression', 'normalizedDate', 'evidence', 'reviewRequired']
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /(?:^|\D)(?:[01]\d|2[0-3]):[0-5]\d(?:\D|$)/
const UNRESOLVED_RE = /예정|추후\s*공지|별도\s*안내|작업\s*완료\s*시까지|\bTBD\b|\bto be announced\b|\btentative\b|\buntil completion\b/iu

function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function validDate(value) {
  if (!DATE_RE.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function add(issues, path, message) {
  issues.push({ path: path ? `$.${path}` : '$', message })
}

function exactKeys(value, allowed, path, issues) {
  for (const key of allowed) if (!Object.hasOwn(value, key)) add(issues, path ? `${path}.${key}` : key, 'Required key is missing.')
  for (const key of Object.keys(value)) if (!allowed.includes(key)) add(issues, path ? `${path}.${key}` : key, 'Unknown key is not allowed.')
}

function text(value, path, issues, { trimmed = false, nullable = false } = {}) {
  if (nullable && value === null) return
  if (typeof value !== 'string' || value.trim().length === 0) return add(issues, path, 'Expected a non-empty string.')
  if (trimmed && value !== value.trim()) add(issues, path, 'Expected a trimmed string.')
}

function date(value, path, issues) {
  if (value !== null && (typeof value !== 'string' || !validDate(value))) add(issues, path, 'Expected a valid YYYY-MM-DD date or null.')
}

function assertionBase(value, path, allowedKeys, issues) {
  if (!plain(value)) {
    add(issues, path, 'Expected an object.')
    return false
  }
  exactKeys(value, allowedKeys, path, issues)
  text(value.assertionId, `${path}.assertionId`, issues, { trimmed: true })
  text(value.title, `${path}.title`, issues, { trimmed: true })
  text(value.dateExpression, `${path}.dateExpression`, issues, { nullable: true })
  date(value.normalizedDate, `${path}.normalizedDate`, issues)
  text(value.evidence, `${path}.evidence`, issues)
  if (typeof value.reviewRequired !== 'boolean') add(issues, `${path}.reviewRequired`, 'Expected a boolean.')
  if (value.normalizedDate !== null && value.dateExpression === null) add(issues, `${path}.dateExpression`, 'A normalized date requires a source date expression.')
  const needsReview = value.dateExpression !== null && (value.normalizedDate === null || TIME_RE.test(value.dateExpression) || UNRESOLVED_RE.test(value.dateExpression))
  if (value.reviewRequired === false && needsReview) add(issues, `${path}.reviewRequired`, 'Timed, tentative, or unresolved date expressions require review.')
  return true
}

function duplicateChecks(expected, issues) {
  const ids = new Map()
  for (const [name, typeKey] of [['items', 'kind'], ['calendarEventCandidates', 'eventType']]) {
    const signatures = new Map()
    if (!Array.isArray(expected[name])) continue
    expected[name].forEach((value, index) => {
      if (!plain(value)) return
      const path = `expected.${name}.${index}`
      if (typeof value.assertionId === 'string') {
        if (ids.has(value.assertionId)) add(issues, `${path}.assertionId`, `Duplicate assertionId; first used at ${ids.get(value.assertionId)}.`)
        else ids.set(value.assertionId, `$.${path}.assertionId`)
      }
      const signature = JSON.stringify([value[typeKey], value.title, value.dateExpression, value.normalizedDate, value.evidence, value.reviewRequired])
      if (signatures.has(signature)) add(issues, path, `Exact duplicate semantic assertion; first used at ${signatures.get(signature)}.`)
      else signatures.set(signature, `$.${path}`)
    })
  }
}

export function safeParseCorpusExpectedV1(value) {
  const issues = []
  if (!plain(value)) add(issues, '', 'Expected a top-level object.')
  else {
    exactKeys(value, TOP_KEYS, '', issues)
    if (value.schemaVersion !== CORPUS_EXPECTED_SCHEMA_VERSION) add(issues, 'schemaVersion', `Expected schemaVersion ${CORPUS_EXPECTED_SCHEMA_VERSION}.`)
    text(value.id, 'id', issues, { trimmed: true })
    text(value.sourceTitle, 'sourceTitle', issues, { trimmed: true })
    if (!NOTICE_TYPES.has(value.noticeType)) add(issues, 'noticeType', 'Unsupported corpus notice type.')
    if (!plain(value.expected)) add(issues, 'expected', 'Expected an object.')
    else {
      exactKeys(value.expected, EXPECTED_KEYS, 'expected', issues)
      if (!Array.isArray(value.expected.items)) add(issues, 'expected.items', 'Expected an array.')
      else value.expected.items.forEach((item, index) => {
        const path = `expected.items.${index}`
        if (assertionBase(item, path, ITEM_KEYS, issues) && !ITEM_KINDS.has(item.kind)) add(issues, `${path}.kind`, 'Unsupported item kind.')
      })
      if (!Array.isArray(value.expected.calendarEventCandidates)) add(issues, 'expected.calendarEventCandidates', 'Expected an array.')
      else value.expected.calendarEventCandidates.forEach((candidate, index) => {
        const path = `expected.calendarEventCandidates.${index}`
        if (assertionBase(candidate, path, CANDIDATE_KEYS, issues) && !EVENT_TYPES.has(candidate.eventType)) add(issues, `${path}.eventType`, 'Unsupported calendar-event type.')
      })
      duplicateChecks(value.expected, issues)
    }
  }
  return issues.length ? { success: false, error: { issues } } : { success: true, data: value }
}

export function parseCorpusExpectedV1(value) {
  const result = safeParseCorpusExpectedV1(value)
  if (!result.success) {
    const error = new Error('Corpus expected truth failed validation.')
    error.issues = result.error.issues
    throw error
  }
  return result.data
}

export const CorpusExpectedV1Schema = Object.freeze({ parse: parseCorpusExpectedV1, safeParse: safeParseCorpusExpectedV1 })
