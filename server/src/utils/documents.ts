import { readJson, writeJson } from "./jsonStore";
import { getUserDataPath } from "./paths";

export interface DocumentVersion {
  content: string;
  version: number;
  updated_at: string;
}

export interface DocumentRecord {
  path: string;
  content: string;
  version: number;
  updated_at: string;
  history: DocumentVersion[];
}

function documentFile(userId: number, stepId: number | string): string {
  return getUserDataPath(userId, "documents", `${stepId}.json`);
}

// Shared by every Step's document (documents/{step_id}.json) — the analysis
// report is treated as step 0, ahead of the 9-step workflow proper.
export async function saveDocument(
  userId: number,
  stepId: number | string,
  path: string,
  content: string
): Promise<DocumentRecord> {
  const file = documentFile(userId, stepId);

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

export async function getDocument(userId: number, stepId: number | string): Promise<DocumentRecord | null> {
  try {
    return await readJson<DocumentRecord>(documentFile(userId, stepId));
  } catch {
    return null;
  }
}
