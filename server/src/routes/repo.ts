import { Router } from "express";
import { getRepoTarget, putFileContent, deleteFile } from "../utils/github";
import { getFileChanges, updateFileChanges } from "../utils/fileChanges";
import { isDemoMode, demoDelay } from "../utils/demoMode";

const router = Router();

interface GithubRepo {
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string;
}

interface RepoSummary {
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string;
}

interface GithubBranch {
  name: string;
}

function githubHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "GameForge-Agent",
  };
}

router.get("/list", async (req, res) => {
  // requireAuth (mounted in index.ts) already guarantees req.authSession here.
  const accessToken = req.authSession!.access_token;

  const page = req.query.page ? Number(req.query.page) : 1;
  const perPage = req.query.per_page ? Number(req.query.per_page) : 100;

  const ghRes = await fetch(
    `https://api.github.com/user/repos?per_page=${perPage}&page=${page}&sort=updated`,
    { headers: githubHeaders(accessToken) }
  );

  if (!ghRes.ok) {
    return res.status(ghRes.status).json({ error: "Failed to fetch repositories from GitHub." });
  }

  const repos = (await ghRes.json()) as GithubRepo[];
  const summaries: RepoSummary[] = repos.map((r) => ({
    name: r.name,
    full_name: r.full_name,
    private: r.private,
    default_branch: r.default_branch,
  }));
  res.json(summaries);
});

// Spec says GET /api/repo/:fullName/branches, but a "/" inside a single Express
// param doesn't match — split "owner/repo" into two params instead.
router.get("/:owner/:repo/branches", async (req, res) => {
  const accessToken = req.authSession!.access_token;

  const { owner, repo } = req.params;
  const ghRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/branches?per_page=100`,
    { headers: githubHeaders(accessToken) }
  );

  if (!ghRes.ok) {
    return res.status(ghRes.status).json({ error: "Failed to fetch branches from GitHub." });
  }

  const branches = (await ghRes.json()) as GithubBranch[];
  res.json(branches.map((b) => b.name));
});

interface CommitBatchRequest {
  files?: Array<{ path: string; commitMessage: string }>;
}

interface CommitResult {
  path: string;
  commitSha: string | null;
}

interface CommitFailure {
  path: string;
  error: string;
}

// Commits the caller's selected subset of a Step's file-changes to the
// connected repo, one file per commit, in the order given. newContent is
// always written in full (never a patch/diff application). Files left
// unchecked simply aren't included in `files` and stay pending_changes —
// nothing here needs to know about them.
router.post("/:stepId/commit-batch", async (req, res) => {
  const userId = req.userId!;
  const stepId = Number(req.params.stepId);
  if (!Number.isInteger(stepId)) {
    return res.status(400).json({ error: "Invalid step id." });
  }

  const { files } = req.body as CommitBatchRequest;
  if (!files || files.length === 0) {
    return res.status(400).json({ error: "files is required and must be a non-empty array." });
  }

  // Demo mode never writes to a real repo — every requested file is reported
  // as committed with a placeholder sha, so a recording never leaves behind
  // real commits from take after take.
  if (isDemoMode()) {
    await demoDelay();
    const stored = await getFileChanges(userId, stepId);
    const committedPaths = new Set(files.map((f) => f.path));
    const committed: CommitResult[] = files.map(({ path }) => ({ path, commitSha: "demo0000000" }));
    const updatedFiles = stored.map((f) => (committedPaths.has(f.path) ? { ...f, approved: true } : f));
    await updateFileChanges(userId, stepId, updatedFiles);
    return res.json({ committed, failed: [], files: updatedFiles });
  }

  const target = await getRepoTarget(userId, req.authSession!.access_token);
  if (!target) {
    return res.status(401).json({ error: "Not logged in, or no repository connected yet." });
  }

  const stored = await getFileChanges(userId, stepId);
  const committed: CommitResult[] = [];
  const failed: CommitFailure[] = [];

  // Sequential on purpose — each commit builds on the repo state left by the
  // previous one, and errors need to be attributable to a single file.
  for (const { path, commitMessage } of files) {
    const record = stored.find((f) => f.path === path);
    if (!record) {
      failed.push({ path, error: "이 단계의 file-changes 목록에서 해당 경로를 찾을 수 없습니다." });
      continue;
    }

    try {
      if (record.changeType === "deleted") {
        const result = await deleteFile(target, path, commitMessage);
        committed.push({ path, commitSha: result?.commitSha ?? null });
      } else {
        const result = await putFileContent(target, path, record.newContent, commitMessage);
        committed.push({ path, commitSha: result.commitSha });
      }
    } catch (err) {
      failed.push({ path, error: err instanceof Error ? err.message : String(err) });
    }
  }

  const committedPaths = new Set(committed.map((c) => c.path));
  const updatedFiles = stored.map((f) => (committedPaths.has(f.path) ? { ...f, approved: true } : f));
  await updateFileChanges(userId, stepId, updatedFiles);

  res.json({ committed, failed, files: updatedFiles });
});

export default router;
