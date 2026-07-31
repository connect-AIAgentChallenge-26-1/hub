import { Router } from "express";
import { promises as fs } from "fs";
import path from "path";
import { writeJson } from "../utils/jsonStore";
import { getUserDataPath } from "../utils/paths";
import { SEED_STEPS, stepsFile } from "../utils/steps";
import { isDemoMode, setDemoMode } from "../utils/demoMode";

const router = Router();

async function clearDir(dir: string): Promise<void> {
  let entries: string[] = [];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return; // directory doesn't exist yet — nothing to clear
  }
  await Promise.all(entries.map((f) => fs.unlink(path.join(dir, f))));
}

// Dev-only convenience: resets the 1~9 step workflow (steps.json + every
// documents/messages/file-changes entry) back to a fresh seed, without
// touching project.json/the session store — repo connection and login should
// survive a reset, only the workflow progress gets wiped. Scoped to the
// caller's own user directory, same as everything else post-v7.
router.post("/reset", async (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({ error: "Not available in production." });
  }

  const userId = req.userId!;
  await writeJson(stepsFile(userId), SEED_STEPS);
  await Promise.all([
    clearDir(getUserDataPath(userId, "documents")),
    clearDir(getUserDataPath(userId, "messages")),
    clearDir(getUserDataPath(userId, "file-changes")),
  ]);

  res.json({ status: "ok", steps: SEED_STEPS });
});

// Repo-connect screen's toggle — lets DEMO_MODE be flipped without restarting
// the server. GET is already covered by /api/health's demoMode field, so
// this only needs to handle the write side.
router.post("/demo-mode", (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({ error: "Not available in production." });
  }

  const { enabled } = req.body as { enabled?: boolean };
  if (typeof enabled !== "boolean") {
    return res.status(400).json({ error: "enabled (boolean) is required." });
  }

  setDemoMode(enabled);
  res.json({ demoMode: isDemoMode() });
});

export default router;
