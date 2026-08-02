export type ImportWarningCode =
  'missing-title' | 'trimmed-title' | 'trimmed-memo' | 'ambiguous-field';

export type ImportCandidate = {
  candidateId: string;
  capturedAtCandidate: string | null;
  collectionPath: string[];
  explicitMemoCandidate: string | null;
  originalUrl: string;
  sourceLocation: string;
  titleCandidate: string | null;
  warnings: ImportWarningCode[];
};

export type ImportExclusionCode =
  'invalid-url' | 'unsupported-protocol' | 'private-address' | 'limit-exceeded';

export type AnalyzedImportItem = ImportCandidate & {
  classification: 'candidate' | 'excluded' | 'input_duplicate';
  domain: string | null;
  exclusionCode: ImportExclusionCode | null;
  normalizedUrl: string | null;
};

export type ImportSummary = {
  createdCount: number;
  duplicateCount: number;
  excludedCount: number;
  inputDuplicateCount: number;
  newCount: number;
  totalCount: number;
};
