import { GoogleGenAI, Type } from "@google/genai";
import type { ChatMessage } from "./messages";
import type { AgentPromptConfig } from "./agentPrompts";
import { toAiRequestError } from "./geminiError";
import { isDemoMode, demoDelay } from "./demoMode";
import { getMockDocAgentResponse } from "../demoData/mockDocAgent";

const MODEL = "gemini-flash-latest";

export interface AgentChatResult {
  reply: string;
  readyToGenerateDoc: boolean;
  document?: string;
}

// Appended on top of the Agent's own buildSystemInstruction when the user
// manually ends the conversation early (POST /finalize) — kept here instead
// of in every agent's prompt in agentPrompts.ts so every doc Agent gets this
// for free rather than needing its own copy of the same instruction.
const FINALIZE_INSTRUCTION = `

## 지금 바로 문서를 생성해야 합니다
사용자가 대화를 중간에 끊고, 지금까지 나눈 내용만으로 문서 생성을 요청했습니다.
아직 질문할 것이 남아있어도 더 질문하지 말고, readyToGenerateDoc을 반드시
true로 설정한 뒤 document를 채우세요. 정보가 부족해 확정하기 어려운 항목은
빈칸으로 두지 말고 "(추후 보완 필요)"라고 표시해서 채워 넣으세요.`;

interface AskAgentOptions {
  // Forces immediate document generation from whatever's in `history` so
  // far, regardless of the Agent's own "enough info gathered" judgment —
  // shares this exact function/call path with the normal auto-detection
  // flow, only the system instruction changes.
  finalize?: boolean;
}

// Shared by every agent — only the system instruction differs per agent_name
// (see agentPrompts.ts). Detection ("has enough info been gathered") and
// document drafting both happen in this one structured call rather than a
// separate round-trip, to keep the chat responsive.
export async function askAgent(
  agentConfig: AgentPromptConfig,
  history: ChatMessage[],
  userMessage: string,
  agentName: string,
  options: AskAgentOptions = {}
): Promise<AgentChatResult> {
  const questionCount = history.filter((m) => m.from === "agent").length;

  if (isDemoMode()) {
    await demoDelay();
    return getMockDocAgentResponse(agentName, agentConfig.docPath, questionCount, options.finalize ?? false);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured on the server.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const context = await agentConfig.gatherContext();

  const contents = [
    ...history.map((m) => ({
      role: m.from === "user" ? "user" : "model",
      parts: [{ text: m.text }],
    })),
    { role: "user", parts: [{ text: userMessage }] },
  ];

  const baseInstruction = agentConfig.buildSystemInstruction(context, questionCount);
  const systemInstruction = options.finalize ? baseInstruction + FINALIZE_INSTRUCTION : baseInstruction;

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            reply: { type: Type.STRING, description: "사용자에게 보여줄 대화 응답" },
            readyToGenerateDoc: { type: Type.BOOLEAN, description: "문서를 생성할 준비가 되었는지" },
            document: { type: Type.STRING, description: "readyToGenerateDoc이 true일 때만 채우는 전체 마크다운 문서" },
          },
          required: ["reply", "readyToGenerateDoc"],
        },
      },
    });

    if (!response.text) {
      throw new Error("Gemini returned an empty response.");
    }

    return JSON.parse(response.text) as AgentChatResult;
  } catch (err) {
    // Covers both a failed API call (429/network/auth) and a successful call
    // with an empty/malformed response — either way the caller only ever
    // sees the one stable AiRequestError shape.
    throw toAiRequestError(err);
  }
}
