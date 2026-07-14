#!/usr/bin/env node
// I9 골든 평가 하네스 CLI — docs/skills.md "I9 골든 평가 하네스 계약".
// 사용법: node eval/run.js [--environment dev|staging|production]
//
// 종료 코드: 0 = 통과, 1 = 하나 이상의 metric이 threshold를 벗어남,
// 2 = harness 자체 결함(threshold 누락·dataset schema 위반·registry 위반·
// fixture checksum drift·scorer 예외) — docs/skills.md "harness smoke test".
// 이 구분은 "항상 통과하는 게이트를 만들지 않는다"(docs/harness.md 설계 원칙
// 3)는 원칙을 "결과가 나쁘다"와 "게이트 자체가 고장났다"로 더 세분화한다.

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  validateGoldenDataset,
  validateThresholdRegistry,
  validateThresholdChangeApproval,
  checkCompatibility,
} from './schema.js'
import { CATEGORY_METRICS, aggregateCategory } from './scorers.js'
import { buildReport, evaluateMetric, regressionDiff } from './report.js'

const EVAL_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(EVAL_DIR, '..')
const REPORTS_DIR = join(EVAL_DIR, 'reports')
const LATEST_REPORT_PATH = join(REPORTS_DIR, 'latest.json')
const HISTORY_DIR = join(REPORTS_DIR, 'history')

export class HarnessError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

export function loadDataset(path = join(EVAL_DIR, 'golden-v1.json')) {
  const dataset = readJson(path)
  const { valid, errors } = validateGoldenDataset(dataset)
  if (!valid) {
    throw new HarnessError('INVALID_DATASET', `golden dataset is invalid:\n- ${errors.join('\n- ')}`)
  }
  return dataset
}

export function loadRegistry(path = join(EVAL_DIR, 'thresholds-v1.json')) {
  const registry = readJson(path)
  const { valid, errors } = validateThresholdRegistry(registry)
  if (!valid) {
    throw new HarnessError('INVALID_THRESHOLD_REGISTRY', `threshold registry is invalid:\n- ${errors.join('\n- ')}`)
  }
  return registry
}

export function verifyFixtureManifest(path = join(EVAL_DIR, 'fixtures-manifest.json')) {
  const manifest = readJson(path)
  const mismatches = []
  for (const [provider, entry] of Object.entries(manifest.providers)) {
    if (entry.status !== 'AVAILABLE') continue
    for (const fixture of entry.fixtures) {
      const fullPath = join(REPO_ROOT, fixture.fixture_path)
      if (!existsSync(fullPath)) {
        mismatches.push(`${provider}: ${fixture.fixture_path} does not exist`)
        continue
      }
      const actual = createHash('sha256').update(readFileSync(fullPath)).digest('hex')
      if (actual !== fixture.checksum) {
        mismatches.push(`${provider}: ${fixture.fixture_path} checksum drifted (expected ${fixture.checksum}, got ${actual})`)
      }
    }
  }
  if (mismatches.length > 0) {
    throw new HarnessError('FIXTURE_CHECKSUM_MISMATCH', `record/replay fixture drift detected:\n- ${mismatches.join('\n- ')}`)
  }
  return manifest
}

export function scoreDataset(dataset, registry, environment) {
  const casesByCategory = new Map()
  for (const kase of dataset.cases) {
    if (!casesByCategory.has(kase.category)) casesByCategory.set(kase.category, [])
    casesByCategory.get(kase.category).push(kase)
  }

  const results = []
  for (const category of Object.keys(CATEGORY_METRICS)) {
    const cases = casesByCategory.get(category) ?? []
    if (cases.length === 0) continue

    let metricRows
    try {
      metricRows = aggregateCategory(category, cases)
    } catch (cause) {
      throw new HarnessError('SCORER_ERROR', `scorer for category "${category}" threw: ${cause.message}`)
    }

    for (const row of metricRows) {
      try {
        results.push(evaluateMetric({ ...row, category }, registry, environment))
      } catch (cause) {
        throw new HarnessError(cause.code ?? 'MISSING_THRESHOLD', cause.message)
      }
    }
  }
  return results
}

function loadPreviousReport() {
  if (!existsSync(LATEST_REPORT_PATH)) return null
  return readJson(LATEST_REPORT_PATH)
}

function persistReport(report) {
  mkdirSync(HISTORY_DIR, { recursive: true })
  const historyPath = join(
    HISTORY_DIR,
    `${report.dataset_version}__${report.thresholds_version}__${report.generated_at.replace(/[:.]/g, '-')}.json`,
  )
  writeFileSync(historyPath, JSON.stringify(report, null, 2) + '\n')
  writeFileSync(LATEST_REPORT_PATH, JSON.stringify(report, null, 2) + '\n')
}

export function runEval({
  environment = process.env.EVAL_ENVIRONMENT ?? 'dev',
  datasetPath,
  registryPath,
  manifestPath,
  skipFixtureCheck = false,
} = {}) {
  const dataset = loadDataset(datasetPath)
  const registry = loadRegistry(registryPath)

  const { valid: compatible, errors: compatErrors } = checkCompatibility(dataset, registry)
  if (!compatible) {
    throw new HarnessError('DATASET_THRESHOLD_MISMATCH', compatErrors.join('; '))
  }

  if (!skipFixtureCheck) verifyFixtureManifest(manifestPath)

  const results = scoreDataset(dataset, registry, environment)
  const report = buildReport({
    datasetVersion: dataset.dataset_version,
    thresholdsVersion: registry.thresholds_version,
    environment,
    results,
    generatedAt: new Date().toISOString(),
  })

  const previous = loadPreviousReport()
  report.regression = regressionDiff(report, previous)

  return report
}

const THRESHOLD_REGISTRY_GIT_PATH = 'eval/thresholds-v1.json'

/**
 * Best-effort: reads the last *committed* threshold registry via git so
 * validateThresholdChangeApproval() has something to diff the working-tree
 * registry against. Returns null (skip the check, do not fail the harness)
 * when there is no git repo, no commit yet, or the file is new — those are
 * infrastructure states unrelated to whether this registry's own content is
 * valid, and docs/harness.md 설계 원칙 3 forbids letting the gate be flaky.
 */
export function loadPreviousRegistryFromGit() {
  try {
    const raw = execFileSync('git', ['show', `HEAD:${THRESHOLD_REGISTRY_GIT_PATH}`], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function main() {
  const args = process.argv.slice(2)
  const envFlagIndex = args.indexOf('--environment')
  const environment = envFlagIndex >= 0 ? args[envFlagIndex + 1] : undefined

  try {
    const previousRegistry = loadPreviousRegistryFromGit()
    if (previousRegistry) {
      const currentRegistry = loadRegistry()
      const { valid, errors } = validateThresholdChangeApproval(previousRegistry, currentRegistry)
      if (!valid) {
        throw new HarnessError(
          'THRESHOLD_CHANGE_NOT_APPROVED',
          `threshold registry change vs last commit is not approved:\n- ${errors.join('\n- ')}`,
        )
      }
    }

    const report = runEval({ environment })
    persistReport(report)

    console.log(`I9 eval: ${report.dataset_version} / ${report.thresholds_version} / ${report.environment}`)
    for (const r of report.results) {
      console.log(`  ${r.pass ? 'PASS' : 'FAIL'} ${r.metric} = ${r.value} (${r.reason})`)
    }
    const regressed = report.regression.filter((r) => r.regressed)
    if (regressed.length > 0) {
      console.log(`  regressions vs previous run: ${regressed.map((r) => r.metric).join(', ')}`)
    }

    if (!report.overall_pass) {
      console.error(`I9 eval FAILED: ${report.blocking_failures.join(', ')}`)
      process.exit(1)
    }
    console.log('I9 eval passed')
  } catch (err) {
    if (err instanceof HarnessError) {
      console.error(`I9 harness error [${err.code}]: ${err.message}`)
      process.exit(2)
    }
    throw err
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
