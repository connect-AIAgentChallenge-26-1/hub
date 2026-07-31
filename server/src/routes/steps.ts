import { Router } from "express";
import { writeJson } from "../utils/jsonStore";
import { getDocument } from "../utils/documents";
import { calculateChecklistProgress } from "../utils/checklist";
import { getFileChanges } from "../utils/fileChanges";
import { FILE_AGENT_PROMPTS } from "../utils/fileAgentPrompts";
import { AGENT_PROMPTS } from "../utils/agentPrompts";
import { getRepoTarget, putFileContent } from "../utils/github";
import { getSteps, stepsFile, type Step } from "../utils/steps";
import { isDemoMode, demoDelay } from "../utils/demoMode";

const router = Router();

// Steps whose Agent produces a file-change array (Code Generation/Refactoring)
// track progress as "approved files / total proposed files" instead of the
// checklist-based calc every other Step uses — driven by which registry the
// Step's agent_name is in, not by a hardcoded step id.
async function withFreshProgress(userId: number, steps: Step[]): Promise<Step[]> {
  return Promise.all(
    steps.map(async (step) => {
      if (step.agent_name in FILE_AGENT_PROMPTS) {
        const files = await getFileChanges(userId, step.id);
        const progress_pct =
          files.length === 0 ? 0 : Math.round((files.filter((f) => f.approved).length / files.length) * 100);
        return { ...step, progress_pct };
      }

      const doc = await getDocument(userId, step.id);
      const progress_pct = doc ? calculateChecklistProgress(doc.content) : 0;
      return { ...step, progress_pct };
    })
  );
}

router.get("/", async (req, res) => {
  const userId = req.userId!;
  res.json(await withFreshProgress(userId, await getSteps(userId)));
});

router.get("/:stepId/file-changes", async (req, res) => {
  res.json(await getFileChanges(req.userId!, req.params.stepId));
});

// For a document-producing Step, Approve now also commits the doc to the
// repo before flipping local status — file-producing Steps (Code
// Generation/Refactoring) are committed separately via
// POST /api/repo/:stepId/commit-batch, so this is a no-op for those.
router.post("/:stepId/approve", async (req, res) => {
  const userId = req.userId!;
  const stepId = Number(req.params.stepId);
  if (!Number.isInteger(stepId)) {
    return res.status(400).json({ error: "Invalid step id." });
  }

  const steps = await getSteps(userId);
  const step = steps.find((s) => s.id === stepId);
  if (!step) {
    return res.status(404).json({ error: "Step not found." });
  }

  const docAgentConfig = AGENT_PROMPTS[step.agent_name];
  if (docAgentConfig) {
    const doc = await getDocument(userId, stepId);
    if (doc) {
      // Same demo safety net as commit-batch: Approve is part of every demo
      // run (chat -> doc -> Approve), so without this a re-recorded take
      // would still push a real commit on every single pass.
      if (isDemoMode()) {
        await demoDelay();
      } else {
        const target = await getRepoTarget(userId, req.authSession!.access_token);
        if (!target) {
          return res.status(401).json({ error: "Not logged in, or no repository connected yet." });
        }
        try {
          await putFileContent(target, doc.path, doc.content, `docs: update ${doc.path}`);
        } catch (err) {
          return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
        }
      }
    }
  }

  const updated = steps.map((s): Step => {
    if (s.id === stepId) return { ...s, status: "done" };
    if (s.id === stepId + 1) return { ...s, status: "active" };
    return s;
  });
  await writeJson(stepsFile(userId), updated);

  res.json(await withFreshProgress(userId, updated));
});

export default router;
