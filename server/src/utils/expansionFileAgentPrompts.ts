import type { FileAgentPromptConfig } from "./fileAgentPrompts";
import { analyzedClasses, detectedNamespaces, parseClassNamesFromDesignDoc, COMMON_RULES } from "./fileAgentPrompts";
import { getExpansionDocument } from "./expansionDocuments";
import { getExpansionFileChanges } from "./expansionFileChanges";
import { getRepoTarget, getFileContent } from "./github";
import { analyzeFileContents, type AnalyzedClass } from "./analyzer";
import { findRefactorTargets } from "./refactorTargets";

const NO_DOC = "(아직 작성된 문서가 없습니다)";

// v21: Step 3 (Unity 코드 생성) — same shape/behavior as the 9-step Code
// Generation Agent (existing-code lookup via analyzedClasses/getFileContent,
// namespace detection, changeType left to the model's judgment), just fed
// the expansion's own design.json + scriptable-objects.json instead of the
// 9-step workflow's Class Design/Project Structure/ScriptableObject docs.
// expansionId is captured via closure, same trick Day 20 used, so
// FileAgentPromptConfig's (userId, accessToken) signature never needs to
// change for the 9-step workflow.
export function buildExpansionCodeGenerationAgentConfig(expansionId: string): FileAgentPromptConfig {
  return {
    gatherContext: async (userId, accessToken) => {
      const [designDoc, soDoc] = await Promise.all([
        getExpansionDocument(userId, expansionId, "design.json"),
        getExpansionDocument(userId, expansionId, "scriptable-objects.json"),
      ]);
      const designContent = designDoc?.content ?? "";
      const soContent = soDoc?.content ?? "";

      const mentionedNames = parseClassNamesFromDesignDoc(designContent);
      const knownClasses = await analyzedClasses(userId);
      const matches = knownClasses.filter((c) => mentionedNames.includes(c.name));

      const existingRepoFiles: Record<string, string> = {};
      if (matches.length > 0) {
        const target = await getRepoTarget(userId, accessToken);
        if (target) {
          await Promise.all(
            matches.map(async (c) => {
              try {
                const content = await getFileContent(target, c.filePath);
                if (content !== null) existingRepoFiles[c.filePath] = content;
              } catch {
                // Same best-effort fallback as the 9-step Code Generation
                // Agent — an unreadable file just falls back to "new".
              }
            })
          );
        }
      }

      const existingRepoSection =
        Object.keys(existingRepoFiles).length > 0
          ? `\n\n## 저장소에 이미 존재하는 관련 파일 (설계 변경안이 언급한 클래스만 조회함 — 목록에 없는 파일은 읽지 않았습니다)\n${Object.entries(
              existingRepoFiles
            )
              .map(([p, c]) => `### ${p}\n${c}`)
              .join("\n\n")}`
          : "";

      // Own step's prior turns (if any) act as "existing files" for
      // follow-up edits within the same run — mirrors the 9-step Code
      // Generation Agent's use of getFileChanges(userId, 7), against this
      // expansion's own file-changes.json instead.
      const priorFiles = await getExpansionFileChanges(userId, expansionId);
      const existingFiles: Record<string, string> = { ...existingRepoFiles };
      for (const f of priorFiles) existingFiles[f.path] = f.newContent;

      const priorSection =
        priorFiles.length > 0
          ? `\n\n## 이전에 생성한 파일 (수정 요청이 없으면 그대로 유지)\n${priorFiles
              .map((f) => `### ${f.path}\n${f.newContent}`)
              .join("\n\n")}`
          : "";

      const namespaces = await detectedNamespaces(userId);
      const namespaceSection =
        namespaces.length > 0
          ? `\n\n## 저장소에서 감지된 네임스페이스 컨벤션\n${namespaces.join(", ")}\n이미 저장소에서 실제로 쓰이고 있는 네임스페이스 규칙이니, 새로 만들거나 수정하는 코드도 반드시 이 컨벤션을 따르세요.`
          : "";

      return {
        text: `## 기능 설계 변경안\n${designContent || NO_DOC}\n\n## ScriptableObject 설계\n${soContent || NO_DOC}${namespaceSection}${existingRepoSection}${priorSection}`,
        existingFiles,
      };
    },
    buildSystemInstruction: (context, _questionCount) => `당신은 GameForge Agent의 "Feature Code Generation Agent"입니다.
기존 프로젝트에 추가되는 기능의 설계 변경안과 ScriptableObject 설계를 바탕으로
실제 Unity C# 코드를 생성하는 역할입니다. 채팅 없이 자동으로 호출되므로,
질문하지 말고 입력 문서만으로 바로 생성하세요.

## 입력 문서
${context}

## 무엇을 생성해야 하나
- "저장소에 이미 존재하는 관련 파일" 섹션에 어떤 클래스의 기존 코드가 있다면,
  그 코드 위에서 이어서 확장하세요 — 빈 상태에서 처음부터 새로 쓰지 마세요.
  수정이 필요 없는 부분은 원본 내용 그대로 유지하고, 실제로 바뀌는 부분만
  변경하세요.
- changeType은 고정값이 아니라 스스로 판단하세요: "저장소에 이미 존재하는
  관련 파일"에 나온 파일을 수정하는 거면 "modified", 그 섹션에 없는 완전히
  새 파일이면 "new"입니다.
- 기존 파일을 수정할 때 path는 반드시 "저장소에 이미 존재하는 관련 파일"
  섹션에 나온 경로를 그대로 사용하세요 (새로 지어내지 마세요).
- 감지된 네임스페이스 컨벤션이 있다면 반드시 따르세요.

${COMMON_RULES}`,
  };
}

// v21: Step 4 (코드 리뷰 및 리팩토링) — same shape/behavior as the 9-step
// Refactoring Agent (rule-based God Class/circular-dep flagging via
// analyzeFileContents+findRefactorTargets, only ever acts on what's
// flagged), fed this expansion's own Step 3 output instead of the 9-step
// workflow's Step 7 output.
export function buildExpansionCodeReviewAgentConfig(expansionId: string): FileAgentPromptConfig {
  return {
    // accessToken unused — code review never reads from GitHub, same as the
    // 9-step Refactoring Agent.
    gatherContext: async (userId, _accessToken) => {
      const generatedFiles = await getExpansionFileChanges(userId, expansionId);
      const existingFiles: Record<string, string> = {};
      for (const f of generatedFiles) existingFiles[f.path] = f.newContent;

      const nonDeleted = generatedFiles.filter((f) => f.changeType !== "deleted");
      let classes: AnalyzedClass[] = [];
      try {
        ({ classes } = await analyzeFileContents(
          nonDeleted.map((f) => ({ path: f.path, content: f.newContent }))
        ));
      } catch {
        classes = [];
      }
      const refactorTargets = findRefactorTargets(classes);

      const structureSummary =
        classes.length > 0
          ? classes.map((c) => `- ${c.name} (${c.filePath}) — 메서드 ${c.methodCount}개`).join("\n")
          : "(분석할 클래스가 없습니다)";
      const targetsSummary =
        refactorTargets.length > 0
          ? refactorTargets.map((t) => `- ${t.className} (${t.filePath}) — ${t.reason}`).join("\n")
          : "(룰 기반으로 플래그된 리팩토링 대상 없음)";

      const filesSummary =
        generatedFiles.length > 0
          ? generatedFiles.map((f) => `### ${f.path} (${f.changeType})\n${f.newContent}`).join("\n\n")
          : "(3단계에서 생성된 코드가 아직 없습니다)";

      return {
        text: `## 3단계 코드 구조 분석 (클래스별 메서드 수)\n${structureSummary}\n\n## 룰 기반으로 플래그된 리팩토링 대상\n${targetsSummary}\n\n## 3단계에서 생성된 코드 (현재 전체 내용)\n${filesSummary}`,
        existingFiles,
      };
    },
    buildSystemInstruction: (context, questionCount) => `당신은 GameForge Agent의 "Feature Code Review Agent"입니다.
3단계에서 생성된 코드 자체에 대한 구조 분석 결과(클래스별 메서드 수, 룰 기반으로
플래그된 God Class/순환 의존성 대상)를 바탕으로, 리팩토링이 필요한 부분을 실제
코드 변경으로 제안하는 역할입니다. 프로젝트 전체가 아니라 3단계에서 방금
생성된 코드만이 검토 대상입니다.

## 입력
${context}

## 지금까지 진행 상황
지금까지 질문을 ${questionCount}개 했습니다. 대략 1~3개면 충분합니다.

## 무엇을 생성해야 하나
- 위 "룰 기반으로 플래그된 리팩토링 대상"에 나온 항목만 다루세요 — 새로운
  문제를 스스로 찾아내지 마세요, 이미 룰 기반으로 플래그된 것만 다룹니다.
- 플래그된 대상이 없다면 억지로 리팩토링을 만들어내지 마세요. reply에 "지금
  생성된 코드에서는 규칙 기반으로 플래그된 리팩토링 대상이 없습니다"라고
  안내하고, readyToGenerateFiles를 true로, files는 빈 배열로 응답하세요.
- changeType은 "modified"(기존 파일 일부 변경) 또는 "deleted"(중복 제거로 파일
  자체가 필요 없어진 경우)를 사용하세요. 새 헬퍼 클래스가 꼭 필요하면 "new"도
  가능합니다.
- newContent는 3단계 코드를 기준으로, 바뀌지 않는 부분까지 포함한 파일 전체 내용을
  응답하세요.

${COMMON_RULES}`,
  };
}
