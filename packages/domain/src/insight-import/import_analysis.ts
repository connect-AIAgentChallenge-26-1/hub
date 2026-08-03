import { IMPORT_LIMITS } from './import_limits.js';
import {
  type AnalyzedImportItem,
  type ImportCandidate,
  type ImportSummary,
  type ImportWarningCode,
} from './import_types.js';
import { analyzeImportUrl } from './import_url.js';

export type ImportAnalysis = {
  collections: string[][];
  items: AnalyzedImportItem[];
  summary: ImportSummary;
};

export function analyzeImportCandidates(
  candidates: readonly ImportCandidate[]
): ImportAnalysis {
  const collections: string[][] = [];
  const collectionKeys = new Set<string>();
  const normalizedUrls = new Set<string>();
  const items: AnalyzedImportItem[] = [];

  for (const candidate of candidates) {
    const sanitizedCandidate = sanitizeCandidate(candidate);

    appendCollection({
      collections,
      keys: collectionKeys,
      path: sanitizedCandidate.collectionPath,
    });

    const urlResult = analyzeImportUrl(sanitizedCandidate.originalUrl);

    if (!urlResult.ok) {
      items.push({
        ...sanitizedCandidate,
        classification: 'excluded',
        domain: null,
        exclusionCode: urlResult.reason,
        normalizedUrl: null,
      });
      continue;
    }

    const isDuplicate = normalizedUrls.has(urlResult.normalizedUrl);
    normalizedUrls.add(urlResult.normalizedUrl);
    items.push({
      ...sanitizedCandidate,
      classification: isDuplicate ? 'input_duplicate' : 'candidate',
      domain: urlResult.domain,
      exclusionCode: null,
      normalizedUrl: urlResult.normalizedUrl,
      originalUrl: urlResult.originalUrl,
    });
  }

  return {
    collections,
    items,
    summary: createSummary(items),
  };
}

function sanitizeCandidate(candidate: ImportCandidate): ImportCandidate {
  const warnings = [...new Set(candidate.warnings)];
  const titleCandidate = sanitizeTitle(candidate.titleCandidate, warnings);
  const explicitMemoCandidate = sanitizeMemo(
    candidate.explicitMemoCandidate,
    warnings
  );

  return {
    ...candidate,
    collectionPath: candidate.collectionPath.slice(
      0,
      IMPORT_LIMITS.collectionDepth
    ),
    explicitMemoCandidate,
    sourceLocation: candidate.sourceLocation.slice(
      0,
      IMPORT_LIMITS.sourceLocationLength
    ),
    titleCandidate,
    warnings,
  };
}

function sanitizeTitle(value: string | null, warnings: ImportWarningCode[]) {
  const trimmedValue = value?.trim() ?? '';

  if (trimmedValue.length === 0) {
    appendWarning(warnings, 'missing-title');
    return null;
  }

  if (trimmedValue.length > IMPORT_LIMITS.titleLength) {
    appendWarning(warnings, 'trimmed-title');
    return trimmedValue.slice(0, IMPORT_LIMITS.titleLength);
  }

  return trimmedValue;
}

function sanitizeMemo(value: string | null, warnings: ImportWarningCode[]) {
  const trimmedValue = value?.trim() ?? '';

  if (trimmedValue.length === 0) {
    return null;
  }

  if (trimmedValue.length > IMPORT_LIMITS.memoLength) {
    appendWarning(warnings, 'trimmed-memo');
    return trimmedValue.slice(0, IMPORT_LIMITS.memoLength);
  }

  return trimmedValue;
}

function appendWarning(
  warnings: ImportWarningCode[],
  warning: ImportWarningCode
) {
  if (!warnings.includes(warning)) {
    warnings.push(warning);
  }
}

function appendCollection({
  collections,
  keys,
  path,
}: {
  collections: string[][];
  keys: Set<string>;
  path: string[];
}) {
  if (path.length === 0) {
    return;
  }

  const key = createCollectionKey(path);

  if (!keys.has(key)) {
    keys.add(key);
    collections.push(path);
  }
}

function createCollectionKey(path: readonly string[]) {
  return JSON.stringify(path);
}

function createSummary(items: readonly AnalyzedImportItem[]): ImportSummary {
  const summary: ImportSummary = {
    createdCount: 0,
    duplicateCount: 0,
    excludedCount: 0,
    inputDuplicateCount: 0,
    newCount: 0,
    totalCount: items.length,
  };

  for (const item of items) {
    if (item.classification === 'candidate') {
      summary.newCount += 1;
    } else if (item.classification === 'input_duplicate') {
      summary.inputDuplicateCount += 1;
    } else {
      summary.excludedCount += 1;
    }
  }

  return summary;
}
