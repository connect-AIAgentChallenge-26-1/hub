import { GoogleGenAI, Type } from "@google/genai";
import type { ChatMessage } from "./messages";
import type { FileAgentPromptConfig } from "./fileAgentPrompts";
import { computeUnifiedDiff } from "./diffCompute";

const MODEL = "gemini-flash-latest";
const MAX_RETRIES = 2; // total attempts = 1 + MAX_RETRIES

// Raw shape the model itself produces — no diff, the model only ever states
// the file's new full content.
interface RawFileChangeDraft {
  path: string;
  changeType: "new" | "modified" | "deleted";
  newContent: string;
  suggestedCommitMessage: string;
}

export interface FileChangeDraft extends RawFileChangeDraft {
  // Computed here from (oldContent from gatherContext's existingFiles vs
  // newContent) — never trusted from the model itself.
  diff: string;
}

export interface FileAgentResult {
  reply: string;
  readyToGenerateFiles: boolean;
  files?: FileChangeDraft[];
}

interface RawFileAgentResult {
  reply: string;
  readyToGenerateFiles: boolean;
  files?: RawFileChangeDraft[];
}

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    reply: { type: Type.STRING, description: "사용자에게 보여줄 대화 응답" },
    readyToGenerateFiles: { type: Type.BOOLEAN, description: "파일을 생성할 준비가 되었는지" },
    files: {
      type: Type.ARRAY,
      description: "readyToGenerateFiles가 true일 때만 채우는 파일별 변경 목록",
      items: {
        type: Type.OBJECT,
        properties: {
          path: { type: Type.STRING },
          changeType: { type: Type.STRING, enum: ["new", "modified", "deleted"] },
          newContent: {
            type: Type.STRING,
            description:
              "파일의 새 전체 내용 (패치나 일부분이 아니라 전체 파일 내용). deleted인 경우 빈 문자열.",
          },
          suggestedCommitMessage: { type: Type.STRING },
        },
        required: ["path", "changeType", "newContent", "suggestedCommitMessage"],
      },
    },
  },
  required: ["reply", "readyToGenerateFiles"],
} as const;

// Same structured-output approach as agentChat.ts, but the model has been
// observed to occasionally truncate long multi-file JSON responses (full
// file contents are long) — so unlike the single-document agents, this one
// retries with an explicit "respond with valid JSON only" nudge before
// giving up.
export async function askFileAgent(
  agentConfig: FileAgentPromptConfig,
  history: ChatMessage[],
  userMessage: string
): Promise<FileAgentResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured on the server.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const questionCount = history.filter((m) => m.from === "agent").length;
  const { text: contextText, existingFiles } = await agentConfig.gatherContext();
  const systemInstruction = agentConfig.buildSystemInstruction(contextText, questionCount);

  const baseContents = [
    ...history.map((m) => ({
      role: m.from === "user" ? "user" : "model",
      parts: [{ text: m.text }],
    })),
    { role: "user", parts: [{ text: userMessage }] },
  ];

  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const contents =
      attempt === 0
        ? baseContents
        : [
            ...baseContents,
            {
              role: "user",
              parts: [
                {
                  text: "이전 응답이 유효한 JSON으로 파싱되지 않았습니다. 다른 설명 없이, 스키마에 맞는 순수 JSON만 다시 응답해주세요.",
                },
              ],
            },
          ];

    try {
      const response = await ai.models.generateContent({
        model: MODEL,
        contents,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
        },
      });

      if (!response.text) {
        lastError = new Error("Gemini returned an empty response.");
        continue;
      }

      const raw = JSON.parse(response.text) as RawFileAgentResult;
      const files = raw.files?.map((f): FileChangeDraft => {
        const oldContent = f.changeType === "new" ? "" : existingFiles[f.path] ?? "";
        return { ...f, diff: computeUnifiedDiff(f.path, oldContent, f.newContent) };
      });

      return { reply: raw.reply, readyToGenerateFiles: raw.readyToGenerateFiles, files };
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(
    `Gemini structured output failed after ${MAX_RETRIES + 1} attempts: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}
