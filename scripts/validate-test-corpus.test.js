import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { safeParseCorpusExpectedV1 } from './corpus-expected-schema.mjs'
import { REQUIRED_COLUMNS, validateTestCorpus } from './validate-test-corpus.mjs'

const CATEGORIES = ['scholarship','scholarship','scholarship','school_notice','school_notice','school_notice','assignment','competition','job_posting','ambiguous_date']

function v1(id, type, evidence = 'Deadline: 2026-07-20') {
  return {
    schemaVersion: 'noticepilot.corpus.expected.v1', id, sourceTitle: `Title ${id}`, noticeType: type,
    expected: {
      items: [{ assertionId: `${id}-deadline`, kind: 'deadline', title: 'Deadline', dateExpression: '2026-07-20', normalizedDate: '2026-07-20', evidence, reviewRequired: false }],
      calendarEventCandidates: [{ assertionId: `${id}-candidate`, title: 'Deadline', eventType: 'deadline', dateExpression: '2026-07-20', normalizedDate: '2026-07-20', evidence, reviewRequired: false }],
    },
  }
}
function legacy(id, type) {
  return { id, sourceTitle: `Title ${id}`, noticeType: type, expected: { deadlines: [], tasks: [], submissions: [], requirements: [], cautions: [], calendarEvents: [] } }
}
function fixture(contract = 'v1', templateContract = contract) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'noticepilot-corpus-'))
  fs.mkdirSync(path.join(root, 'test-corpus/index'), { recursive: true })
  fs.mkdirSync(path.join(root, 'test-corpus/templates'), { recursive: true })
  const rows = []
  CATEGORIES.forEach((type, index) => {
    const id = `entry-${String(index + 1).padStart(2, '0')}`
    const extracted = `test-corpus/extracted-text/${type}/${id}.txt`
    const expected = `test-corpus/expected-results/${type}/${id}.expected.json`
    fs.mkdirSync(path.dirname(path.join(root, extracted)), { recursive: true })
    fs.mkdirSync(path.dirname(path.join(root, expected)), { recursive: true })
    fs.writeFileSync(path.join(root, extracted), 'Deadline: 2026-07-20\n')
    fs.writeFileSync(path.join(root, expected), `${JSON.stringify(contract === 'v1' ? v1(id, type) : legacy(id, type), null, 2)}\n`)
    rows.push([id,'KNU',type,`Title ${id}`,'https://example.edu/notice','2026-07-01','html','',extracted,expected,'false','true','false',type === 'ambiguous_date' ? 'true' : 'false','false','low','fixture'].join('\t'))
  })
  fs.writeFileSync(path.join(root, 'test-corpus/index/notice_index.tsv'), `${REQUIRED_COLUMNS.join('\t')}\n${rows.join('\n')}\n`)
  fs.writeFileSync(path.join(root, 'test-corpus/templates/extracted-text.example.txt'), 'Deadline: 2026-07-20\n')
  const template = templateContract === 'v1' ? v1('example-001', 'scholarship') : legacy('example-001', 'scholarship')
  fs.writeFileSync(path.join(root, 'test-corpus/templates/expected-result.example.json'), `${JSON.stringify(template, null, 2)}\n`)
  return root
}
function mutateFirst(root, mutator) {
  const file = path.join(root, 'test-corpus/expected-results/scholarship/entry-01.expected.json')
  const value = JSON.parse(fs.readFileSync(file, 'utf8'))
  mutator(value)
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}

test('strict v1 schema accepts valid assertions', () => {
  assert.equal(safeParseCorpusExpectedV1(v1('entry-01', 'scholarship')).success, true)
})

test('strict v1 schema rejects unknown keys, enums, invalid dates, and empty sentinels', () => {
  const value = v1('entry-01', 'scholarship')
  value.extra = true
  value.expected.items[0].kind = 'unknown'
  value.expected.items[0].normalizedDate = ''
  const result = safeParseCorpusExpectedV1(value)
  assert.equal(result.success, false)
  assert.equal(result.error.issues.some((issue) => issue.message.includes('Unknown key')), true)
  assert.equal(result.error.issues.some((issue) => issue.message.includes('Unsupported item kind')), true)
  assert.equal(result.error.issues.some((issue) => issue.message.includes('YYYY-MM-DD')), true)
})

test('timed, tentative, and unresolved expressions require review', () => {
  for (const expression of ['2026-07-20 18:00', '2026-07-20 예정', '작업 완료 시까지']) {
    const value = v1('entry-01', 'scholarship', expression)
    value.expected.items[0].dateExpression = expression
    value.expected.items[0].normalizedDate = expression === '작업 완료 시까지' ? null : '2026-07-20'
    value.expected.items[0].reviewRequired = false
    assert.equal(safeParseCorpusExpectedV1(value).success, false, expression)
  }
})

test('atemporal requirement may remain unreviewed', () => {
  const value = v1('entry-01', 'scholarship')
  value.expected.items = [{ assertionId: 'requirement-001', kind: 'requirement', title: 'Eligibility', dateExpression: null, normalizedDate: null, evidence: 'Current students only', reviewRequired: false }]
  value.expected.calendarEventCandidates = []
  assert.equal(safeParseCorpusExpectedV1(value).success, true)
})

test('duplicate assertion IDs and semantic duplicates fail', () => {
  const value = v1('entry-01', 'scholarship')
  value.expected.items.push({ ...value.expected.items[0], assertionId: 'different-id' })
  value.expected.calendarEventCandidates[0].assertionId = value.expected.items[0].assertionId
  const result = safeParseCorpusExpectedV1(value)
  assert.equal(result.success, false)
  assert.equal(result.error.issues.some((issue) => issue.message.includes('Duplicate assertionId')), true)
  assert.equal(result.error.issues.some((issue) => issue.message.includes('duplicate semantic assertion')), true)
})

test('legacy corpus passes only in explicit transition mode', () => {
  const root = fixture('legacy', 'legacy')
  assert.equal(validateTestCorpus({ rootDir: root, allowLegacy: true }).ok, true)
  const strict = validateTestCorpus({ rootDir: root })
  assert.equal(strict.ok, false)
  assert.equal(strict.stats.legacyExpectedFiles, 10)
})

test('strict v1 corpus passes identity, evidence, template, and category checks', () => {
  const result = validateTestCorpus({ rootDir: fixture('v1', 'v1') })
  assert.equal(result.ok, true, result.errors.join('\n'))
  assert.deepEqual(result.stats, { indexedEntries: 10, legacyExpectedFiles: 0, v1ExpectedFiles: 10, unknownExpectedFiles: 0, invalidExpectedFiles: 0, templateContract: 'v1', contractState: 'v1', categoryBaselinePassed: true })
})

test('mixed legacy and v1 state fails closed', () => {
  const result = validateTestCorpus({ rootDir: fixture('legacy', 'v1'), allowLegacy: true })
  assert.equal(result.ok, false)
  assert.equal(result.stats.contractState, 'mixed')
})

test('unknown schema version and evidence mismatch fail closed', () => {
  const root = fixture('v1', 'v1')
  mutateFirst(root, (value) => { value.schemaVersion = 'noticepilot.corpus.expected.v999' })
  let result = validateTestCorpus({ rootDir: root, allowLegacy: true })
  assert.equal(result.ok, false)
  assert.equal(result.stats.unknownExpectedFiles, 1)
  const root2 = fixture('v1', 'v1')
  mutateFirst(root2, (value) => { value.expected.items[0].evidence = 'Paraphrased evidence'; value.expected.items[0].dateExpression = null; value.expected.items[0].normalizedDate = null })
  result = validateTestCorpus({ rootDir: root2 })
  assert.equal(result.ok, false)
  assert.equal(result.errors.some((error) => error.includes('not an exact substring')), true)
})

test('index identity and path traversal mismatches fail', () => {
  const root = fixture('v1', 'v1')
  mutateFirst(root, (value) => { value.sourceTitle = 'Different title' })
  const index = path.join(root, 'test-corpus/index/notice_index.tsv')
  const lines = fs.readFileSync(index, 'utf8').trimEnd().split('\n')
  const fields = lines[1].split('\t')
  fields[REQUIRED_COLUMNS.indexOf('extracted_text_path')] = '../outside.txt'
  lines[1] = fields.join('\t')
  fs.writeFileSync(index, `${lines.join('\n')}\n`)
  const result = validateTestCorpus({ rootDir: root })
  assert.equal(result.ok, false)
  assert.equal(result.errors.some((error) => error.includes('sourceTitle must equal')), true)
  assert.equal(result.errors.some((error) => error.includes('repository-relative path inside')), true)
})
