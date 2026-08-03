import { Router } from "express";
import { randomUUID } from "crypto";
import { getMessages, appendMessages, type ChatMessage } from "../utils/messages";
import { saveDocument } from "../utils/documents";
import { saveFileChanges } from "../utils/fileChanges";
import { getStep } from "../utils/steps";
import { AGENT_PROMPTS } from "../utils/agentPrompts";
import { askAgent } from "../utils/agentChat";
import { FILE_AGENT_PROMPTS } from "../utils/fileAgentPrompts";
import { askFileAgent } from "../utils/fileAgentChat";
import { AiRequestError, toErrorResponseBody } from "../utils/geminiError";

const router = Router();

router.get("/:stepId/messages", async (req, res) => {
  const messages = await getMessages(req.userId!, req.params.stepId);
  res.json(messages);
});

router.post("/:stepId/message", async (req, res) => {
  const userId = req.userId!;
  const stepId = Number(req.params.stepId);
  const { text } = req.body as { text?: string };

  if (!Number.isInteger(stepId)) {
    return res.status(400).json({ error: "Invalid step id." });
  }
  if (!text) {
    return res.status(400).json({ error: "text is required." });
  }

  const step = await getStep(userId, stepId);
  if (!step) {
    return res.status(404).json({ error: "Step not found." });
  }

  // Which Agent handles this Step, and whether it produces a single Markdown
  // document or a structured file-change array, is entirely data-driven
  // (Step.agent_name looked up against two registries) — nothing here
  // branches on stepId itself.
  const docAgentConfig = AGENT_PROMPTS[step.agent_name];
  const fileAgentConfig = FILE_AGENT_PROMPTS[step.agent_name];

  if (!docAgentConfig && !fileAgentConfig) {
    return res.status(501).json({
      error: `"${step.agent_name}"용 프롬프트가 아직 준비되지 않았습니다.`,
    });
  }

  const historyBefore = await getMessages(userId, stepId);

  const userMessage: ChatMessage = {
    id: randomUUID(),
    from: "user",
    text,
    created_at: new Date().toISOString(),
  };
  await appendMessages(userId, stepId, [userMessage]);

  try {
    if (docAgentConfig) {
      const result = await askAgent(docAgentConfig, historyBefore, text, step.agent_name, userId);

      const agentMessage: ChatMessage = {
        id: randomUUID(),
        from: "agent",
        text: result.reply,
        created_at: new Date().toISOString(),
      };
      const messages = await appendMessages(userId, stepId, [agentMessage]);

      const document =
        result.readyToGenerateDoc && result.document
          ? await saveDocument(userId, stepId, docAgentConfig.docPath, result.document)
          : null;

      return res.json({ messages, document, files: null });
    }

    const result = await askFileAgent(
      fileAgentConfig,
      historyBefore,
      text,
      step.agent_name,
      userId,
      req.authSession!.access_token
    );

    const agentMessage: ChatMessage = {
      id: randomUUID(),
      from: "agent",
      text: result.reply,
      created_at: new Date().toISOString(),
    };
    const messages = await appendMessages(userId, stepId, [agentMessage]);

    const files =
      result.readyToGenerateFiles && result.files
        ? await saveFileChanges(userId, stepId, result.files)
        : null;

    res.json({ messages, document: null, files });
  } catch (err) {
    const status = err instanceof AiRequestError ? err.status : 500;
    res.status(status).json(toErrorResponseBody(err));
  }
});

// Forces immediate generation instead of waiting for the Agent to decide
// it's asked enough questions (or, for v5's chat-less Steps 7/9, instead of
// there being any chat at all). Doc Agents (1,3-6,9 + Game Design) and file
// Agents (Code Generation/Refactoring) both go through here — same idea,
// different save step at the end (saveDocument vs saveFileChanges).
router.post("/:stepId/finalize", async (req, res) => {
  const userId = req.userId!;
  const stepId = Number(req.params.stepId);
  if (!Number.isInteger(stepId)) {
    return res.status(400).json({ error: "Invalid step id." });
  }

  const step = await getStep(userId, stepId);
  if (!step) {
    return res.status(404).json({ error: "Step not found." });
  }

  const docAgentConfig = AGENT_PROMPTS[step.agent_name];
  const fileAgentConfig = FILE_AGENT_PROMPTS[step.agent_name];
  if (!docAgentConfig && !fileAgentConfig) {
    return res.status(400).json({ error: "이 단계는 지금 바로 생성하기를 지원하지 않습니다." });
  }

  const historyBefore = await getMessages(userId, stepId);

  try {
    if (docAgentConfig) {
      const result = await askAgent(
        docAgentConfig,
        historyBefore,
        "(사용자가 지금까지의 내용만으로 문서 생성을 요청했습니다. 질문을 더 하지 말고 지금 바로 문서를 작성해주세요.)",
        step.agent_name,
        userId,
        { finalize: true }
      );

      const agentMessage: ChatMessage = {
        id: randomUUID(),
        from: "agent",
        text: result.reply,
        created_at: new Date().toISOString(),
      };
      const messages = await appendMessages(userId, stepId, [agentMessage]);

      const document = result.document
        ? await saveDocument(userId, stepId, docAgentConfig.docPath, result.document)
        : null;

      return res.json({ messages, document, files: null });
    }

    const result = await askFileAgent(
      fileAgentConfig,
      historyBefore,
      "(사용자 개입 없이 자동으로 호출되었습니다. 입력 문서만으로 지금 바로 파일을 생성해주세요.)",
      step.agent_name,
      userId,
      req.authSession!.access_token,
      { finalize: true }
    );

    const agentMessage: ChatMessage = {
      id: randomUUID(),
      from: "agent",
      text: result.reply,
      created_at: new Date().toISOString(),
    };
    const messages = await appendMessages(userId, stepId, [agentMessage]);

    const files = result.files ? await saveFileChanges(userId, stepId, result.files) : null;

    res.json({ messages, document: null, files });
  } catch (err) {
    const status = err instanceof AiRequestError ? err.status : 500;
    res.status(status).json(toErrorResponseBody(err));
  }
});

export default router;
