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

// Demo-mode script only, independent of the real gatherContext (demo mode
// never calls it) — mirrors mockAnalysisReport.ts's "PlayerController.Move()와
// EnemyController.Move()가 거의 동일한..." duplicate-code finding for a
// consistent demo storyline. Extracts both into a shared IMovable-based
// approach.
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

// Feature Expansion Workflow's demo storyline (see mockDocAgent.ts's
// FEATURE_DESIGN_DOCUMENT) — adding a shop system to the already-built
// dash-roguelike above. GameManager.cs is deliberately touched by both
// Steps 3 and 4 here, same "review refines what generation just wrote"
// relationship CODE_GEN_FILES/REFACTORING_FILES have above, just within one
// expansion instead of across two separate 9-step Steps: Step 3 (Code
// Generation) adds a naive SpendGold(), then Step 4 (Code Review) notices
// ShopController comparing the raw Gold value itself and extracts that
// check into GameManager.CanAfford() instead.
const FEATURE_CODE_GEN_FILES: MockFile[] = [
  {
    path: "Assets/Scripts/Core/GameManager.cs",
    changeType: "modified",
    oldContent: `using UnityEngine;

public class GameManager : MonoBehaviour
{
    public static GameManager Instance { get; private set; }

    [SerializeField] private int gold;

    public int Gold => gold;

    public void AddGold(int amount)
    {
        gold += amount;
    }
}`,
    newContent: `using UnityEngine;

public class GameManager : MonoBehaviour
{
    public static GameManager Instance { get; private set; }

    [SerializeField] private int gold;

    public int Gold => gold;

    public void AddGold(int amount)
    {
        gold += amount;
    }

    public void SpendGold(int amount)
    {
        gold -= amount;
    }
}`,
    suggestedCommitMessage: "feat: add GameManager.SpendGold for the shop system",
  },
  {
    path: "Assets/Scripts/Shop/ShopController.cs",
    changeType: "new",
    oldContent: "",
    newContent: `using UnityEngine;

public class ShopController : MonoBehaviour
{
    [SerializeField] private ShopInventoryData inventory;

    public void Purchase(ItemData item)
    {
        if (GameManager.Instance.Gold < item.Price)
        {
            return;
        }

        GameManager.Instance.SpendGold(item.Price);
        // TODO: grant item to player inventory
    }
}`,
    suggestedCommitMessage: "feat: add ShopController purchase flow",
  },
  {
    path: "Assets/Scripts/Shop/MerchantNPC.cs",
    changeType: "new",
    oldContent: "",
    newContent: `using UnityEngine;

public class MerchantNPC : MonoBehaviour
{
    [SerializeField] private ShopController shop;
    [SerializeField] private GameObject shopUI;

    public void OnInteract()
    {
        shopUI.SetActive(true);
    }
}`,
    suggestedCommitMessage: "feat: add MerchantNPC interaction",
  },
];

const FEATURE_CODE_REVIEW_FILES: MockFile[] = [
  {
    path: "Assets/Scripts/Core/GameManager.cs",
    changeType: "modified",
    oldContent: FEATURE_CODE_GEN_FILES[0].newContent,
    newContent: `using UnityEngine;

public class GameManager : MonoBehaviour
{
    public static GameManager Instance { get; private set; }

    [SerializeField] private int gold;

    public int Gold => gold;

    public void AddGold(int amount)
    {
        gold += amount;
    }

    public bool CanAfford(int amount)
    {
        return gold >= amount;
    }

    public void SpendGold(int amount)
    {
        gold -= amount;
    }
}`,
    suggestedCommitMessage: "refactor: extract GameManager.CanAfford for gold checks",
  },
  {
    path: "Assets/Scripts/Shop/ShopController.cs",
    // Still "new" here even though this is Step 4's pass over it — Step 3
    // only just created this file in this same expansion, so relative to
    // the actual repo (what changeType describes) it has never existed
    // there before. mergeExpansionFileChanges replaces the whole record by
    // path, so whatever changeType Step 4 states here is what the commit
    // review screen ends up showing.
    changeType: "new",
    oldContent: "",
    newContent: `using UnityEngine;

public class ShopController : MonoBehaviour
{
    [SerializeField] private ShopInventoryData inventory;

    public void Purchase(ItemData item)
    {
        if (!GameManager.Instance.CanAfford(item.Price))
        {
            return;
        }

        GameManager.Instance.SpendGold(item.Price);
        // TODO: grant item to player inventory
    }
}`,
    suggestedCommitMessage: "refactor: use GameManager.CanAfford in ShopController",
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
  "Feature Code Generation Agent": {
    turns: ["(자동 호출) 승인된 설계안을 바탕으로 코드를 생성하고 있습니다."],
    files: FEATURE_CODE_GEN_FILES,
  },
  "Feature Code Review Agent": {
    turns: ["(자동 호출) 방금 생성된 코드를 검토하고 있습니다."],
    files: FEATURE_CODE_REVIEW_FILES,
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

export function getMockFileAgentResponse(
  agentName: string,
  questionCount: number,
  finalize = false
): FileAgentResult {
  const script = SCRIPTS[agentName] ?? genericScript(agentName);

  if (!finalize && questionCount < script.turns.length) {
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
