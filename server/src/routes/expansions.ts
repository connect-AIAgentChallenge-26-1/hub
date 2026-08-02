import { Router } from "express";
import { randomUUID } from "crypto";
import { createExpansion, getExpansionRequest, updateExpansionStatus } from "../utils/expansions";
import { createExpansionSteps, getExpansionSteps, advanceExpansionSteps } from "../utils/expansionSteps";
import { getExpansionDocument, saveExpansionDocument } from "../utils/expansionDocuments";
import { getExpansionMessages, appendExpansionMessages } from "../utils/expansionMessages";
import {
  buildDesignAgentConfig,
  buildScriptableObjectAgentConfig,
  buildExpansionDocumentationAgentConfig,
} from "../utils/expansionAgentPrompts";
import {
  buildExpansionCodeGenerationAgentConfig,
  buildExpansionCodeReviewAgentConfig,
} from "../utils/expansionFileAgentPrompts";
import { askAgent } from "../utils/agentChat";
import { askFileAgent } from "../utils/fileAgentChat";
import {
  getExpansionFileChanges,
  saveExpansionFileChanges,
  mergeExpansionFileChanges,
  updateExpansionFileChanges,
} from "../utils/expansionFileChanges";
import { getRepoTarget, putFileContent, deleteFile } from "../utils/github";
import { calculateChecklistProgress } from "../utils/checklist";
import { isDemoMode, demoDelay } from "../utils/demoMode";
import type { ChatMessage } from "../utils/messages";
import { AiRequestError, toErrorResponseBody } from "../utils/geminiError";

const router = Router();

const DESIGN_MESSAGES_FILE = "design-messages.json";
const DESIGN_DOC_FILE = "design.json";
const SO_DOC_FILE = "scriptable-objects.json";
const DOCS_DOC_FILE = "docs.json";

interface CreateExpansionRequest {
  description?: string;
}

router.post("/", async (req, res) => {
  const { description } = req.body as CreateExpansionRequest;
  if (!description || !description.trim()) {
    return res.status(400).json({ error: "description is required." });
  }

  const { expansionId, request } = await createExpansion(req.userId!, description.trim());
  await createExpansionSteps(req.userId!, expansionId);
  res.status(201).json({ expansionId, ...request });
});

router.get("/:expansionId", async (req, res) => {
  const request = await getExpansionRequest(req.userId!, req.params.expansionId);
  if (!request) {
    return res.status(404).json({ error: "Expansion not found." });
  }
  res.json(request);
});

// Sidebar progress display — mirrors routes/steps.ts's withFreshProgress:
// status (pending/active/done) is persisted in steps.json and only mutated
// by the approve endpoints below, but progress_pct is always recomputed
// fresh here so it never goes stale between saves.
router.get("/:expansionId/steps", async (req, res) => {
  const userId = req.userId!;
  const expansionId = req.params.expansionId;
  const steps = await getExpansionSteps(userId, expansionId);
  if (steps.length === 0) {
    return res.status(404).json({ error: "Expansion not found." });
  }

  const [designDoc, soDoc, docsDoc, files] = await Promise.all([
    getExpansionDocument(userId, expansionId, DESIGN_DOC_FILE),
    getExpansionDocument(userId, expansionId, SO_DOC_FILE),
    getExpansionDocument(userId, expansionId, DOCS_DOC_FILE),
    getExpansionFileChanges(userId, expansionId),
  ]);

  // Steps 3-4 (코드 생성/코드 리뷰) share one file-changes.json — same
  // "approved / total" ratio the 9-step workflow uses for its own file-agent
  // Steps (7-8), just read from the shared list instead of a per-step one
  // since Code Generation and Code Review are chained into a single call.
  const fileProgress =
    files.length === 0 ? 0 : Math.round((files.filter((f) => f.approved).length / files.length) * 100);

  const withProgress = steps.map((step) => {
    switch (step.id) {
      case 1:
        return { ...step, progress_pct: designDoc ? calculateChecklistProgress(designDoc.content) : 0 };
      case 2:
        return { ...step, progress_pct: soDoc ? calculateChecklistProgress(soDoc.content) : 0 };
      case 3:
      case 4:
        return { ...step, progress_pct: fileProgress };
      case 5:
        return { ...step, progress_pct: docsDoc ? calculateChecklistProgress(docsDoc.content) : 0 };
      case 6:
        // No standalone checklist/file list of its own — Step 6 is a single
        // commit action triggered together with Step 5's approve.
        return { ...step, progress_pct: step.status === "done" ? 100 : 0 };
      default:
        return step;
    }
  });

  res.json(withProgress);
});

// ---- Step 1: 설계 변경 제안 (chat-based, mirrors /api/chat + /api/documents) ----

router.get("/:expansionId/design/messages", async (req, res) => {
  const messages = await getExpansionMessages(req.userId!, req.params.expansionId, DESIGN_MESSAGES_FILE);
  res.json(messages);
});

router.get("/:expansionId/design", async (req, res) => {
  const doc = await getExpansionDocument(req.userId!, req.params.expansionId, DESIGN_DOC_FILE);
  if (!doc) {
    return res.status(404).json({ error: "Document not found." });
  }
  res.json(doc);
});

router.put("/:expansionId/design", async (req, res) => {
  const { content, path } = req.body as { content?: string; path?: string };
  if (!content) {
    return res.status(400).json({ error: "content is required." });
  }

  const userId = req.userId!;
  const expansionId = req.params.expansionId;
  const existing = await getExpansionDocument(userId, expansionId, DESIGN_DOC_FILE);
  const docPath = path ?? existing?.path;
  if (!docPath) {
    return res.status(400).json({ error: "path is required for a new document." });
  }

  const record = await saveExpansionDocument(userId, expansionId, DESIGN_DOC_FILE, docPath, content);
  res.json(record);
});

router.post("/:expansionId/design/message", async (req, res) => {
  const userId = req.userId!;
  const expansionId = req.params.expansionId;
  const { text } = req.body as { text?: string };
  if (!text) {
    return res.status(400).json({ error: "text is required." });
  }

  const request = await getExpansionRequest(userId, expansionId);
  if (!request) {
    return res.status(404).json({ error: "Expansion not found." });
  }

  const historyBefore = await getExpansionMessages(userId, expansionId, DESIGN_MESSAGES_FILE);
  const userMessage: ChatMessage = {
    id: randomUUID(),
    from: "user",
    text,
    created_at: new Date().toISOString(),
  };
  await appendExpansionMessages(userId, expansionId, DESIGN_MESSAGES_FILE, [userMessage]);

  try {
    const config = buildDesignAgentConfig(expansionId);
    const result = await askAgent(config, historyBefore, text, "Feature Design Agent", userId);

    const agentMessage: ChatMessage = {
      id: randomUUID(),
      from: "agent",
      text: result.reply,
      created_at: new Date().toISOString(),
    };
    const messages = await appendExpansionMessages(userId, expansionId, DESIGN_MESSAGES_FILE, [agentMessage]);

    const document =
      result.readyToGenerateDoc && result.document
        ? await saveExpansionDocument(userId, expansionId, DESIGN_DOC_FILE, config.docPath, result.document)
        : null;

    res.json({ messages, document });
  } catch (err) {
    const status = err instanceof AiRequestError ? err.status : 500;
    res.status(status).json(toErrorResponseBody(err));
  }
});

router.post("/:expansionId/design/finalize", async (req, res) => {
  const userId = req.userId!;
  const expansionId = req.params.expansionId;

  const request = await getExpansionRequest(userId, expansionId);
  if (!request) {
    return res.status(404).json({ error: "Expansion not found." });
  }

  const historyBefore = await getExpansionMessages(userId, expansionId, DESIGN_MESSAGES_FILE);

  try {
    const config = buildDesignAgentConfig(expansionId);
    const result = await askAgent(
      config,
      historyBefore,
      "(사용자가 지금까지의 내용만으로 문서 생성을 요청했습니다. 질문을 더 하지 말고 지금 바로 문서를 작성해주세요.)",
      "Feature Design Agent",
      userId,
      { finalize: true }
    );

    const agentMessage: ChatMessage = {
      id: randomUUID(),
      from: "agent",
      text: result.reply,
      created_at: new Date().toISOString(),
    };
    const messages = await appendExpansionMessages(userId, expansionId, DESIGN_MESSAGES_FILE, [agentMessage]);

    const document = result.document
      ? await saveExpansionDocument(userId, expansionId, DESIGN_DOC_FILE, config.docPath, result.document)
      : null;

    res.json({ messages, document });
  } catch (err) {
    const status = err instanceof AiRequestError ? err.status : 500;
    res.status(status).json(toErrorResponseBody(err));
  }
});

router.post("/:expansionId/design/approve", async (req, res) => {
  const updated = await updateExpansionStatus(req.userId!, req.params.expansionId, "scriptable_objects_pending");
  if (!updated) {
    return res.status(404).json({ error: "Expansion not found." });
  }
  await advanceExpansionSteps(req.userId!, req.params.expansionId, [1], [2]);
  res.json(updated);
});

// ---- Step 2: ScriptableObject 생성 (chat-less auto-generate, mirrors the
// 9-step workflow's Code Generation/Documentation Agent finalize pattern) ----

router.get("/:expansionId/scriptable-objects", async (req, res) => {
  const doc = await getExpansionDocument(req.userId!, req.params.expansionId, SO_DOC_FILE);
  if (!doc) {
    return res.status(404).json({ error: "Document not found." });
  }
  res.json(doc);
});

router.put("/:expansionId/scriptable-objects", async (req, res) => {
  const { content, path } = req.body as { content?: string; path?: string };
  if (!content) {
    return res.status(400).json({ error: "content is required." });
  }

  const userId = req.userId!;
  const expansionId = req.params.expansionId;
  const existing = await getExpansionDocument(userId, expansionId, SO_DOC_FILE);
  const docPath = path ?? existing?.path;
  if (!docPath) {
    return res.status(400).json({ error: "path is required for a new document." });
  }

  const record = await saveExpansionDocument(userId, expansionId, SO_DOC_FILE, docPath, content);
  res.json(record);
});

router.post("/:expansionId/scriptable-objects/generate", async (req, res) => {
  const userId = req.userId!;
  const expansionId = req.params.expansionId;

  const request = await getExpansionRequest(userId, expansionId);
  if (!request) {
    return res.status(404).json({ error: "Expansion not found." });
  }

  try {
    const config = buildScriptableObjectAgentConfig(expansionId);
    const result = await askAgent(
      config,
      [],
      "(사용자 개입 없이 자동으로 호출되었습니다. 승인된 설계 변경안만으로 지금 바로 생성해주세요.)",
      "Feature ScriptableObject Agent",
      userId,
      { finalize: true }
    );

    const document = result.document
      ? await saveExpansionDocument(userId, expansionId, SO_DOC_FILE, config.docPath, result.document)
      : null;

    res.json({ document });
  } catch (err) {
    const status = err instanceof AiRequestError ? err.status : 500;
    res.status(status).json(toErrorResponseBody(err));
  }
});

router.post("/:expansionId/scriptable-objects/approve", async (req, res) => {
  const updated = await updateExpansionStatus(req.userId!, req.params.expansionId, "code_pending");
  if (!updated) {
    return res.status(404).json({ error: "Expansion not found." });
  }
  // Steps 3-4 share one screen (code/generate chains Code Generation then
  // Code Review) — both become active together the moment that screen opens.
  await advanceExpansionSteps(req.userId!, req.params.expansionId, [2], [3, 4]);
  res.json(updated);
});

// ---- Steps 3-4: Unity 코드 생성 + 코드 리뷰 (chat-less, chained) ----
//
// Both steps reuse the 9-step workflow's existing Code Generation/Refactoring
// Agent pipeline as-is (askFileAgent, syntax validation via
// expansionFileChanges.ts's shared validateSyntax call, diff computation
// inside askFileAgent/fileAgentChat.ts) — only the input source and save
// location differ. Chained into one call + one combined review screen
// (rather than two separate approve gates) since Code Review's own prompt
// can legitimately decide there's nothing to flag, and a single commit-review
// list is simpler than tracking "has review already run" separately.

router.get("/:expansionId/file-changes", async (req, res) => {
  const files = await getExpansionFileChanges(req.userId!, req.params.expansionId);
  res.json(files);
});

router.post("/:expansionId/code/generate", async (req, res) => {
  const userId = req.userId!;
  const expansionId = req.params.expansionId;
  const accessToken = req.authSession!.access_token;

  const request = await getExpansionRequest(userId, expansionId);
  if (!request) {
    return res.status(404).json({ error: "Expansion not found." });
  }

  try {
    const codeGenConfig = buildExpansionCodeGenerationAgentConfig(expansionId);
    const codeGenResult = await askFileAgent(
      codeGenConfig,
      [],
      "(사용자 개입 없이 자동으로 호출되었습니다. 승인된 설계 변경안만으로 지금 바로 생성해주세요.)",
      "Feature Code Generation Agent",
      userId,
      accessToken,
      { finalize: true }
    );
    if (codeGenResult.files) {
      await saveExpansionFileChanges(userId, expansionId, codeGenResult.files);
    }

    const reviewConfig = buildExpansionCodeReviewAgentConfig(expansionId);
    const reviewResult = await askFileAgent(
      reviewConfig,
      [],
      "(사용자 개입 없이 자동으로 호출되었습니다. 방금 생성된 코드만 대상으로 지금 바로 검토해주세요.)",
      "Feature Code Review Agent",
      userId,
      accessToken,
      { finalize: true }
    );
    const files = reviewResult.files
      ? await mergeExpansionFileChanges(userId, expansionId, reviewResult.files)
      : await getExpansionFileChanges(userId, expansionId);

    res.json({ files });
  } catch (err) {
    const status = err instanceof AiRequestError ? err.status : 500;
    res.status(status).json(toErrorResponseBody(err));
  }
});

router.post("/:expansionId/code/approve", async (req, res) => {
  const updated = await updateExpansionStatus(req.userId!, req.params.expansionId, "docs_pending");
  if (!updated) {
    return res.status(404).json({ error: "Expansion not found." });
  }
  // Steps 5-6 likewise share one screen (docs/approve both saves the change
  // log and triggers the real commit) — both become active together.
  await advanceExpansionSteps(req.userId!, req.params.expansionId, [3, 4], [5, 6]);
  res.json(updated);
});

// ---- Step 5: 변경 사항 문서화 (chat-less auto-generate, same pattern as
// Steps 2/3-4) ----

router.get("/:expansionId/docs", async (req, res) => {
  const doc = await getExpansionDocument(req.userId!, req.params.expansionId, DOCS_DOC_FILE);
  if (!doc) {
    return res.status(404).json({ error: "Document not found." });
  }
  res.json(doc);
});

router.put("/:expansionId/docs", async (req, res) => {
  const { content, path } = req.body as { content?: string; path?: string };
  if (!content) {
    return res.status(400).json({ error: "content is required." });
  }

  const userId = req.userId!;
  const expansionId = req.params.expansionId;
  const existing = await getExpansionDocument(userId, expansionId, DOCS_DOC_FILE);
  const docPath = path ?? existing?.path;
  if (!docPath) {
    return res.status(400).json({ error: "path is required for a new document." });
  }

  const record = await saveExpansionDocument(userId, expansionId, DOCS_DOC_FILE, docPath, content);
  res.json(record);
});

router.post("/:expansionId/docs/generate", async (req, res) => {
  const userId = req.userId!;
  const expansionId = req.params.expansionId;

  const request = await getExpansionRequest(userId, expansionId);
  if (!request) {
    return res.status(404).json({ error: "Expansion not found." });
  }

  try {
    const config = buildExpansionDocumentationAgentConfig(expansionId);
    const result = await askAgent(
      config,
      [],
      "(사용자 개입 없이 자동으로 호출되었습니다. 지금까지의 산출물만으로 지금 바로 작성해주세요.)",
      "Feature Documentation Agent",
      userId,
      { finalize: true }
    );

    const document = result.document
      ? await saveExpansionDocument(userId, expansionId, DOCS_DOC_FILE, config.docPath, result.document)
      : null;

    res.json({ document });
  } catch (err) {
    const status = err instanceof AiRequestError ? err.status : 500;
    res.status(status).json(toErrorResponseBody(err));
  }
});

// ---- Step 6: Git Commit Message 생성 + 실제 커밋 ----
//
// Reuses the exact same GitHub-writing functions (getRepoTarget/
// putFileContent/deleteFile) as /api/repo/:stepId/commit-batch — the only
// new code here is the orchestration (which files, which path for the
// change-log doc), not the commit mechanics themselves. Per-file commit
// messages were already generated back in Step 3 (suggestedCommitMessage),
// so this step's own job really is just "trigger the commit" as the spec
// describes — one combined action rather than a separate manual
// checkbox-driven batch, since there's no separate UI state to carry a
// partial file selection across the Step 3-4 screen and this one.
//
// Files still flagged syntaxValid:false are skipped rather than committed —
// same "don't commit broken code by default" intent as the commit-review
// screen's default-unchecked behavior, just enforced here since there's no
// checkbox UI feeding this trigger. request.json only advances to
// "completed" if every commit (code files + the change-log doc) succeeds;
// otherwise it stays on "docs_pending" so the user can retry.
router.post("/:expansionId/docs/approve", async (req, res) => {
  const userId = req.userId!;
  const expansionId = req.params.expansionId;

  const request = await getExpansionRequest(userId, expansionId);
  if (!request) {
    return res.status(404).json({ error: "Expansion not found." });
  }

  const docDoc = await getExpansionDocument(userId, expansionId, DOCS_DOC_FILE);
  const storedFiles = await getExpansionFileChanges(userId, expansionId);
  const committableFiles = storedFiles.filter((f) => f.syntaxValid);
  const skipped = storedFiles.filter((f) => !f.syntaxValid).map((f) => f.path);

  // v22: docs/{project 9-step docs} use numbered filenames (01_Requirements.md
  // etc.) since there's exactly one of each per project. A feature expansion's
  // change log isn't like that — a project can accumulate many of these over
  // time — so it gets its own docs/changes/ subdirectory keyed by expansion_id
  // (already the canonical identifier for this expansion everywhere else)
  // rather than trying to slugify the free-text request into a filename.
  const docCommitPath = `docs/changes/${expansionId}.md`;
  const docCommitMessage = `docs: add change log for "${request.description}"`;

  if (isDemoMode()) {
    await demoDelay();
    const committed = committableFiles.map((f) => ({ path: f.path, commitSha: "demo0000000" }));
    if (docDoc) committed.push({ path: docCommitPath, commitSha: "demo0000000" });

    const updatedFiles = storedFiles.map((f) => (f.syntaxValid ? { ...f, approved: true } : f));
    await updateExpansionFileChanges(userId, expansionId, updatedFiles);
    const updatedRequest = await updateExpansionStatus(userId, expansionId, "completed");
    await advanceExpansionSteps(userId, expansionId, [5, 6], []);

    return res.json({ committed, failed: [], skipped, request: updatedRequest });
  }

  const target = await getRepoTarget(userId, req.authSession!.access_token);
  if (!target) {
    return res.status(401).json({ error: "Not logged in, or no repository connected yet." });
  }

  const committed: Array<{ path: string; commitSha: string | null }> = [];
  const failed: Array<{ path: string; error: string }> = [];

  // Sequential, same reasoning as commit-batch: each commit builds on the
  // repo state left by the previous one.
  for (const f of committableFiles) {
    try {
      if (f.changeType === "deleted") {
        const result = await deleteFile(target, f.path, f.suggestedCommitMessage);
        committed.push({ path: f.path, commitSha: result?.commitSha ?? null });
      } else {
        const result = await putFileContent(target, f.path, f.newContent, f.suggestedCommitMessage);
        committed.push({ path: f.path, commitSha: result.commitSha });
      }
    } catch (err) {
      failed.push({ path: f.path, error: err instanceof Error ? err.message : String(err) });
    }
  }

  if (docDoc) {
    try {
      const result = await putFileContent(target, docCommitPath, docDoc.content, docCommitMessage);
      committed.push({ path: docCommitPath, commitSha: result.commitSha });
    } catch (err) {
      failed.push({ path: docCommitPath, error: err instanceof Error ? err.message : String(err) });
    }
  }

  const committedPaths = new Set(committed.map((c) => c.path));
  const updatedFiles = storedFiles.map((f) => (committedPaths.has(f.path) ? { ...f, approved: true } : f));
  await updateExpansionFileChanges(userId, expansionId, updatedFiles);

  const updatedRequest =
    failed.length === 0 ? await updateExpansionStatus(userId, expansionId, "completed") : request;
  if (failed.length === 0) {
    await advanceExpansionSteps(userId, expansionId, [5, 6], []);
  }

  res.json({ committed, failed, skipped, request: updatedRequest });
});

export default router;
