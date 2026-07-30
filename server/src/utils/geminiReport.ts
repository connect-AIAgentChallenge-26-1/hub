import { GoogleGenAI } from "@google/genai";
import type { AnalyzedClass } from "./analyzer";
import type { DuplicateBlock } from "./jscpd";
import type { RefactorTarget } from "./refactorTargets";
import { toAiRequestError } from "./geminiError";

const MODEL = "gemini-flash-latest";

export interface ReportInputs {
  classes: AnalyzedClass[];
  duplicates: DuplicateBlock[];
  refactorTargets: RefactorTarget[];
}

// Detection is done entirely by Roslyn/jscpd/the rule-based flags above — Gemini's
// only job here is turning already-decided findings into readable prose. It isn't
// asked to judge whether the code is good or bad.
const SYSTEM_INSTRUCTION = `당신은 Unity C# 코드베이스의 정적 분석 리포트를 작성하는 어시스턴트입니다.

반드시 지켜야 할 규칙:
- 입력으로 주어진 데이터(클래스 목록, 중복 코드 블록, 이미 룰 기반으로 플래그된 리팩토링 대상)만 사용하세요. 스스로 코드 품질을 판단하거나 새로운 문제를 찾아내지 마세요 — 무엇이 문제인지는 이미 결정되어 주어집니다. 당신의 역할은 "왜 그렇게 플래그됐는지"를 사람이 읽기 좋은 문장으로 설명하는 것뿐입니다.
- 리포트 본문 어딘가에 반드시 이 문구를 그대로 포함하세요: "정적 분석 기반 추정치이며, 완전한 컴파일 분석은 아닙니다."
- 출력은 Markdown이며 최상단 제목은 "# Analysis Report"로 시작합니다.
- "## 통계 요약"과 "## 상세 목록" 두 섹션을 모두 포함하세요.`;

function buildPrompt({ classes, duplicates, refactorTargets }: ReportInputs): string {
  return `다음은 정적 분석 도구가 생성한 원본 데이터입니다. 이 데이터만 근거로 00_Analysis_Report.md 리포트를 작성해주세요.

## Roslyn 클래스 분석 결과 (JSON)
${JSON.stringify(classes, null, 2)}

## jscpd 중복 코드 탐지 결과 (JSON)
${JSON.stringify(duplicates, null, 2)}

## 룰 기반으로 이미 플래그된 리팩토링 대상 (JSON)
${JSON.stringify(refactorTargets, null, 2)}

리포트에는 다음을 포함하세요:
1. 통계 요약 — 클래스 의존성 수(참조/상속 관계 총합), 중복 코드 블록 수, 리팩토링 대상 수
2. 상세 목록 — 중복 코드 블록 각각에 대한 설명, 리팩토링 대상 각각이 왜 플래그됐는지 설명`;
}

export async function generateAnalysisReport(inputs: ReportInputs): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured on the server.");
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: buildPrompt(inputs),
      config: { systemInstruction: SYSTEM_INSTRUCTION },
    });

    if (!response.text) {
      throw new Error("Gemini returned an empty response.");
    }
    return response.text;
  } catch (err) {
    throw toAiRequestError(err);
  }
}
