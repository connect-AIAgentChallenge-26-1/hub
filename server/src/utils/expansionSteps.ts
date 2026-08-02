import { readJson, writeJson } from "./jsonStore";
import { getUserDataPath } from "./paths";

export interface ExpansionStep {
  id: number;
  name: string;
  status: "pending" | "active" | "done";
  progress_pct: number;
}

function expansionStepsFile(userId: number, expansionId: string): string {
  return getUserDataPath(userId, "expansions", expansionId, "steps.json");
}

// Fixed 6-stage plan for every Feature Expansion Workflow (원 기획서 11번) —
// unlike the 9-step workflow's steps.json, this never varies per project, so
// it doubles as both the fresh-expansion seed and the id->name reference.
// Steps 3-4 and 5-6 are each driven by a single combined endpoint/screen
// (see routes/expansions.ts) — they're always advanced together as pairs,
// never independently.
export const EXPANSION_SEED_STEPS: ExpansionStep[] = [
  { id: 1, name: "설계 변경 제안", status: "active", progress_pct: 0 },
  { id: 2, name: "ScriptableObject 생성", status: "pending", progress_pct: 0 },
  { id: 3, name: "코드 생성", status: "pending", progress_pct: 0 },
  { id: 4, name: "코드 리뷰", status: "pending", progress_pct: 0 },
  { id: 5, name: "문서화", status: "pending", progress_pct: 0 },
  { id: 6, name: "커밋", status: "pending", progress_pct: 0 },
];

export async function createExpansionSteps(userId: number, expansionId: string): Promise<void> {
  await writeJson(expansionStepsFile(userId, expansionId), EXPANSION_SEED_STEPS);
}

export async function getExpansionSteps(userId: number, expansionId: string): Promise<ExpansionStep[]> {
  try {
    return await readJson<ExpansionStep[]>(expansionStepsFile(userId, expansionId));
  } catch {
    return [];
  }
}

// Marks every id in `doneIds` as done and every id in `activeIds` as active,
// leaving the rest untouched. Callers pass both ids of a combined pair
// together (e.g. [3,4]) rather than one at a time, matching how the 9-step
// workflow's own approve handler flips exactly one step to done and the next
// to active — just generalized to N ids on each side.
export async function advanceExpansionSteps(
  userId: number,
  expansionId: string,
  doneIds: number[],
  activeIds: number[]
): Promise<ExpansionStep[]> {
  const steps = await getExpansionSteps(userId, expansionId);
  const updated = steps.map((s): ExpansionStep => {
    if (doneIds.includes(s.id)) return { ...s, status: "done" };
    if (activeIds.includes(s.id)) return { ...s, status: "active" };
    return s;
  });
  await writeJson(expansionStepsFile(userId, expansionId), updated);
  return updated;
}
