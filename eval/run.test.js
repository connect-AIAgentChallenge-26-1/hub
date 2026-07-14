import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  HarnessError,
  loadDataset,
  loadRegistry,
  loadPreviousRegistryFromGit,
  runEval,
  verifyFixtureManifest,
} from './run.js'
import goldenV1 from './golden-v1.json' with { type: 'json' }
import thresholdsV1 from './thresholds-v1.json' with { type: 'json' }

// docs/checklist.md C12-A "threshold 누락·dataset schema 실패·scorer 오류 시
// CI를 차단하는 harness smoke test" — 여기서는 실 golden-v1.json/thresholds-v1.json을
// 건드리지 않고 임시 디렉터리에 고의로 깨뜨린 사본을 만들어 각 결함이
// 실제로 non-recoverable HarnessError로 이어짐을 증명한다 (docs/harness.md H7과
// 동일한 red→green 증거를 자동화한 것).

let tmpDirs = []

function tmpFile(name, content) {
  const dir = mkdtempSync(join(tmpdir(), 'i9-eval-'))
  tmpDirs.push(dir)
  const path = join(dir, name)
  writeFileSync(path, JSON.stringify(content, null, 2))
  return path
}

afterEach(() => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true })
  tmpDirs = []
})

describe('I9 harness smoke test — CI 차단력', () => {
  it('the bundled golden dataset + threshold registry actually run end to end and pass', () => {
    const report = runEval({ environment: 'dev' })
    expect(report.overall_pass).toBe(true)
    expect(report.blocking_failures).toEqual([])
  })

  it('INVALID_DATASET: a dataset missing a required coverage tag blocks before scoring', () => {
    const brokenDataset = {
      ...goldenV1,
      cases: goldenV1.cases.filter((c) => !c.tags.includes('unit_confusion')),
    }
    const datasetPath = tmpFile('golden.json', brokenDataset)
    expect(() => loadDataset(datasetPath)).toThrow(HarnessError)
    try {
      loadDataset(datasetPath)
    } catch (err) {
      expect(err.code).toBe('INVALID_DATASET')
    }
  })

  it('INVALID_THRESHOLD_REGISTRY: a registry without change_log blocks before scoring', () => {
    const brokenRegistry = { ...thresholdsV1, change_log: [] }
    const registryPath = tmpFile('thresholds.json', brokenRegistry)
    try {
      loadRegistry(registryPath)
      throw new Error('expected loadRegistry to throw')
    } catch (err) {
      expect(err).toBeInstanceOf(HarnessError)
      expect(err.code).toBe('INVALID_THRESHOLD_REGISTRY')
    }
  })

  it('MISSING_THRESHOLD: a registry missing a scored metric blocks the run', () => {
    // eslint-disable-next-line no-unused-vars -- destructured only to drop this key
    const { extraction_precision, ...rest } = thresholdsV1.metrics
    const registryPath = tmpFile('thresholds.json', { ...thresholdsV1, metrics: rest })
    try {
      runEval({ registryPath, skipFixtureCheck: true })
      throw new Error('expected runEval to throw')
    } catch (err) {
      expect(err).toBeInstanceOf(HarnessError)
      expect(err.code).toBe('MISSING_THRESHOLD')
    }
  })

  it('SCORER_ERROR: a case with an invalid operation is not silently skipped', () => {
    const brokenDataset = {
      ...goldenV1,
      cases: goldenV1.cases.map((c) =>
        c.id === 'nc-01' ? { ...c, input: { operation: 'not_a_real_operation' } } : c,
      ),
    }
    const datasetPath = tmpFile('golden.json', brokenDataset)
    try {
      runEval({ datasetPath, skipFixtureCheck: true })
      throw new Error('expected runEval to throw')
    } catch (err) {
      expect(err).toBeInstanceOf(HarnessError)
      expect(err.code).toBe('SCORER_ERROR')
    }
  })

  it('DATASET_THRESHOLD_MISMATCH: dataset_version and compatible_dataset_version disagree', () => {
    const registryPath = tmpFile('thresholds.json', {
      ...thresholdsV1,
      compatible_dataset_version: 'golden-v9.9.9',
    })
    try {
      runEval({ registryPath, skipFixtureCheck: true })
      throw new Error('expected runEval to throw')
    } catch (err) {
      expect(err).toBeInstanceOf(HarnessError)
      expect(err.code).toBe('DATASET_THRESHOLD_MISMATCH')
    }
  })

  it('FIXTURE_CHECKSUM_MISMATCH: a drifted checksum on a real fixture is detected', () => {
    // verifyFixtureManifest resolves fixture_path relative to the actual repo
    // root (eval/../), not the manifest file's own directory — so drift can
    // only be exercised against a real, existing fixture path with a
    // deliberately wrong checksum recorded for it.
    const manifestPath = tmpFile('manifest.json', {
      providers: {
        naver_news: {
          status: 'AVAILABLE',
          fixtures: [
            { fixture_path: 'backend/tests/fixtures/naver/news_search_samsung.json', checksum: 'deadbeef' },
          ],
        },
      },
    })
    expect(() => verifyFixtureManifest(manifestPath)).toThrow(HarnessError)
    try {
      verifyFixtureManifest(manifestPath)
    } catch (err) {
      expect(err.code).toBe('FIXTURE_CHECKSUM_MISMATCH')
      expect(err.message).toContain('checksum drifted')
    }
  })

  it('FIXTURE_CHECKSUM_MISMATCH: a fixture path that does not exist is also detected', () => {
    const manifestPath = tmpFile('manifest.json', {
      providers: {
        x: { status: 'AVAILABLE', fixtures: [{ fixture_path: 'backend/tests/fixtures/does_not_exist.json', checksum: 'deadbeef' }] },
      },
    })
    expect(() => verifyFixtureManifest(manifestPath)).toThrow(/does not exist/)
  })

  it('the real fixtures-manifest.json passes verification against the actual fixture files on disk', () => {
    expect(() => verifyFixtureManifest()).not.toThrow()
  })
})

describe('eval/run.js CLI process exit codes', () => {
  // eval/run.js resolves golden-v1.json/thresholds-v1.json/fixtures-manifest.json
  // relative to its own file location (EVAL_DIR), not cwd, so a real subprocess
  // run always scores the bundled dataset — this exercises the actual `node
  // eval/run.js` entrypoint end to end (argv parsing, report persistence, exit
  // code), while the HarnessError-injection tests above cover each blocking
  // condition at the function level without mutating the real fixtures.
  it('exits 0 and writes eval/reports/latest.json on a clean run', () => {
    execFileSync('node', ['run.js'], { cwd: import.meta.dirname })
    expect(existsSync(join(import.meta.dirname, 'reports', 'latest.json'))).toBe(true)
  })

  it('loadPreviousRegistryFromGit never throws and returns the committed registry when available', () => {
    // docs/harness.md 설계 원칙 3 — 인프라 상태(파일이 아직 커밋되지 않음)
    // 때문에 하네스 자체가 죽어서는 안 된다. eval/이 커밋되기 전에는 null을
    // 반환하고, 커밋된 뒤에는 실제 이전 registry를 반환한다. diff 승인 로직
    // 자체는 validateThresholdChangeApproval() 단위 테스트(schema.test.js)가 검증한다.
    const previous = loadPreviousRegistryFromGit()
    if (previous === null) {
      expect(previous).toBeNull()
    } else {
      expect(previous.thresholds_version).toBe(thresholdsV1.thresholds_version)
      expect(previous.compatible_dataset_version).toBe(thresholdsV1.compatible_dataset_version)
    }
  })
})
