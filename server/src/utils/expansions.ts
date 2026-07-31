import crypto from "crypto";
import { writeJson } from "./jsonStore";
import { getUserDataPath } from "./paths";

// Data model for the Feature Expansion Workflow (원 기획서 11번) — a
// completely separate flow from the 9-step new-project workflow (steps.json).
// One user can have many expansions (data/users/{userId}/expansions/{id}/),
// each independent of the others and of the 9-step workflow's state.
//
// Only request.json is written today (Day 19 — entry point + data model).
// The other files this directory will eventually hold — design.json (step 1,
// reuses documents.ts's DocumentRecord shape), scriptable-objects.json (step
// 2, same shape), file-changes.json (steps 3-4, reuses fileChanges.ts's
// FileChange shape), docs.json (step 5, DocumentRecord shape again) — are
// each written by their own Agent step starting Day 20; nothing here creates
// placeholders for them ahead of time.
export interface ExpansionRequest {
  description: string;
  // "design_pending" is the only status this Day assigns; later Agent steps
  // (Day 20+) will introduce whatever further statuses they need.
  status: string;
  created_at: string;
}

function expansionRequestFile(userId: number, expansionId: string): string {
  return getUserDataPath(userId, "expansions", expansionId, "request.json");
}

export async function createExpansion(
  userId: number,
  description: string
): Promise<{ expansionId: string; request: ExpansionRequest }> {
  const expansionId = crypto.randomBytes(12).toString("hex");
  const request: ExpansionRequest = {
    description,
    status: "design_pending",
    created_at: new Date().toISOString(),
  };
  await writeJson(expansionRequestFile(userId, expansionId), request);
  return { expansionId, request };
}
