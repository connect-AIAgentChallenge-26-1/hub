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
  const messages = await getMessages(req.params.stepId);
  res.json(messages);
});

router.post("/:stepId/message", async (req, res) => {
  const stepId = Number(req.params.stepId);
  const { text } = req.body as { text?: string };

  if (!Number.isInteger(stepId)) {
    return res.status(400).json({ error: "Invalid step id." });
  }
  if (!text) {
    return res.status(400).json({ error: "text is required." });
  }

  const step = await getStep(stepId);
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

  const historyBefore = await getMessages(stepId);

  const userMessage: ChatMessage = {
    id: randomUUID(),
    from: "user",
    text,
    created_at: new Date().toISOString(),
  };
  await appendMessages(stepId, [userMessage]);

  try {
    if (docAgentConfig) {
      const result = await askAgent(docAgentConfig, historyBefore, text, step.agent_name);

      const agentMessage: ChatMessage = {
        id: randomUUID(),
        from: "agent",
        text: result.reply,
        created_at: new Date().toISOString(),
      };
      const messages = await appendMessages(stepId, [agentMessage]);

      const document =
        result.readyToGenerateDoc && result.document
          ? await saveDocument(stepId, docAgentConfig.docPath, result.document)
          : null;

      return res.json({ messages, document, files: null });
    }

    const result = await askFileAgent(fileAgentConfig, historyBefore, text, step.agent_name);

    const agentMessage: ChatMessage = {
      id: randomUUID(),
      from: "agent",
      text: result.reply,
      created_at: new Date().toISOString(),
    };
    const messages = await appendMessages(stepId, [agentMessage]);

    const files =
      result.readyToGenerateFiles && result.files
        ? await saveFileChanges(stepId, result.files)
        : null;

    res.json({ messages, document: null, files });
  } catch (err) {
    const status = err instanceof AiRequestError ? err.status : 500;
    res.status(status).json(toErrorResponseBody(err));
  }
});

// Manual "지금까지 내용으로 문서 만들기" — lets the user cut a doc-Agent
// conversation short instead of waiting for the Agent to decide it has asked
// enough questions. Only doc Agents support this; Code Generation/Refactoring
// (Step 7-8) have a completely different flow (file arrays, commit review)
// and are out of scope here.
router.post("/:stepId/finalize", async (req, res) => {
  const stepId = Number(req.params.stepId);
  if (!Number.isInteger(stepId)) {
    return res.status(400).json({ error: "Invalid step id." });
  }

  const step = await getStep(stepId);
  if (!step) {
    return res.status(404).json({ error: "Step not found." });
  }

  const docAgentConfig = AGENT_PROMPTS[step.agent_name];
  if (!docAgentConfig) {
    return res.status(400).json({ error: "이 단계는 지금 바로 문서 생성을 지원하지 않습니다." });
  }

  const historyBefore = await getMessages(stepId);

  try {
    const result = await askAgent(
      docAgentConfig,
      historyBefore,
      "(사용자가 지금까지의 내용만으로 문서 생성을 요청했습니다. 질문을 더 하지 말고 지금 바로 문서를 작성해주세요.)",
      step.agent_name,
      { finalize: true }
    );

    const agentMessage: ChatMessage = {
      id: randomUUID(),
      from: "agent",
      text: result.reply,
      created_at: new Date().toISOString(),
    };
    const messages = await appendMessages(stepId, [agentMessage]);

    const document = result.document ? await saveDocument(stepId, docAgentConfig.docPath, result.document) : null;

    res.json({ messages, document });
  } catch (err) {
    const status = err instanceof AiRequestError ? err.status : 500;
    res.status(status).json(toErrorResponseBody(err));
  }
});

export default router;
