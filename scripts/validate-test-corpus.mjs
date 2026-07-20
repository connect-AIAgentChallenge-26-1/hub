import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { CORPUS_EXPECTED_SCHEMA_VERSION, safeParseCorpusExpectedV1 } from './corpus-expected-schema.mjs'

export const INDEX_PATH = 'test-corpus/index/notice_index.tsv'
const TEMPLATE_EXPECTED_PATH = 'test-corpus/templates/expected-result.example.json'
const TEMPLATE_EXTRACTED_PATH = 'test-corpus/templates/extracted-text.example.txt'
export const REQUIRED_COLUMNS = ['id','institution','notice_type','source_title','source_url','published_at','file_type','raw_file_path','extracted_text_path','expected_result_path','has_attachment','has_deadline','has_relative_date','has_vague_date','contains_personal_info','copyright_risk','notes']
const LEGACY_SECTIONS = ['deadlines','tasks','submissions','requirements','cautions','calendarEvents']
const NOTICE_TYPES = new Set(['school_notice','scholarship','assignment','competition','job_posting','ambiguous_date'])
const BOOLEAN_VALUES = new Set(['true','false'])
const COPYRIGHT_RISKS = new Set(['low','medium','high','unknown'])
const CATEGORY_MINIMUMS = new Map([['scholarship',3],['school_notice',3],['assignment',1],['competition',1],['job_posting',1],['ambiguous_date',1]])
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function plain(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) }
function validDate(value) {
  if (!DATE_RE.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0,10) === value
}
function read(file) { return fs.readFileSync(file, 'utf8') }
function add(context, message) { context.errors.push(message) }
function relativeInside(root, value) {
  if (!value || path.isAbsolute(value)) return false
  const resolved = path.resolve(root, value)
  const relative = path.relative(root, resolved)
  return relative.length > 0 && !relative.startsWith('..') && !path.isAbsolute(relative)
}
function existingFile(context, relativePath, label) {
  if (!relativeInside(context.rootDir, relativePath)) {
    add(context, `${label} must be a repository-relative path inside the repository: ${relativePath}`)
    return null
  }
  const absolute = path.resolve(context.rootDir, relativePath)
  if (!fs.existsSync(absolute)) {
    add(context, `${label} file does not exist: ${relativePath}`)
    return null
  }
  const real = fs.realpathSync(absolute)
  const relative = path.relative(context.realRootDir, real)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    add(context, `${label} resolves outside the repository: ${relativePath}`)
    return null
  }
  if (!fs.statSync(real).isFile()) {
    add(context, `${label} must reference a file: ${relativePath}`)
    return null
  }
  return absolute
}
function jsonFile(context, relativePath, label) {
  const absolute = existingFile(context, relativePath, label)
  if (!absolute) return null
  try { return JSON.parse(read(absolute)) }
  catch (error) { add(context, `${label} is not valid JSON: ${relativePath}: ${error.message}`); return null }
}
function classify(value) {
  if (!plain(value)) return 'invalid'
  if (!Object.hasOwn(value, 'schemaVersion')) return 'legacy'
  if (value.schemaVersion === CORPUS_EXPECTED_SCHEMA_VERSION) return 'v1'
  return 'unknown'
}
function validateLegacy(context, value, label) {
  if (!plain(value)) return add(context, `${label} must contain a top-level object.`)
  for (const field of ['id','sourceTitle','noticeType']) if (typeof value[field] !== 'string' || !value[field].trim()) add(context, `${label}.${field} must be a non-empty string.`)
  if (!plain(value.expected)) return add(context, `${label}.expected must be an object.`)
  for (const section of LEGACY_SECTIONS) if (!Array.isArray(value.expected[section])) add(context, `${label}.expected.${section} must be an array in legacy transition mode.`)
}
function validateV1Schema(context, value, label) {
  const result = safeParseCorpusExpectedV1(value)
  if (result.success) return true
  for (const issue of result.error.issues) add(context, `${label}${issue.path.slice(1)}: ${issue.message}`)
  return false
}
function exactEvidence(context, value, extractedText, label) {
  for (const section of ['items','calendarEventCandidates']) {
    for (const [index, assertion] of value.expected[section].entries()) {
      const prefix = `${label}.expected.${section}[${index}]`
      if (!extractedText.includes(assertion.evidence)) add(context, `${prefix}.evidence is not an exact substring of canonical extracted text.`)
      if (assertion.dateExpression !== null && !assertion.evidence.includes(assertion.dateExpression)) add(context, `${prefix}.dateExpression is not contained in its evidence.`)
    }
  }
}
function expectedPaths(row) {
  return {
    extracted: `test-corpus/extracted-text/${row.notice_type}/${row.id}.txt`,
    expected: `test-corpus/expected-results/${row.notice_type}/${row.id}.expected.json`,
  }
}
function validateRow(context, row, rowNumber, counts, seen) {
  if (!row.id) add(context, `Row ${rowNumber}: id is required.`)
  if (seen.ids.has(row.id)) add(context, `Row ${rowNumber}: duplicate id: ${row.id}`)
  seen.ids.add(row.id)
  if (!NOTICE_TYPES.has(row.notice_type)) add(context, `Row ${rowNumber}: unsupported notice_type: ${row.notice_type}`)
  if (!row.source_title) add(context, `Row ${rowNumber}: source_title is required.`)
  if (!row.source_url) add(context, `Row ${rowNumber}: source_url is required.`)
  if (!validDate(row.published_at)) add(context, `Row ${rowNumber}: published_at must be a valid YYYY-MM-DD date.`)
  for (const field of ['has_attachment','has_deadline','has_relative_date','has_vague_date','contains_personal_info']) if (!BOOLEAN_VALUES.has(row[field])) add(context, `Row ${rowNumber}: ${field} must be true or false.`)
  if (!COPYRIGHT_RISKS.has(row.copyright_risk)) add(context, `Row ${rowNumber}: unsupported copyright_risk: ${row.copyright_risk}`)
  const required = expectedPaths(row)
  if (row.extracted_text_path !== required.extracted) add(context, `Row ${rowNumber}: extracted_text_path must be ${required.extracted}`)
  if (row.expected_result_path !== required.expected) add(context, `Row ${rowNumber}: expected_result_path must be ${required.expected}`)
  if (seen.extracted.has(row.extracted_text_path)) add(context, `Row ${rowNumber}: duplicate extracted_text_path: ${row.extracted_text_path}`)
  if (seen.expected.has(row.expected_result_path)) add(context, `Row ${rowNumber}: duplicate expected_result_path: ${row.expected_result_path}`)
  seen.extracted.add(row.extracted_text_path); seen.expected.add(row.expected_result_path)
  const extractedPath = existingFile(context, row.extracted_text_path, `Row ${rowNumber}: extracted_text_path`)
  const expectedValue = jsonFile(context, row.expected_result_path, `Row ${rowNumber}: expected_result_path`)
  if (row.raw_file_path) existingFile(context, row.raw_file_path, `Row ${rowNumber}: raw_file_path`)
  if (!expectedValue) return
  const contract = classify(expectedValue)
  counts[contract] += 1
  if (contract === 'legacy') validateLegacy(context, expectedValue, `Row ${rowNumber}: expected_result_path`)
  else if (contract === 'unknown') add(context, `Row ${rowNumber}: unsupported expected schemaVersion: ${expectedValue.schemaVersion}`)
  else if (contract === 'invalid') add(context, `Row ${rowNumber}: expected_result_path must contain an object.`)
  else if (validateV1Schema(context, expectedValue, `Row ${rowNumber}: expected_result_path`)) {
    if (expectedValue.id !== row.id) add(context, `Row ${rowNumber}: expected id must equal index id.`)
    if (expectedValue.sourceTitle !== row.source_title) add(context, `Row ${rowNumber}: expected sourceTitle must equal index source_title.`)
    if (expectedValue.noticeType !== row.notice_type) add(context, `Row ${rowNumber}: expected noticeType must equal index notice_type.`)
    if (extractedPath) exactEvidence(context, expectedValue, read(extractedPath), `Row ${rowNumber}: expected_result_path`)
  }
}
function templateContract(context) {
  const value = jsonFile(context, TEMPLATE_EXPECTED_PATH, 'Template expected result')
  const extracted = existingFile(context, TEMPLATE_EXTRACTED_PATH, 'Template extracted text')
  if (!value) return 'invalid'
  const contract = classify(value)
  if (contract === 'legacy') validateLegacy(context, value, 'Template expected result')
  else if (contract === 'v1' && validateV1Schema(context, value, 'Template expected result') && extracted) exactEvidence(context, value, read(extracted), 'Template expected result')
  else if (contract === 'unknown') add(context, `Template expected result uses unsupported schemaVersion: ${value.schemaVersion}`)
  else if (contract === 'invalid') add(context, 'Template expected result must contain an object.')
  return contract
}
function state(counts, template) {
  const contracts = new Set()
  if (counts.legacy) contracts.add('legacy')
  if (counts.v1) contracts.add('v1')
  if (template === 'legacy' || template === 'v1') contracts.add(template)
  if (contracts.size > 1) return 'mixed'
  if (contracts.has('v1')) return 'v1'
  if (contracts.has('legacy')) return 'legacy_transition'
  return 'unresolved'
}

export function validateTestCorpus({ rootDir = process.cwd(), allowLegacy = false } = {}) {
  const absoluteRoot = path.resolve(rootDir)
  const context = { rootDir: absoluteRoot, realRootDir: fs.realpathSync(absoluteRoot), errors: [] }
  const counts = { legacy: 0, v1: 0, unknown: 0, invalid: 0 }
  const categories = new Map()
  const seen = { ids: new Set(), extracted: new Set(), expected: new Set() }
  const index = existingFile(context, INDEX_PATH, INDEX_PATH)
  let rows = []
  if (index) {
    const lines = read(index).replace(/\r\n/g, '\n').split('\n').filter((line, index, all) => line.length || index < all.length - 1)
    const columns = (lines[0] || '').split('\t')
    if (columns.join('\t') !== REQUIRED_COLUMNS.join('\t')) add(context, `${INDEX_PATH} header does not match required columns.`)
    rows = lines.slice(1).filter((line) => line.trim())
    rows.forEach((line, index) => {
      const values = line.split('\t')
      if (values.length !== REQUIRED_COLUMNS.length) return add(context, `Row ${index + 2}: expected ${REQUIRED_COLUMNS.length} tab-separated fields, got ${values.length}.`)
      const row = Object.fromEntries(REQUIRED_COLUMNS.map((column, columnIndex) => [column, values[columnIndex]]))
      categories.set(row.notice_type, (categories.get(row.notice_type) || 0) + 1)
      validateRow(context, row, index + 2, counts, seen)
    })
  }
  const template = templateContract(context)
  const contractState = state(counts, template)
  if (contractState === 'mixed') add(context, 'Legacy and v1 expected contracts must not coexist.')
  if (!allowLegacy && (counts.legacy || template === 'legacy')) add(context, `Strict v1 mode does not allow legacy expected files; found ${counts.legacy} real files${template === 'legacy' ? ' and a legacy template' : ''}.`)
  if (rows.length < 10) add(context, `Category baseline requires at least 10 indexed entries; found ${rows.length}.`)
  let categoryBaselinePassed = true
  for (const [type, minimum] of CATEGORY_MINIMUMS) if ((categories.get(type) || 0) < minimum) {
    categoryBaselinePassed = false
    add(context, `Category baseline requires at least ${minimum} ${type} entries; found ${categories.get(type) || 0}.`)
  }
  return {
    ok: context.errors.length === 0,
    errors: [...context.errors].sort(),
    stats: { indexedEntries: rows.length, legacyExpectedFiles: counts.legacy, v1ExpectedFiles: counts.v1, unknownExpectedFiles: counts.unknown, invalidExpectedFiles: counts.invalid, templateContract: template, contractState, categoryBaselinePassed },
  }
}

export function formatValidationSummary(result) {
  const lines = [
    `Indexed entries: ${result.stats.indexedEntries}`,
    `Contract state: ${result.stats.contractState}`,
    `Legacy expected files: ${result.stats.legacyExpectedFiles}`,
    `V1 expected files: ${result.stats.v1ExpectedFiles}`,
    `Template contract: ${result.stats.templateContract}`,
    `Category baseline: ${result.stats.categoryBaselinePassed ? 'passed' : 'failed'}`,
  ]
  return lines.join('\n')
}

const isCli = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
if (isCli) {
  const result = validateTestCorpus({ allowLegacy: process.argv.includes('--allow-legacy') })
  if (result.ok) console.log(`Test corpus validation passed.\n${formatValidationSummary(result)}`)
  else {
    console.error('Test corpus validation failed:')
    for (const error of result.errors) console.error(`- ${error}`)
    console.error(formatValidationSummary(result))
    process.exitCode = 1
  }
}
