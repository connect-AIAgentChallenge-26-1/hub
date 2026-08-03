import { readJson, writeJson } from "./jsonStore";
import { getUserDataPath } from "./paths";
import type { DocumentRecord } from "./documents";

// Generic version of documents.ts's saveDocument/getDocument for the Feature
// Expansion Workflow — same DocumentRecord shape (reused via type import, not
// modifying documents.ts), but parameterized by filename instead of a fixed
// stepId, since one expansion holds several such documents (design.json,
// scriptable-objects.json, and more as later Days add steps) under
// data/users/{userId}/expansions/{expansionId}/.
function expansionDocumentFile(userId: number, expansionId: string, filename: string): string {
  return getUserDataPath(userId, "expansions", expansionId, filename);
}

export async function saveExpansionDocument(
  userId: number,
  expansionId: string,
  filename: string,
  path: string,
  content: string
): Promise<DocumentRecord> {
  const file = expansionDocumentFile(userId, expansionId, filename);

  let existing: DocumentRecord | null = null;
  try {
    existing = await readJson<DocumentRecord>(file);
  } catch {
    existing = null;
  }

  const record: DocumentRecord = {
    path,
    content,
    version: existing ? existing.version + 1 : 1,
    updated_at: new Date().toISOString(),
    history: existing
      ? [
          ...existing.history,
          { content: existing.content, version: existing.version, updated_at: existing.updated_at },
        ]
      : [],
  };

  await writeJson(file, record);
  return record;
}

export async function getExpansionDocument(
  userId: number,
  expansionId: string,
  filename: string
): Promise<DocumentRecord | null> {
  try {
    return await readJson<DocumentRecord>(expansionDocumentFile(userId, expansionId, filename));
  } catch {
    return null;
  }
}
