import { promises as fs } from "fs";
import { writeJson } from "./jsonStore";
import { SEED_STEPS, stepsFile } from "./steps";

// Called once per login (auth.ts's callback) — creates this user's
// data/users/{id}/ space with a fresh steps.json if they've never logged in
// before. A returning user's existing steps.json (and everything else under
// their directory) is left untouched.
export async function ensureUserInitialized(userId: number): Promise<void> {
  const file = stepsFile(userId);
  try {
    await fs.access(file);
  } catch {
    await writeJson(file, SEED_STEPS);
  }
}
