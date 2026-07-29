import { getDocument } from "./documents";
import { getFileChanges } from "./fileChanges";

export interface FileAgentContext {
  text: string;
  // path -> current full content, used both as prompt context ("here's what
  // already exists") and as the baseline for the server-side diff computed
  // in fileAgentChat.ts. Empty for a first-ever generation.
  existingFiles: Record<string, string>;
}

export interface FileAgentPromptConfig {
  gatherContext: () => Promise<FileAgentContext>;
  buildSystemInstruction: (context: string, questionCount: number) => string;
}

const NO_DOC = "(아직 작성된 문서가 없습니다)";

async function docContent(stepId: number): Promise<string> {
  const doc = await getDocument(stepId);
  return doc?.content ?? "";
}

const COMMON_RULES = `## 행동 지침
- 한 번에 한 가지만 질문하세요. 입력 문서가 이미 충분히 구체적이면 질문 없이 바로 생성해도 됩니다.
- 아직 확인할 게 있으면 readyToGenerateFiles를 false로 두고 files는 비워두세요.
- 준비되면 readyToGenerateFiles를 true로 설정하고, files 배열에 파일별로 분리해서
  응답하세요 — 하나의 뭉친 텍스트가 아니라 각 파일이 배열의 개별 항목이어야 합니다.
- newContent는 diff나 패치가 아니라 "그 파일의 새 전체 내용"이어야 합니다. 기존 파일을
  수정하는 경우에도 바뀌지 않는 부분은 원본 내용 그대로 포함해서, 파일 전체가 그대로
  덮어써도 되는 완결된 내용으로 응답하세요.
- changeType이 "deleted"인 경우 newContent는 빈 문자열로 응답하세요.`;

export const FILE_AGENT_PROMPTS: Record<string, FileAgentPromptConfig> = {
  "Code Generation Agent": {
    gatherContext: async () => {
      const [classDesign, projectStructure, scriptableObjects] = await Promise.all([
        docContent(4),
        docContent(5),
        docContent(6),
      ]);

      // Own step's prior turns (if any) act as "existing files" for follow-up
      // edits within the same conversation — there is no real GitHub read
      // here since these files haven't been committed anywhere yet (that's
      // Day 13's job).
      const priorFiles = await getFileChanges(7);
      const existingFiles: Record<string, string> = {};
      for (const f of priorFiles) existingFiles[f.path] = f.newContent;

      const existingSection =
        priorFiles.length > 0
          ? `\n\n## 이전에 생성한 파일 (수정 요청이 없으면 그대로 유지)\n${priorFiles
              .map((f) => `### ${f.path}\n${f.newContent}`)
              .join("\n\n")}`
          : "";

      return {
        text: `## 클래스 설계\n${classDesign || NO_DOC}\n\n## 프로젝트 구조 설계\n${projectStructure || NO_DOC}\n\n## ScriptableObject 설계\n${scriptableObjects || NO_DOC}${existingSection}`,
        existingFiles,
      };
    },
    buildSystemInstruction: (context, questionCount) => `당신은 GameForge Agent의 "Code Generation Agent"입니다.
클래스 설계, 프로젝트 구조 설계, ScriptableObject 설계 문서를 바탕으로 실제 Unity C#
코드를 생성하는 역할입니다.

## 입력 문서
${context}

## 지금까지 진행 상황
지금까지 질문을 ${questionCount}개 했습니다. 입력 문서가 이미 구체적이므로 1~2개
정도의 확인 질문이면 충분합니다 (예: 네임스페이스 컨벤션, 특정 애매한 설계 판단).

## 무엇을 생성해야 하나
- 클래스 설계에 나온 각 클래스를 프로젝트 구조 설계에 명시된 경로에 새 파일로 생성하세요.
- changeType은 이번엔 전부 "new"입니다 (기존 코드를 고치는 게 아니라 새로 만드는 단계입니다).
- path는 프로젝트 구조 설계 문서에 나온 폴더 경로를 그대로 따르세요.

${COMMON_RULES}`,
  },

  "Refactoring Agent": {
    gatherContext: async () => {
      const analysisReport = await docContent(0);
      const generatedFiles = await getFileChanges(7);
      const existingFiles: Record<string, string> = {};
      for (const f of generatedFiles) existingFiles[f.path] = f.newContent;

      const filesSummary =
        generatedFiles.length > 0
          ? generatedFiles.map((f) => `### ${f.path} (${f.changeType})\n${f.newContent}`).join("\n\n")
          : "(7단계에서 생성된 코드가 아직 없습니다)";

      return {
        text: `## 정적 분석 리포트 (God Class / 중복 코드 블록)\n${analysisReport || NO_DOC}\n\n## 7단계에서 생성된 코드 (현재 전체 내용)\n${filesSummary}`,
        existingFiles,
      };
    },
    buildSystemInstruction: (context, questionCount) => `당신은 GameForge Agent의 "Refactoring Agent"입니다.
정적 분석 리포트(God Class 목록, 중복 코드 블록)와 7단계에서 생성된 코드를 바탕으로,
리팩토링이 필요한 부분을 실제 코드 변경으로 제안하는 역할입니다.

## 입력
${context}

## 지금까지 진행 상황
지금까지 질문을 ${questionCount}개 했습니다. 대략 1~3개면 충분합니다 (예: 특정
God Class를 어떤 기준으로 분리할지, 중복 블록을 공용 메서드로 뺄지 등).

## 무엇을 생성해야 하나
- 정적 분석 리포트에서 플래그된 항목(God Class, 중복 코드)만 다루세요 — 새로운
  문제를 스스로 찾아내지 마세요, 이미 룰 기반으로 플래그된 것만 다룹니다.
- changeType은 "modified"(기존 파일 일부 변경) 또는 "deleted"(중복 제거로 파일
  자체가 필요 없어진 경우)를 사용하세요. 새 헬퍼 클래스가 꼭 필요하면 "new"도
  가능합니다.
- newContent는 7단계 코드를 기준으로, 바뀌지 않는 부분까지 포함한 파일 전체 내용을
  응답하세요.

${COMMON_RULES}`,
  },
};
