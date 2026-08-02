import type {
  AnalyzedImportItem,
  ImportSummary,
} from '@amadda/domain/insight-import';

import type { CategoryColorKey } from '../../../shared/config/design-system/tokens.js';

export type {
  AnalyzedImportItem,
  ImportCandidate,
  ImportExclusionCode,
  ImportSummary,
  ImportWarningCode,
} from '@amadda/domain/insight-import';

export const IMPORT_INPUT_KINDS = [
  'pasted-text',
  'file',
  'connected-account',
] as const;
export type ImportInputKind = (typeof IMPORT_INPUT_KINDS)[number];

export const IMPORT_ADAPTER_KEYS = [
  'pasted-text',
  'bookmark-html',
  'generic-csv',
  'generic-json',
  'generic-html',
  'generic-markdown',
  'generic-text',
  'zip',
  'notion',
] as const;
export type ImportAdapterKey = (typeof IMPORT_ADAPTER_KEYS)[number];

export type ImportInput =
  | { kind: 'connected-account'; connectionId: string }
  | { kind: 'file'; file: File; mappings?: ImportFieldMapping[] }
  | { kind: 'pasted-text'; text: string };

export type PreparedImportItem = Omit<AnalyzedImportItem, 'classification'> & {
  classification: 'new' | 'existing_duplicate' | 'input_duplicate' | 'excluded';
};

export type ImportFieldMapping = {
  memoField: string | null;
  sourceKey: string;
  titleField: string | null;
  urlField: string;
};

export type ImportCollectionTarget =
  | { kind: 'uncategorized' }
  | { categoryId: string; kind: 'existing' }
  | {
      colorKey: CategoryColorKey;
      kind: 'new';
      name: string;
    };

export type ImportCollectionMapping = {
  collectionKey: string;
  target: ImportCollectionTarget;
};

export type ImportJobStatus =
  'analyzing' | 'ready' | 'committing' | 'completed' | 'failed' | 'undone';

export type PreparedImport = {
  adapterKey: ImportAdapterKey;
  collections: string[][];
  expiresAt: string;
  id: string;
  items: PreparedImportItem[];
  status: 'ready';
  summary: ImportSummary;
};

export type ImportCommitResult = {
  createdCount: number;
  duplicateCount: number;
  excludedCount: number;
  jobId: string;
};

export type ImportUndoResult = {
  alreadyDeletedCount: number;
  deletedCount: number;
  jobId: string;
  preservedCount: number;
};

export type ImportHistoryEntry = {
  adapterKey: ImportAdapterKey;
  canUndo: boolean;
  completedAt: string;
  id: string;
  status: 'completed' | 'undone';
  summary: ImportSummary;
  undoExpiresAt: string | null;
  undoRemainingMs: number;
  undoResult: ImportUndoResult | null;
};

export type ImportIssuePage = {
  items: PreparedImportItem[];
  nextOrdinal: number | null;
};

export function isImportInputKind(value: unknown): value is ImportInputKind {
  return IMPORT_INPUT_KINDS.includes(value as ImportInputKind);
}

export function isImportAdapterKey(value: unknown): value is ImportAdapterKey {
  return IMPORT_ADAPTER_KEYS.includes(value as ImportAdapterKey);
}

export function createCollectionKey(path: readonly string[]) {
  return JSON.stringify(path);
}
