import { readJson, writeJson } from "./jsonStore";
import { getUserDataPath } from "./paths";
import { validateSyntax } from "./analyzer";

export interface FileChange {
  path: string;
  changeType: "new" | "modified" | "deleted";
  // Full new file content, produced by the Agent. Diff is no longer
  // Agent-authored — the model's line numbers/context can drift from the
  // real file, so only whole-file content is trusted from it.
  newContent: string;
  // Unified diff computed server-side from (oldContent vs newContent) —
  // see computeUnifiedDiff in diffCompute.ts. Never sourced from the Agent.
  diff: string;
  suggestedCommitMessage: string;
  // v6: minimal pre-commit safety net — Syntax-only (CSharpSyntaxTree parse,
  // no compilation/type-check), since Refactoring Agent only ever sees the
  // *original* repo's analysis report and never re-analyzes what Code
  // Generation just produced. Always true/empty for "deleted" (nothing to
  // parse). Doesn't block anything — just changes the default checkbox state.
  syntaxValid: boolean;
  syntaxErrors: string[];
  // Day 13 will add the actual per-file commit-selection UI that flips this —
  // for now it just gives the "approved / total" progress_pct calc something
  // real to divide, defaulting to 0% until that UI exists.
  approved: boolean;
}

// Kept separate from documents/{step_id}.json rather than reusing that store:
// documents carry a single versioned `content` string with edit history, which
// doesn't fit an array of discrete file entries. A sibling `file-changes/`
// directory matches the existing data/users/{id}/{documents,messages}/ layout.
function fileChangesPath(userId: number, stepId: number | string): string {
  return getUserDataPath(userId, "file-changes", `${stepId}.json`);
}

export async function getFileChanges(userId: number, stepId: number | string): Promise<FileChange[]> {
  try {
    return await readJson<FileChange[]>(fileChangesPath(userId, stepId));
  } catch {
    return [];
  }
}

export async function saveFileChanges(
  userId: number,
  stepId: number | string,
  files: Array<Omit<FileChange, "approved" | "syntaxValid" | "syntaxErrors">>
): Promise<FileChange[]> {
  const validated: FileChange[] = await Promise.all(
    files.map(async (f) => {
      if (f.changeType === "deleted") {
        return { ...f, syntaxValid: true, syntaxErrors: [], approved: false };
      }
      try {
        const result = await validateSyntax(f.newContent);
        return { ...f, syntaxValid: result.valid, syntaxErrors: result.errors, approved: false };
      } catch {
        // The validator itself failing to run (e.g. dotnet unavailable)
        // shouldn't block file-change generation — this is a safety net on
        // top of the existing flow, not a requirement for it to work at all.
        return { ...f, syntaxValid: true, syntaxErrors: [], approved: false };
      }
    })
  );
  await writeJson(fileChangesPath(userId, stepId), validated);
  return validated;
}

// Unlike saveFileChanges (a fresh Agent proposal, always starting unapproved),
// this writes back an already-loaded array as-is — used after a commit batch
// to flip `approved` on just the files that actually committed, leaving
// everything else (including its approved state) untouched.
export async function updateFileChanges(
  userId: number,
  stepId: number | string,
  files: FileChange[]
): Promise<FileChange[]> {
  await writeJson(fileChangesPath(userId, stepId), files);
  return files;
}
