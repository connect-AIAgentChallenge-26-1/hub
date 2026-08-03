export const IMPORT_LIMITS = Object.freeze({
  candidateCount: 10_000,
  collectionDepth: 20,
  fileBytes: 10 * 1024 * 1024,
  memoLength: 200,
  sourceLocationLength: 500,
  titleLength: 500,
  urlLength: 4096,
  zipCompressedBytes: 20 * 1024 * 1024,
  zipEntryBytes: 10 * 1024 * 1024,
  zipEntryCount: 100,
  zipUncompressedBytes: 50 * 1024 * 1024,
});
