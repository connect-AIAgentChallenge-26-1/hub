import { Router } from "express";
import { promises as fs } from "fs";
import path from "path";
import { writeJson } from "../utils/jsonStore";
import { dataPath } from "../utils/paths";
import { STEPS_FILE, type Step } from "../utils/steps";
import { isDemoMode, setDemoMode } from "../utils/demoMode";

const router = Router();

const SEED_STEPS: Step[] = [
  { id: 1, name: "요구사항 분석", status: "active", progress_pct: 0, agent_name: "Requirements Agent" },
  { id: 2, name: "게임 기획", status: "pending", progress_pct: 0, agent_name: "Game Design Agent" },
  { id: 3, name: "게임 시스템 설계", status: "pending", progress_pct: 0, agent_name: "Game Systems Agent" },
  { id: 4, name: "클래스 설계 (UML)", status: "pending", progress_pct: 0, agent_name: "Class Design Agent" },
  { id: 5, name: "프로젝트 구조 설계", status: "pending", progress_pct: 0, agent_name: "Project Structure Agent" },
  { id: 6, name: "ScriptableObject 설계", status: "pending", progress_pct: 0, agent_name: "ScriptableObject Agent" },
  { id: 7, name: "코드 생성", status: "pending", progress_pct: 0, agent_name: "Code Generation Agent" },
  { id: 8, name: "리팩토링 및 코드 리뷰", status: "pending", progress_pct: 0, agent_name: "Refactoring Agent" },
  { id: 9, name: "문서화", status: "pending", progress_pct: 0, agent_name: "Documentation Agent" },
];

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
// touching project.json/session.json — repo connection and login should
// survive a reset, only the workflow progress gets wiped.
router.post("/reset", async (_req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({ error: "Not available in production." });
  }

  await writeJson(STEPS_FILE, SEED_STEPS);
  await Promise.all([
    clearDir(dataPath("documents")),
    clearDir(dataPath("messages")),
    clearDir(dataPath("file-changes")),
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
