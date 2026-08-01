import { getDocument } from "./documents";
import { getFileChanges } from "./fileChanges";
import { readJson } from "./jsonStore";
import { getUserDataPath } from "./paths";
import { analyzeFileContents, type AnalyzedClass } from "./analyzer";
import { findRefactorTargets } from "./refactorTargets";
import { getRepoTarget, getFileContent } from "./github";

export interface FileAgentContext {
  text: string;
  // path -> current full content, used both as prompt context ("here's what
  // already exists") and as the baseline for the server-side diff computed
  // in fileAgentChat.ts. Empty for a first-ever generation.
  existingFiles: Record<string, string>;
}

export interface FileAgentPromptConfig {
  // accessToken is only needed by agents that read from GitHub (Code
  // Generation, v9) — agents that don't (Refactoring) just ignore it.
  gatherContext: (userId: number, accessToken: string) => Promise<FileAgentContext>;
  buildSystemInstruction: (context: string, questionCount: number) => string;
}

const NO_DOC = "(아직 작성된 문서가 없습니다)";

async function docContent(userId: number, stepId: number): Promise<string> {
  const doc = await getDocument(userId, stepId);
  return doc?.content ?? "";
}

// v5: real namespace convention detected by the analyzer, so Code Generation
// Agent follows what the repo actually uses instead of guessing one.
export async function detectedNamespaces(userId: number): Promise<string[]> {
  try {
    const project = await readJson<{ stats?: { namespaces?: string[] } }>(
      getUserDataPath(userId, "project.json")
    );
    return project.stats?.namespaces ?? [];
  } catch {
    return [];
  }
}

export interface AnalyzedClassRef {
  name: string;
  filePath: string;
}

// v9: the original analysis's class list (name+filePath only), persisted by
// POST /api/analysis/start with a 24h TTL — see analysis.ts. Past that TTL
// (or if analysis was never run in demo/real mode) this just returns [],
// which naturally makes every class-design match below fail closed and fall
// back to "new" — no special-casing needed at the call site.
export async function analyzedClasses(userId: number): Promise<AnalyzedClassRef[]> {
  try {
    const project = await readJson<{
      stats?: { classes?: AnalyzedClassRef[]; classesExpiresAt?: string };
    }>(getUserDataPath(userId, "project.json"));
    const { classes, classesExpiresAt } = project.stats ?? {};
    if (!classes || !classesExpiresAt) return [];
    if (Date.now() > new Date(classesExpiresAt).getTime()) return [];
    return classes;
  } catch {
    return [];
  }
}

// v9: pulls class names out of the Class Design doc's "## Classes" section
// only (never the whole doc, so a class name mentioned in prose elsewhere
// doesn't accidentally trigger a GitHub read) — regex/text matching is
// intentionally simple here, not a real Markdown parser. Matches the doc
// format Class Design Agent is prompted to produce (see agentPrompts.ts):
// "- [ ] ClassName — 설명...".
//
// v21: some design docs (Feature Expansion's design.json — see
// expansionAgentPrompts.ts) don't have a dedicated "## Classes" section at
// all (its sections are Overview/Changes/Data); class names there are
// mentioned inline within whatever checklist bullets exist. When no
// "## Classes" header is found, this falls back to scanning every checklist
// bullet in the whole document for PascalCase-looking identifiers — same
// "good enough, not a real parser" bar as the strict path above. Existing
// callers (the 9-step Code Generation Agent, whose Class Design doc always
// has "## Classes") are unaffected — the fallback only ever runs when the
// strict section is absent.
export function parseClassNamesFromDesignDoc(doc: string): string[] {
  const sectionMatch = doc.match(/##\s*Classes\s*\n([\s\S]*?)(?=\n##\s|$)/i);
  const names = new Set<string>();

  if (sectionMatch) {
    const lineRegex = /^[-*]\s*\[[ xX]\]\s*([A-Za-z_][A-Za-z0-9_]*)/gm;
    let match: RegExpExecArray | null;
    while ((match = lineRegex.exec(sectionMatch[1]))) {
      names.add(match[1]);
    }
    return Array.from(names);
  }

  const bulletRegex = /^[-*]\s*\[[ xX]\]\s*(.+)$/gm;
  let bulletMatch: RegExpExecArray | null;
  while ((bulletMatch = bulletRegex.exec(doc))) {
    const identifierRegex = /\b[A-Z][A-Za-z0-9_]*\b/g;
    let idMatch: RegExpExecArray | null;
    while ((idMatch = identifierRegex.exec(bulletMatch[1]))) {
      names.add(idMatch[0]);
    }
  }
  return Array.from(names);
}

export const COMMON_RULES = `## 행동 지침
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
    // v9: also reads whatever files already exist in the repo for classes
    // the Class Design doc actually mentions — matched by name against the
    // original analysis's persisted class list (analyzedClasses, 24h TTL),
    // fetched via GitHub only for those matched paths (never the whole
    // repo). A name that doesn't match anything (typo, doc/repo drift, TTL
    // expired) just silently falls back to "new" — no error, no special case.
    gatherContext: async (userId, accessToken) => {
      const [classDesign, projectStructure, scriptableObjects] = await Promise.all([
        docContent(userId, 4),
        docContent(userId, 5),
        docContent(userId, 6),
      ]);

      const mentionedNames = parseClassNamesFromDesignDoc(classDesign);
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
                // A single unreadable file (renamed/deleted since analysis,
                // network hiccup) shouldn't block the whole generation —
                // that class just falls back to "new" like an unmatched one.
              }
            })
          );
        }
      }

      const existingRepoSection =
        Object.keys(existingRepoFiles).length > 0
          ? `\n\n## 저장소에 이미 존재하는 관련 파일 (클래스 설계 문서가 언급한 클래스만 조회함 — 목록에 없는 파일은 읽지 않았습니다)\n${Object.entries(
              existingRepoFiles
            )
              .map(([p, c]) => `### ${p}\n${c}`)
              .join("\n\n")}`
          : "";

      // Own step's prior turns (if any) act as "existing files" for follow-up
      // edits within the same conversation — takes precedence over the
      // GitHub baseline above since it reflects what THIS run already
      // produced, which is more current than what's committed.
      const priorFiles = await getFileChanges(userId, 7);
      const existingFiles: Record<string, string> = { ...existingRepoFiles };
      for (const f of priorFiles) existingFiles[f.path] = f.newContent;

      const existingSection =
        priorFiles.length > 0
          ? `\n\n## 이전에 생성한 파일 (수정 요청이 없으면 그대로 유지)\n${priorFiles
              .map((f) => `### ${f.path}\n${f.newContent}`)
              .join("\n\n")}`
          : "";

      const namespaces = await detectedNamespaces(userId);
      const namespaceSection =
        namespaces.length > 0
          ? `\n\n## 저장소에서 감지된 네임스페이스 컨벤션\n${namespaces.join(", ")}\n이미 저장소에서 실제로 쓰이고 있는 네임스페이스 규칙이니, 새로 만드는 코드도 반드시 이 컨벤션을 따르세요.`
          : "";

      return {
        text: `## 클래스 설계\n${classDesign || NO_DOC}\n\n## 프로젝트 구조 설계\n${projectStructure || NO_DOC}\n\n## ScriptableObject 설계\n${scriptableObjects || NO_DOC}${namespaceSection}${existingRepoSection}${existingSection}`,
        existingFiles,
      };
    },
    // v5: Step 진입 즉시 자동 호출되고 채팅 UI가 없으므로(질문할 화면 자체가
    // 없음), 확인 질문 여지를 남기지 않고 항상 바로 생성하도록 지시한다.
    buildSystemInstruction: (context, _questionCount) => `당신은 GameForge Agent의 "Code Generation Agent"입니다.
클래스 설계, 프로젝트 구조 설계, ScriptableObject 설계 문서를 바탕으로 실제 Unity C#
코드를 생성하는 역할입니다. 채팅 없이 자동으로 호출되므로, 질문하지 말고 입력 문서만으로
바로 생성하세요.

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
  섹션에 나온 경로를 그대로 사용하세요 (새로 지어내지 마세요). 새 파일의
  path는 프로젝트 구조 설계 문서에 나온 폴더 경로를 그대로 따르세요.
- 감지된 네임스페이스 컨벤션이 있다면 반드시 따르세요.

${COMMON_RULES}`,
  },

  "Refactoring Agent": {
    // v8: input switched from the *original* repo's 00_Analysis_Report.md to a
    // fresh, lightweight structural read of just Step 7's own generated files
    // — no GitHub re-fetch, no full-repo re-analysis. God Class/circular-dep
    // flagging reuses the same rule-based findRefactorTargets() the original
    // analysis pipeline uses, just fed classes extracted from these few files.
    // accessToken unused — Step 8 never reads from GitHub (see v8 above).
    gatherContext: async (userId, _accessToken) => {
      const generatedFiles = await getFileChanges(userId, 7);
      const existingFiles: Record<string, string> = {};
      for (const f of generatedFiles) existingFiles[f.path] = f.newContent;

      const nonDeleted = generatedFiles.filter((f) => f.changeType !== "deleted");
      let classes: AnalyzedClass[] = [];
      try {
        ({ classes } = await analyzeFileContents(
          nonDeleted.map((f) => ({ path: f.path, content: f.newContent }))
        ));
      } catch {
        // The analyzer failing to run (e.g. dotnet unavailable) shouldn't block
        // Step 8 entirely — it just proceeds without structural flags this pass.
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
          : "(7단계에서 생성된 코드가 아직 없습니다)";

      return {
        text: `## 7단계 코드 구조 분석 (클래스별 메서드 수)\n${structureSummary}\n\n## 룰 기반으로 플래그된 리팩토링 대상\n${targetsSummary}\n\n## 7단계에서 생성된 코드 (현재 전체 내용)\n${filesSummary}`,
        existingFiles,
      };
    },
    buildSystemInstruction: (context, questionCount) => `당신은 GameForge Agent의 "Refactoring Agent"입니다.
7단계에서 생성된 코드 자체에 대한 구조 분석 결과(클래스별 메서드 수, 룰 기반으로
플래그된 God Class/순환 의존성 대상)를 바탕으로, 리팩토링이 필요한 부분을 실제
코드 변경으로 제안하는 역할입니다. 최초 저장소 전체가 아니라 7단계에서 방금
생성된 코드만이 검토 대상입니다.

## 입력
${context}

## 지금까지 진행 상황
지금까지 질문을 ${questionCount}개 했습니다. 대략 1~3개면 충분합니다 (예: 특정
God Class를 어떤 기준으로 분리할지, 순환 의존성을 어떻게 끊을지 등).

## 무엇을 생성해야 하나
- 위 "룰 기반으로 플래그된 리팩토링 대상"에 나온 항목만 다루세요 — 새로운
  문제를 스스로 찾아내지 마세요, 이미 룰 기반으로 플래그된 것만 다룹니다.
- 플래그된 대상이 없다면 억지로 리팩토링을 만들어내지 마세요. reply에 "지금
  생성된 코드에서는 규칙 기반으로 플래그된 리팩토링 대상이 없습니다"라고
  안내하고, readyToGenerateFiles를 true로, files는 빈 배열로 응답하세요.
- changeType은 "modified"(기존 파일 일부 변경) 또는 "deleted"(중복 제거로 파일
  자체가 필요 없어진 경우)를 사용하세요. 새 헬퍼 클래스가 꼭 필요하면 "new"도
  가능합니다.
- newContent는 7단계 코드를 기준으로, 바뀌지 않는 부분까지 포함한 파일 전체 내용을
  응답하세요.

${COMMON_RULES}`,
  },
};
