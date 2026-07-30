import { computeUnifiedDiff } from "../utils/diffCompute";
import type { FileAgentResult, FileChangeDraft } from "../utils/fileAgentChat";

interface MockFile {
  path: string;
  changeType: "new" | "modified" | "deleted";
  // Baseline content the diff is computed against — never sent to the
  // client directly, only used here to produce a realistic `diff`.
  oldContent: string;
  newContent: string;
  suggestedCommitMessage: string;
}

interface FileAgentScript {
  turns: string[];
  files: MockFile[];
}

// Reused verbatim from gameforge-agent-prototype.html's commit review screen
// mock (IDashable.cs / PlayerController.cs / OldDashHelper.cs) and the
// presentation script's dash-refactor example — expanded from diff snippets
// into full before/after file content since Day 12 requires newContent, not
// a patch.
const CODE_GEN_FILES: MockFile[] = [
  {
    path: "Assets/Scripts/Player/IDashable.cs",
    changeType: "new",
    oldContent: "",
    newContent: `public interface IDashable
{
    void Dash(Vector2 direction);
    bool IsInvincible { get; }
}`,
    suggestedCommitMessage: "feat: add IDashable interface",
  },
  {
    path: "Assets/Scripts/Player/PlayerController.cs",
    changeType: "modified",
    oldContent: `using UnityEngine;

public class PlayerController : MonoBehaviour, IDashable
{
    private float dashCooldown = 1.2f;
    private bool isInvincible;

    public void Dash(Vector2 direction)
    {
        // dash movement logic
    }
}`,
    newContent: `using UnityEngine;

public class PlayerController : MonoBehaviour, IDashable
{
    [SerializeField] private DashConfig dashConfig;
    private bool isInvincible;

    public bool IsInvincible => isInvincible;

    public void Dash(Vector2 direction)
    {
        // dash movement logic
    }
}`,
    suggestedCommitMessage: "refactor: extract dash cooldown into IDashable",
  },
  {
    path: "Assets/Scripts/Legacy/OldDashHelper.cs",
    changeType: "deleted",
    oldContent: `public static class OldDashHelper
{
    public static void DoDash(Transform t) { /* ... */ }
}`,
    newContent: "",
    suggestedCommitMessage: "chore: remove unused OldDashHelper (duplicate of PlayerController.Dash)",
  },
];

// Refactoring Agent only acts on what the (mock) analysis report already
// flagged — see mockAnalysisReport.ts's "PlayerController.Move()와
// EnemyController.Move()가 거의 동일한..." duplicate-code finding. This
// extracts both into a shared IMovable-based approach.
const REFACTORING_FILES: MockFile[] = [
  {
    path: "Assets/Scripts/Core/IMovable.cs",
    changeType: "new",
    oldContent: "",
    newContent: `public interface IMovable
{
    void Move(Vector2 direction);
}`,
    suggestedCommitMessage: "feat: add IMovable interface",
  },
  {
    path: "Assets/Scripts/Player/PlayerController.cs",
    changeType: "modified",
    oldContent: `using UnityEngine;

public class PlayerController : MonoBehaviour
{
    [SerializeField] private float moveSpeed = 5f;

    public void Move(Vector2 direction)
    {
        transform.Translate(direction * moveSpeed * Time.deltaTime);
    }
}`,
    newContent: `using UnityEngine;

public class PlayerController : MonoBehaviour, IMovable
{
    [SerializeField] private float moveSpeed = 5f;

    public void Move(Vector2 direction)
    {
        MovementUtility.Translate(transform, direction, moveSpeed);
    }
}`,
    suggestedCommitMessage: "refactor: extract PlayerController.Move() into shared MovementUtility",
  },
  {
    path: "Assets/Scripts/Enemy/EnemyController.cs",
    changeType: "modified",
    oldContent: `using UnityEngine;

public class EnemyController : MonoBehaviour
{
    [SerializeField] private float moveSpeed = 3f;

    public void Move(Vector2 direction)
    {
        transform.Translate(direction * moveSpeed * Time.deltaTime);
    }
}`,
    newContent: `using UnityEngine;

public class EnemyController : MonoBehaviour, IMovable
{
    [SerializeField] private float moveSpeed = 3f;

    public void Move(Vector2 direction)
    {
        MovementUtility.Translate(transform, direction, moveSpeed);
    }
}`,
    suggestedCommitMessage: "refactor: extract EnemyController.Move() into shared MovementUtility",
  },
  {
    path: "Assets/Scripts/Core/MovementUtility.cs",
    changeType: "new",
    oldContent: "",
    newContent: `using UnityEngine;

public static class MovementUtility
{
    public static void Translate(Transform target, Vector2 direction, float speed)
    {
        target.Translate(direction * speed * Time.deltaTime);
    }
}`,
    suggestedCommitMessage: "feat: add shared MovementUtility",
  },
];

const SCRIPTS: Record<string, FileAgentScript> = {
  "Code Generation Agent": {
    turns: ["네임스페이스는 기존 프로젝트 컨벤션을 그대로 따르면 될까요?"],
    files: CODE_GEN_FILES,
  },
  "Refactoring Agent": {
    turns: [
      "PlayerController.Move()와 EnemyController.Move()의 중복 로직을 공용 유틸리티로 뺄까요, 아니면 별도 컴포넌트로 분리할까요?",
    ],
    files: REFACTORING_FILES,
  },
};

function genericScript(agentName: string): FileAgentScript {
  return {
    turns: [`(데모 모드) ${agentName}가 변경 사항을 준비하고 있습니다. 계속 진행해주세요.`],
    files: [
      {
        path: "Assets/Scripts/Demo/DemoPlaceholder.cs",
        changeType: "new",
        oldContent: "",
        newContent: `// (데모 모드) 예시 파일\npublic class DemoPlaceholder {}`,
        suggestedCommitMessage: "feat: demo placeholder file",
      },
    ],
  };
}

export function getMockFileAgentResponse(agentName: string, questionCount: number): FileAgentResult {
  const script = SCRIPTS[agentName] ?? genericScript(agentName);

  if (questionCount < script.turns.length) {
    return { reply: script.turns[questionCount], readyToGenerateFiles: false };
  }

  const files: FileChangeDraft[] = script.files.map((f) => ({
    path: f.path,
    changeType: f.changeType,
    newContent: f.newContent,
    suggestedCommitMessage: f.suggestedCommitMessage,
    diff: computeUnifiedDiff(f.path, f.oldContent, f.newContent),
  }));

  return {
    reply: "필요한 파일 변경을 모두 준비했습니다. 커밋 리뷰 화면에서 확인해주세요!",
    readyToGenerateFiles: true,
    files,
  };
}
