import { readJson, writeJson } from "./jsonStore";
import { getUserDataPath } from "./paths";
import { validateSyntax } from "./analyzer";
import type { FileChange } from "./fileChanges";

// Feature Expansion Workflow's analog of fileChanges.ts — same FileChange
// shape (reused via type import, not modifying fileChanges.ts) and the same
// validateSyntax() call for v6 compliance, but a single shared
// expansions/{expansionId}/file-changes.json rather than one file per
// 9-step step id, since Steps 3 (code generation) and 4 (code review) both
// contribute to one combined commit-review list for the expansion.
function expansionFileChangesPath(userId: number, expansionId: string): string {
  return getUserDataPath(userId, "expansions", expansionId, "file-changes.json");
}

async function validateDrafts(
  files: Array<Omit<FileChange, "approved" | "syntaxValid" | "syntaxErrors">>
): Promise<FileChange[]> {
  return Promise.all(
    files.map(async (f) => {
      if (f.changeType === "deleted") {
        return { ...f, syntaxValid: true, syntaxErrors: [], approved: false };
      }
      try {
        const result = await validateSyntax(f.newContent);
        return { ...f, syntaxValid: result.valid, syntaxErrors: result.errors, approved: false };
      } catch {
        // Same safety net as fileChanges.ts: the validator itself failing to
        // run shouldn't block file-change generation.
        return { ...f, syntaxValid: true, syntaxErrors: [], approved: false };
      }
    })
  );
}

export async function getExpansionFileChanges(userId: number, expansionId: string): Promise<FileChange[]> {
  try {
    return await readJson<FileChange[]>(expansionFileChangesPath(userId, expansionId));
  } catch {
    return [];
  }
}

// Step 3 (Code Generation) — first write for this expansion, same behavior
// as fileChanges.ts's saveFileChanges (fresh overwrite, always unapproved).
export async function saveExpansionFileChanges(
  userId: number,
  expansionId: string,
  files: Array<Omit<FileChange, "approved" | "syntaxValid" | "syntaxErrors">>
): Promise<FileChange[]> {
  const validated = await validateDrafts(files);
  await writeJson(expansionFileChangesPath(userId, expansionId), validated);
  return validated;
}

// Step 4 (Code Review) — merges its own proposals into whatever Step 3
// already produced, by path, instead of overwriting the whole list. This
// matters because the Code Review Agent's own prompt legitimately returns an
// empty `files` array when nothing is flagged for refactoring — a plain
// overwrite would then wipe out Step 3's generated code entirely.
export async function mergeExpansionFileChanges(
  userId: number,
  expansionId: string,
  files: Array<Omit<FileChange, "approved" | "syntaxValid" | "syntaxErrors">>
): Promise<FileChange[]> {
  const validated = await validateDrafts(files);
  const existing = await getExpansionFileChanges(userId, expansionId);
  const byPath = new Map(existing.map((f) => [f.path, f]));
  for (const f of validated) byPath.set(f.path, f);
  const merged = Array.from(byPath.values());
  await writeJson(expansionFileChangesPath(userId, expansionId), merged);
  return merged;
}

// Same as fileChanges.ts's updateFileChanges — writes back an already-loaded
// array as-is (routes/expansions.ts's docs/approve uses this to flip
// `approved` after committing).
export async function updateExpansionFileChanges(
  userId: number,
  expansionId: string,
  files: FileChange[]
): Promise<FileChange[]> {
  await writeJson(expansionFileChangesPath(userId, expansionId), files);
  return files;
}
