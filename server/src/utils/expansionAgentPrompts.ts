import type { AgentPromptConfig } from "./agentPrompts";
import { getDocument } from "./documents";
import { getExpansionRequest } from "./expansions";
import { getExpansionDocument } from "./expansionDocuments";
import { getExpansionFileChanges } from "./expansionFileChanges";

const NO_DOC = "(아직 작성된 문서가 없습니다)";

const CHECKLIST_REMINDER = `document는 마크다운 체크리스트(- [ ] 항목)를 섹션마다 포함해야 합니다. 대화에서 확인된 내용마다 하나씩 항목으로 넣어주세요.`;

// The 9-step workflow's own design docs (Requirements..ScriptableObject),
// read via the existing getDocument() the 9-step workflow itself uses — if
// none exist (feature flag off / never run / brand-new project), falls back
// to the original repo analysis (step 0) instead.
async function gatherExistingProjectDesignContext(userId: number): Promise<string> {
  const docs = await Promise.all([1, 2, 3, 4, 5, 6].map((id) => getDocument(userId, id)));
  const nonEmpty = docs.filter((d): d is NonNullable<(typeof docs)[number]> => Boolean(d?.content));
  if (nonEmpty.length > 0) {
    return nonEmpty.map((d) => d.content).join("\n\n---\n\n");
  }
  const analysisDoc = await getDocument(userId, 0);
  return analysisDoc?.content || NO_DOC;
}

// v20: expansionId is captured via closure rather than threaded through
// gatherContext's signature, since that signature — (userId) => Promise<string>
// — is shared with (and must not be widened for) the 9-step workflow's
// askAgent/AgentPromptConfig in agentChat.ts/agentPrompts.ts.
export function buildDesignAgentConfig(expansionId: string): AgentPromptConfig {
  return {
    docPath: "design.md",
    gatherContext: async (userId) => {
      const request = await getExpansionRequest(userId, expansionId);
      const projectContext = await gatherExistingProjectDesignContext(userId);
      return `## 사용자가 요청한 기능\n${request?.description ?? NO_DOC}\n\n## 기존 프로젝트 설계 참고 자료\n${projectContext}`;
    },
    buildSystemInstruction: (context, questionCount) => `당신은 GameForge Agent의 "Feature Design Agent"입니다.
이미 존재하는 프로젝트에 사용자가 요청한 기능 하나를 추가하기 위한 설계 변경안을
구체화하는 역할입니다. 게임 전체를 새로 기획하는 게 아니라, 이 기능이 기존 설계
(있다면)와 어떻게 맞물리는지, 어떤 시스템/데이터가 새로 필요하거나 바뀌어야
하는지를 다룹니다.

## 입력
${context}

## 지금까지 진행 상황
지금까지 질문을 ${questionCount}개 했습니다. 대략 3~5개면 충분합니다 — 기존
설계와 모순되지 않는 범위에서, 이 기능의 동작 규칙과 필요한 데이터를 확인하세요.

## 행동 지침
- 한 번에 한 가지 질문만 하세요.
- 친근하고 간결한 존댓말로 답하세요.
- 아직 정보가 부족하면 readyToGenerateDoc을 false로 두고 document는 비워두세요.
- 충분한 정보가 모이면 더 질문하지 말고 readyToGenerateDoc을 true로 설정한 뒤,
  document 필드에 설계 변경안 전체를 마크다운으로 작성하세요.
- ${CHECKLIST_REMINDER}

## 문서 형식 (readyToGenerateDoc이 true일 때)
# Feature Design

## Overview
- [ ] 항목 (무슨 기능을 왜 추가하는지)

## Changes
- [ ] 항목 (기존 시스템에 대한 변경/추가 사항)

## Data
- [ ] 항목 (이 기능에 필요한 데이터/수치)`,
  };
}

// v20: chat-less, same "auto-generate on entry" idea as the 9-step
// workflow's Code Generation/Documentation Agents (agentChat.ts's `finalize`
// option) — reads the *approved* design.json rather than gathering anything
// itself, since by the time this runs Step 1 is already done.
export function buildScriptableObjectAgentConfig(expansionId: string): AgentPromptConfig {
  return {
    docPath: "scriptable-objects.md",
    gatherContext: async (userId) => {
      const design = await getExpansionDocument(userId, expansionId, "design.json");
      return design?.content || NO_DOC;
    },
    buildSystemInstruction: (context, _questionCount) => `당신은 GameForge Agent의 "Feature ScriptableObject Agent"입니다.
승인된 기능 설계 변경안을 바탕으로, 이 기능에 필요한 ScriptableObject 데이터
구조를 제안하는 역할입니다. 채팅 없이 자동으로 호출되므로, 질문하지 말고
입력 문서만으로 바로 생성하세요.

## 입력 (승인된 설계 변경안)
${context}

## 무엇을 생성해야 하나
- 이 기능에서 디자이너가 코드 수정 없이 조정하고 싶을 만한 수치/데이터만
  ScriptableObject로 제안하세요 (예: 쿨다운, 지속 시간, 수치 등).
- ${CHECKLIST_REMINDER}
- readyToGenerateDoc을 반드시 true로 설정하세요 (자동 호출이므로 질문 자체가 불가능합니다).

## 문서 형식
# ScriptableObjects

## Data Assets
- [ ] SO 이름 — 담을 필드, 어떤 클래스가 참조하는지`,
  };
}

// v22: chat-less, same pattern as the two agents above — reads everything
// this expansion has produced so far (request + approved design +
// ScriptableObject design + Step 3/4's file changes) rather than gathering
// anything itself. Mirrors the 9-step workflow's Documentation Agent
// (agentPrompts.ts) in tone/purpose (PR-description style, summarize only,
// never invent content) but is explicitly scoped to just this one feature —
// not the whole project — so it doesn't get confused with the 9-step
// Documentation Agent's job.
export function buildExpansionDocumentationAgentConfig(expansionId: string): AgentPromptConfig {
  return {
    docPath: "docs.md",
    gatherContext: async (userId) => {
      const [request, designDoc, soDoc, files] = await Promise.all([
        getExpansionRequest(userId, expansionId),
        getExpansionDocument(userId, expansionId, "design.json"),
        getExpansionDocument(userId, expansionId, "scriptable-objects.json"),
        getExpansionFileChanges(userId, expansionId),
      ]);

      const filesSummary =
        files.length > 0
          ? files.map((f) => `- ${f.path} (${f.changeType}) — ${f.suggestedCommitMessage}`).join("\n")
          : "(변경된 파일 없음)";

      return `## 사용자가 요청한 기능\n${request?.description ?? NO_DOC}\n\n## 설계 변경안\n${designDoc?.content ?? NO_DOC}\n\n## ScriptableObject 설계\n${soDoc?.content ?? NO_DOC}\n\n## 코드 변경 사항\n${filesSummary}`;
    },
    buildSystemInstruction: (context, _questionCount) => `당신은 GameForge Agent의 "Feature Documentation Agent"입니다.
**이번에 추가된 기능 하나에 대한 변경 로그**를 정리하는 역할입니다 — 프로젝트
전체를 문서화하는 게 아니라, 이 기능 요청 하나에 대한 변경 사항만 다룹니다
(9단계 워크플로우의 전체 프로젝트 문서화와는 별개입니다). 채팅 없이 자동으로
호출되므로, 질문하지 말고 입력만으로 바로 작성하세요. **Pull Request
설명처럼** — 무엇을 왜 추가했고, 어떤 파일이 어떻게 바뀌었는지 사람이
리뷰하기 편한 톤으로 쓰세요. 새로운 내용을 지어내지 말고, 이미 있는
설계·코드 변경 내역만 정리·요약하세요.

## 입력
${context}

## 행동 지침
- ${CHECKLIST_REMINDER}
- readyToGenerateDoc을 반드시 true로 설정하세요 (자동 호출이므로 질문 자체가 불가능합니다).

## 문서 형식
# Feature Change Log: (기능 이름)

## Summary
- [ ] 항목 (무엇을 왜 추가했는지)

## Changes
- [ ] 항목 (어떤 파일이 어떻게 바뀌었는지, 코드 변경 사항 기준)`,
  };
}
