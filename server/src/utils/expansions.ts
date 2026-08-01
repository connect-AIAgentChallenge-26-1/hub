import crypto from "crypto";
import { readJson, writeJson } from "./jsonStore";
import { getUserDataPath } from "./paths";

// Data model for the Feature Expansion Workflow (원 기획서 11번) — a
// completely separate flow from the 9-step new-project workflow (steps.json).
// One user can have many expansions (data/users/{userId}/expansions/{id}/),
// each independent of the others and of the 9-step workflow's state.
//
// request.json (this file) holds the request itself + workflow status.
// design.json (step 1) and scriptable-objects.json (step 2) — both reusing
// documents.ts's DocumentRecord shape — are handled by expansionDocuments.ts
// instead of here, since that shape is shared across every doc this
// directory holds; design-messages.json (step 1's chat log) is handled by
// expansionMessages.ts likewise. file-changes.json/docs.json (Day 21+ steps)
// aren't created yet.
export interface ExpansionRequest {
  description: string;
  // "design_pending" (Day 19) -> "scriptable_objects_pending" (design
  // approved) -> "code_pending" (SO approved, Day 21+ takes it from here).
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

export async function getExpansionRequest(
  userId: number,
  expansionId: string
): Promise<ExpansionRequest | null> {
  try {
    return await readJson<ExpansionRequest>(expansionRequestFile(userId, expansionId));
  } catch {
    return null;
  }
}

export async function updateExpansionStatus(
  userId: number,
  expansionId: string,
  status: string
): Promise<ExpansionRequest | null> {
  const current = await getExpansionRequest(userId, expansionId);
  if (!current) return null;
  const updated: ExpansionRequest = { ...current, status };
  await writeJson(expansionRequestFile(userId, expansionId), updated);
  return updated;
}
