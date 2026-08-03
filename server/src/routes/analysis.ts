import { Router } from "express";
import path from "path";
import { readJson, writeJson } from "../utils/jsonStore";
import { getUserDataPath, ANALYZER_DIR } from "../utils/paths";
import { runAnalyzer } from "../utils/analyzer";
import { runJscpd } from "../utils/jscpd";
import { findRefactorTargets } from "../utils/refactorTargets";
// generateAnalysisReport (Roslyn/jscpd 결과 -> Gemini 산문 리포트) is kept
// in geminiReport.ts for when the 9-step workflow's report screen is back in
// use, but the analysis pipeline itself no longer calls it — see analysis
// route's POST /start below.
import { saveDocument, getDocument } from "../utils/documents";
import { AiRequestError, toErrorResponseBody } from "../utils/geminiError";
import { isDemoMode, demoDelay } from "../utils/demoMode";
import { MOCK_ANALYSIS_STATS, MOCK_ANALYSIS_REPORT } from "../demoData/mockAnalysisReport";

const router = Router();

// We don't clone the target GitHub repo locally yet (that's still ahead of us), so
// there's no real checkout to point the analyzer/jscpd at — the bundled sample
// fixtures stand in for it until repo cloning exists.
const ANALYSIS_TARGET = path.join(ANALYZER_DIR, "samples");
const ANALYSIS_STEP_ID = 0; // 00_Analysis_Report.md sits ahead of the 9-step workflow proper.

// The preset picker UI (빠름/기본/상세) was removed from RepoConnectPage, so
// the client no longer sends a preset. There was never any actual branching
// on preset value in this pipeline — runAnalyzer/runJscpd always ran the
// same way regardless of what was stored in analysis_preset — so fixing it
// here doesn't drop any real behavior, only the no-longer-collected label.
// "standard" is picked because that's the option the old UI itself marked
// "권장"(recommended).
const DEFAULT_ANALYSIS_PRESET = "standard";

interface StartAnalysisRequest {
  repoId?: string;
  branch?: string;
}

interface AnalysisStats {
  dependencyCount: number;
  duplicateCount: number;
  refactorTargetCount: number;
  // v5: distinct namespaces actually observed in the repo — Code Generation
  // Agent uses this to follow the repo's real convention instead of guessing.
  namespaces: string[];
  // v9: name+filePath only (not the full AnalyzedClass shape — baseTypes/
  // referencedTypes/methodCount aren't needed here) so Code Generation Agent
  // can match a class-design doc's class names back to a real file already in
  // the repo. TTL'd rather than kept forever: the longer this sits, the more
  // likely the repo has moved on and a stale path would mislead Code
  // Generation into "modifying" a file that's since changed or been removed.
  classes: { name: string; filePath: string }[];
  classesExpiresAt: string;
}

const CLASSES_TTL_MS = 24 * 60 * 60 * 1000;

interface StoredProject {
  repo_url: string;
  branch: string;
  analysis_preset: string;
  connected_at: string;
  status: "queued" | "completed" | "failed";
  stats?: AnalysisStats;
}

async function readProjectSafely(userId: number): Promise<StoredProject | null> {
  try {
    return await readJson<StoredProject>(getUserDataPath(userId, "project.json"));
  } catch {
    return null;
  }
}

router.post("/start", async (req, res) => {
  const userId = req.userId!;
  const { repoId, branch } = req.body as StartAnalysisRequest;

  if (!repoId || !branch) {
    return res.status(400).json({ error: "repoId and branch are both required." });
  }

  const projectFile = getUserDataPath(userId, "project.json");

  let project: StoredProject = {
    repo_url: `https://github.com/${repoId}`,
    branch,
    analysis_preset: DEFAULT_ANALYSIS_PRESET,
    connected_at: new Date().toISOString(),
    status: "queued",
  };
  await writeJson(projectFile, project);

  try {
    // Demo mode skips the whole real pipeline (Roslyn/jscpd aren't Gemini
    // calls, but their real numbers on the sample fixtures wouldn't match
    // the mock report's prose — keeping stats and report text consistent
    // matters more here than only gating the literal Gemini call).
    if (isDemoMode()) {
      await demoDelay();
      await saveDocument(userId, ANALYSIS_STEP_ID, "docs/00_Analysis_Report.md", MOCK_ANALYSIS_REPORT);
      project = {
        ...project,
        status: "completed",
        stats: { ...MOCK_ANALYSIS_STATS, classesExpiresAt: new Date(Date.now() + CLASSES_TTL_MS).toISOString() },
      };
      await writeJson(projectFile, project);
      return res.json({ ...project, classes: [], duplicates: [], refactorTargets: [], report: MOCK_ANALYSIS_REPORT });
    }

    // Roslyn + jscpd only — the Gemini call that used to turn this into
    // 00_Analysis_Report.md prose has been removed from this pipeline (see
    // geminiReport.ts). analysis_status flips to "completed" as soon as this
    // structured data is saved, without waiting on an AI call.
    const { classes } = await runAnalyzer(ANALYSIS_TARGET);
    const { duplicates } = await runJscpd(ANALYSIS_TARGET);
    const refactorTargets = findRefactorTargets(classes);

    const stats: AnalysisStats = {
      dependencyCount: classes.reduce((sum, c) => sum + c.baseTypes.length + c.referencedTypes.length, 0),
      duplicateCount: duplicates.length,
      refactorTargetCount: refactorTargets.length,
      namespaces: Array.from(new Set(classes.map((c) => c.namespaceName).filter(Boolean))),
      classes: classes.map((c) => ({ name: c.name, filePath: c.filePath })),
      classesExpiresAt: new Date(Date.now() + CLASSES_TTL_MS).toISOString(),
    };
    project = { ...project, status: "completed", stats };
    await writeJson(projectFile, project);

    res.json({ ...project, classes, duplicates, refactorTargets });
  } catch (err) {
    project = { ...project, status: "failed" };
    await writeJson(projectFile, project);

    const status = err instanceof AiRequestError ? err.status : 500;
    res.status(status).json({ ...project, ...toErrorResponseBody(err) });
  }
});

router.get("/project", async (req, res) => {
  const project = await readProjectSafely(req.userId!);
  if (!project) {
    return res.status(404).json({ error: "No project connected yet." });
  }
  res.json({ repo_url: project.repo_url, branch: project.branch });
});

router.get("/report", async (req, res) => {
  const userId = req.userId!;
  const project = await readProjectSafely(userId);
  if (!project || project.status !== "completed" || !project.stats) {
    return res.status(404).json({ error: "No completed analysis report available." });
  }

  const doc = await getDocument(userId, ANALYSIS_STEP_ID);
  if (!doc) {
    return res.status(404).json({ error: "No completed analysis report available." });
  }

  res.json({ stats: project.stats, report: doc.content, updated_at: doc.updated_at });
});

export default router;
