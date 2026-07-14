// Golden dataset + threshold registry typed contracts — mirrors
// docs/skills.md "I9 골든 평가 하네스 계약". Same pattern as contracts/schemas.js:
// validators return { valid, errors[] } instead of throwing so callers can
// report the full error set at once.

export const GOLDEN_DATASET_VERSION_PATTERN = /^golden-v\d+\.\d+\.\d+$/
export const THRESHOLDS_VERSION_PATTERN = /^thresholds-v\d+\.\d+\.\d+$/

export const CATEGORIES = Object.freeze([
  'claim_extraction',
  'verdict_accuracy',
  'numerical_consistency',
  'temporal_integrity',
  'provider_fault_classification',
  'citation_correctness',
  'hallucination',
  'injection_defense',
  'recommendation_ban',
  'schema_violation',
  'retrieval_recall_precision',
  'counter_retrieval',
  'insufficient_unverifiable_detection',
  'conflict_detection',
])

// docs/skills.md "최소 커버리지" — 이 태그가 dataset 안 어딘가에 각 1건 이상
// 있어야 한다(정정공시·단위·CFS/OFS·누적분기·API 장애·인젝션·상충 근거).
export const REQUIRED_TAGS = Object.freeze([
  'correction_disclosure',
  'unit_confusion',
  'cfs_ofs',
  'cumulative_quarter',
  'provider_fault',
  'injection',
  'conflicting_evidence',
])

// docs/skills.md "verdict_accuracy 카테고리에 5상태 각 1건 이상"
export const REQUIRED_VERDICT_STATES = Object.freeze([
  'SUPPORTED',
  'PARTIALLY_SUPPORTED',
  'REFUTED',
  'INSUFFICIENT_EVIDENCE',
  'UNVERIFIABLE',
])

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function validateGoldenCase(kase, index, errors) {
  const path = `cases[${index}]`
  if (!isPlainObject(kase)) {
    errors.push(`${path} must be an object`)
    return
  }
  if (typeof kase.id !== 'string' || kase.id.length === 0) {
    errors.push(`${path}.id must be a non-empty string`)
  }
  if (!CATEGORIES.includes(kase.category)) {
    errors.push(`${path}.category must be one of ${CATEGORIES.join(', ')}`)
  }
  if (!Array.isArray(kase.tags) || kase.tags.some((t) => typeof t !== 'string')) {
    errors.push(`${path}.tags must be a string array`)
  }
  if (typeof kase.description !== 'string' || kase.description.length === 0) {
    errors.push(`${path}.description must be a non-empty string`)
  }
  if (!isPlainObject(kase.input)) {
    errors.push(`${path}.input must be an object`)
  }
  if (!('expected' in kase)) {
    errors.push(`${path}.expected is required`)
  }
  if ('source' in kase && kase.source !== undefined) {
    const src = kase.source
    if (
      !isPlainObject(src) ||
      typeof src.provider !== 'string' ||
      typeof src.fixture_path !== 'string' ||
      typeof src.checksum !== 'string'
    ) {
      errors.push(`${path}.source must be { provider, fixture_path, checksum } when present`)
    }
  }
}

/**
 * Validates a golden dataset object: shape of every case, id uniqueness,
 * and the minimum coverage rules from docs/skills.md (5 verdict states,
 * 7 required tags). A dataset that violates these must not be scored —
 * docs/skills.md "harness smoke test" item 2 (INVALID_DATASET).
 */
export function validateGoldenDataset(dataset) {
  const errors = []

  if (!isPlainObject(dataset)) {
    return { valid: false, errors: ['golden dataset must be an object'] }
  }

  if (
    typeof dataset.dataset_version !== 'string' ||
    !GOLDEN_DATASET_VERSION_PATTERN.test(dataset.dataset_version)
  ) {
    errors.push(`dataset_version must match ${GOLDEN_DATASET_VERSION_PATTERN}`)
  }
  if (typeof dataset.generated_at !== 'string' || dataset.generated_at.length === 0) {
    errors.push('generated_at must be a non-empty string')
  }
  if (!Array.isArray(dataset.cases) || dataset.cases.length === 0) {
    errors.push('cases must be a non-empty array')
    return { valid: false, errors }
  }

  dataset.cases.forEach((kase, i) => validateGoldenCase(kase, i, errors))

  const ids = dataset.cases.map((k) => k && k.id).filter((id) => typeof id === 'string')
  const duplicateIds = ids.filter((id, i) => ids.indexOf(id) !== i)
  if (duplicateIds.length > 0) {
    errors.push(`duplicate case id(s): ${[...new Set(duplicateIds)].join(', ')}`)
  }

  const allTags = new Set(dataset.cases.flatMap((k) => (Array.isArray(k?.tags) ? k.tags : [])))
  for (const tag of REQUIRED_TAGS) {
    if (!allTags.has(tag)) {
      errors.push(`missing required coverage tag: ${tag}`)
    }
  }

  const verdictStates = new Set(
    dataset.cases
      .filter((k) => k?.category === 'verdict_accuracy')
      .map((k) => k?.expected?.verdict),
  )
  for (const state of REQUIRED_VERDICT_STATES) {
    if (!verdictStates.has(state)) {
      errors.push(`missing required verdict_accuracy coverage for state: ${state}`)
    }
  }

  return { valid: errors.length === 0, errors }
}

function validateChangeLogEntry(entry, index, errors) {
  const path = `change_log[${index}]`
  if (!isPlainObject(entry)) {
    errors.push(`${path} must be an object`)
    return
  }
  for (const field of ['date', 'actor', 'metric_or_field', 'reason']) {
    if (typeof entry[field] !== 'string' || entry[field].length === 0) {
      errors.push(`${path}.${field} must be a non-empty string`)
    }
  }
  if (!('before' in entry) || !('after' in entry)) {
    errors.push(`${path} must include before and after`)
  }
}

/**
 * Validates a single threshold registry snapshot: version pattern,
 * per-environment metric value shapes, and that a well-formed, non-empty
 * change_log[] exists. This has no access to a previous snapshot, so it
 * cannot know whether a *specific* metric change is actually documented —
 * that diff-based check is validateThresholdChangeApproval() below
 * (docs/skills.md "변경 승인 규칙").
 */
export function validateThresholdRegistry(registry) {
  const errors = []

  if (!isPlainObject(registry)) {
    return { valid: false, errors: ['threshold registry must be an object'] }
  }

  if (
    typeof registry.thresholds_version !== 'string' ||
    !THRESHOLDS_VERSION_PATTERN.test(registry.thresholds_version)
  ) {
    errors.push(`thresholds_version must match ${THRESHOLDS_VERSION_PATTERN}`)
  }
  if (
    typeof registry.compatible_dataset_version !== 'string' ||
    !GOLDEN_DATASET_VERSION_PATTERN.test(registry.compatible_dataset_version)
  ) {
    errors.push(`compatible_dataset_version must match ${GOLDEN_DATASET_VERSION_PATTERN}`)
  }
  if (!isPlainObject(registry.metrics) || Object.keys(registry.metrics).length === 0) {
    errors.push('metrics must be a non-empty object')
  } else {
    for (const [key, entry] of Object.entries(registry.metrics)) {
      if (!isPlainObject(entry)) {
        errors.push(`metrics.${key} must be an object`)
        continue
      }
      // 정확히 하나의 bound kind만 허용한다 — 두 개 이상(예: min+max) 선언되면
      // eval/report.js의 실제 평가 우선순위(per_environment -> min -> max ->
      // equals)와 change_log 감사 검증이 서로 다른 값을 "그 metric의 bound"로
      // 볼 위험이 생긴다(GPT 리뷰 2026-07-14 18:44 재현: {min, max} 동시 선언이
      // 이전에는 통과했다).
      const boundKinds = ['min', 'max', 'equals', 'per_environment'].filter((k) => k in entry)
      if (boundKinds.length !== 1) {
        errors.push(
          `metrics.${key} must declare exactly one of min, max, equals, per_environment ` +
            `(found: ${boundKinds.length === 0 ? 'none' : boundKinds.join(', ')})`,
        )
      } else {
        const kind = boundKinds[0]
        if (kind === 'per_environment') {
          const validPerEnv =
            isPlainObject(entry.per_environment) &&
            ['dev', 'staging', 'production'].every((env) => typeof entry.per_environment[env] === 'number')
          if (!validPerEnv) {
            errors.push(`metrics.${key}.per_environment must have numeric dev/staging/production`)
          }
        } else if (typeof entry[kind] !== 'number') {
          errors.push(`metrics.${key}.${kind} must be a number`)
        }
      }
      if (typeof entry.description !== 'string' || entry.description.length === 0) {
        errors.push(`metrics.${key}.description must be a non-empty string`)
      }
    }
  }
  if (!Array.isArray(registry.change_log) || registry.change_log.length === 0) {
    errors.push('change_log must be a non-empty array (change-approval record)')
  } else {
    registry.change_log.forEach((entry, i) => validateChangeLogEntry(entry, i, errors))
  }

  return { valid: errors.length === 0, errors }
}

// A metric entry declares exactly one kind of bound (validateThresholdRegistry
// requires min xor max xor equals xor per_environment) — this pulls out just
// that bound, ignoring `description`, so before/after comparisons aren't
// tripped up by unrelated prose edits. Checked in the same priority order as
// eval/report.js's resolveThreshold() (per_environment -> min -> max ->
// equals) so that a malformed registry which somehow slips past the
// exactly-one check above still has this and the actual evaluated bound
// agree on which field is "the" bound (GPT 리뷰 2026-07-14 18:44).
function extractBound(entry) {
  if (!isPlainObject(entry)) return undefined
  if ('per_environment' in entry) return entry.per_environment
  if ('min' in entry) return entry.min
  if ('max' in entry) return entry.max
  if ('equals' in entry) return entry.equals
  return undefined
}

/**
 * Compares a registry against its immediately-previous version (typically
 * HEAD vs the working tree) and enforces docs/skills.md "변경 승인 규칙" (1)
 * and (2): any metric bound that actually changed value must come with both
 * a `thresholds_version` bump and a *new* change_log entry that both names
 * it and records its real before/after bound. `validateThresholdRegistry()`
 * alone only checks that change_log is non-empty — a registry that lowers a
 * bound while reusing the old version and an unrelated old change_log entry
 * still passes that check (docs/report GPT 리뷰 2026-07-14 18:23); naming the
 * right metric with a fabricated before/after also still passed until this
 * comparison was added (GPT 리뷰 2026-07-14 18:37). This needs both
 * snapshots, so it cannot live inside the single-registry shape validator
 * above.
 */
export function validateThresholdChangeApproval(previous, next) {
  if (!isPlainObject(previous) || !isPlainObject(next)) {
    return { valid: false, errors: ['both previous and next registry must be objects'] }
  }

  const prevMetrics = isPlainObject(previous.metrics) ? previous.metrics : {}
  const nextMetrics = isPlainObject(next.metrics) ? next.metrics : {}
  const allKeys = new Set([...Object.keys(prevMetrics), ...Object.keys(nextMetrics)])
  const changedMetrics = [...allKeys].filter(
    (key) => JSON.stringify(prevMetrics[key] ?? null) !== JSON.stringify(nextMetrics[key] ?? null),
  )

  if (changedMetrics.length === 0) {
    return { valid: true, errors: [] }
  }

  const errors = []
  if (previous.thresholds_version === next.thresholds_version) {
    errors.push(
      `metric(s) changed (${changedMetrics.join(', ')}) but thresholds_version was not bumped ` +
        `from ${previous.thresholds_version}`,
    )
  }

  const prevChangeLog = Array.isArray(previous.change_log) ? previous.change_log : []
  const nextChangeLog = Array.isArray(next.change_log) ? next.change_log : []
  const newEntries = nextChangeLog.slice(prevChangeLog.length)
  for (const metric of changedMetrics) {
    const matchingEntries = newEntries.filter((entry) => entry?.metric_or_field === metric)
    if (matchingEntries.length === 0) {
      errors.push(`metric "${metric}" changed but no new change_log entry documents it`)
      continue
    }
    const prevBound = extractBound(prevMetrics[metric])
    const nextBound = extractBound(nextMetrics[metric])
    const accurate = matchingEntries.some(
      (entry) =>
        JSON.stringify(entry.before ?? null) === JSON.stringify(prevBound ?? null) &&
        JSON.stringify(entry.after ?? null) === JSON.stringify(nextBound ?? null),
    )
    if (!accurate) {
      errors.push(
        `metric "${metric}" has a change_log entry naming it, but none record the actual ` +
          `before/after bound (expected before=${JSON.stringify(prevBound)}, ` +
          `after=${JSON.stringify(nextBound)})`,
      )
    }
  }

  return { valid: errors.length === 0, errors }
}

/**
 * A threshold registry is only usable with the golden dataset it declares
 * compatibility with — running metric-A's dataset against metric-B's
 * registry would silently compare unrelated case sets.
 */
export function checkCompatibility(dataset, registry) {
  if (dataset?.dataset_version !== registry?.compatible_dataset_version) {
    return {
      valid: false,
      errors: [
        `thresholds_version ${registry?.thresholds_version} expects dataset_version ` +
          `${registry?.compatible_dataset_version}, got ${dataset?.dataset_version}`,
      ],
    }
  }
  return { valid: true, errors: [] }
}
