import { useEffect, useMemo, useRef, useState } from "react";
import FileChangeList from "./FileChangeList";
import DiffViewer from "./DiffViewer";
import { API_BASE_URL, type FileChange } from "../lib/api";

interface Props {
  expansionId: string;
  onApproved: () => void;
  // See ExpansionDesignPanel's readOnly doc — same "already done, just
  // revisiting" contract. Mirrors WorkspaceMainPanel's done+file-agent branch:
  // just the file list (checked = already-approved), no diff/commit controls.
  readOnly?: boolean;
}

// Feature Expansion Workflow's Steps 3-4 (코드 생성 + 코드 리뷰) — chat-less,
// same "auto-generate on entry" idea as the 9-step workflow's file-agent
// Steps, built fresh against /api/expansions/:id/code/* and
// /api/expansions/:id/file-changes instead of reusing WorkspaceMainPanel.
// FileChangeList/DiffViewer are reused as-is (unmodified). This screen's own
// checkbox selection never drives a real commit, by design — Step 6's
// approve (ExpansionDocsPanel) commits every syntax-valid file from this
// step in one shot regardless of what's checked here, since there's no
// state to carry a partial selection across the two screens. The commit
// button here just explains that instead of pretending to commit.
export default function ExpansionCodeReviewPanel({ expansionId, onApproved, readOnly = false }: Props) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);

  const [fileChanges, setFileChanges] = useState<FileChange[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [checkedPaths, setCheckedPaths] = useState<Set<string>>(new Set());
  const [commitMsgDrafts, setCommitMsgDrafts] = useState<Record<string, string>>({});
  const [commitNotice, setCommitNotice] = useState<string | null>(null);

  const autoGenerateTriggeredRef = useRef(false);

  function applyFileChanges(files: FileChange[]) {
    setFileChanges(files);
    // Same default-check rule as WorkspaceMainPanel: syntax-invalid files
    // start unchecked (not blocked — still checkable manually).
    setCheckedPaths(new Set(files.filter((f) => !f.approved && f.syntaxValid).map((f) => f.path)));
    setCommitMsgDrafts(Object.fromEntries(files.map((f) => [f.path, f.suggestedCommitMessage])));
    setSelectedPath((prev) => (prev && files.some((f) => f.path === prev) ? prev : files[0]?.path ?? null));
  }

  async function runGenerate() {
    setGenError(null);
    setGenerating(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/expansions/${expansionId}/code/generate`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        setGenError(data.error ?? "생성에 실패했습니다. 다시 시도해주세요.");
        return;
      }
      applyFileChanges(data.files ?? []);
    } catch {
      setGenError("생성에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setGenerating(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    fetch(`${API_BASE_URL}/api/expansions/${expansionId}/file-changes`, { credentials: "include" })
      .then((res) => res.json())
      .then((files: FileChange[]) => {
        applyFileChanges(files);
        if (files.length === 0 && !readOnly && !autoGenerateTriggeredRef.current) {
          autoGenerateTriggeredRef.current = true;
          runGenerate();
        }
      })
      .catch(() => setLoadError("불러오지 못했습니다. 다시 시도해주세요."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expansionId]);

  const selectedFile = useMemo(
    () => fileChanges.find((f) => f.path === selectedPath) ?? null,
    [fileChanges, selectedPath]
  );

  function handleToggleFile(path: string) {
    setCheckedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function handleDeselectAll() {
    setCheckedPaths(new Set());
  }

  // No commit-batch call here on purpose (see the component-level comment
  // above) — this just tells the user honestly what actually happens,
  // instead of pretending this button commits anything.
  function handleCommitSelected() {
    setCommitNotice(
      "이 화면의 선택 항목은 실제 커밋에 반영되지 않습니다 — 5~6단계(문서화) 승인 시 문법 검증을 통과한 파일이 전부 자동으로 커밋됩니다."
    );
  }

  async function handleApprove() {
    setApproving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/expansions/${expansionId}/code/approve`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setGenError(data.error ?? "Approve에 실패했습니다.");
        return;
      }
      onApproved();
    } finally {
      setApproving(false);
    }
  }

  if (loading) return <div style={{ color: "var(--text-dim)" }}>불러오는 중…</div>;
  if (loadError) return <div style={{ color: "var(--red)", fontSize: 13 }}>{loadError}</div>;

  if (readOnly) {
    return (
      <div>
        <label className="label-mono">커밋된 파일</label>
        {fileChanges.length === 0 ? (
          <div style={{ color: "var(--text-mute)", fontSize: 13 }}>파일이 없습니다.</div>
        ) : (
          <FileChangeList
            files={fileChanges}
            checkedPaths={new Set(fileChanges.filter((f) => f.approved).map((f) => f.path))}
            selectedPath={selectedPath}
            onToggle={() => {}}
            onSelect={setSelectedPath}
          />
        )}
      </div>
    );
  }

  return (
    <>
      {generating ? (
        <div style={{ color: "var(--text-dim)" }}>코드를 생성하고 리뷰하는 중…</div>
      ) : genError ? (
        <div>
          <div style={{ color: "var(--red)", fontSize: 12.5 }}>{genError}</div>
          <button style={{ marginTop: 8 }} onClick={runGenerate}>
            다시 시도
          </button>
        </div>
      ) : fileChanges.length === 0 ? (
        <div style={{ color: "var(--text-mute)", fontSize: 13 }}>생성된 파일이 없습니다.</div>
      ) : (
        <div className="commit-shell">
          <FileChangeList
            files={fileChanges}
            checkedPaths={checkedPaths}
            selectedPath={selectedPath}
            onToggle={handleToggleFile}
            onSelect={setSelectedPath}
          />
          <DiffViewer
            file={selectedFile}
            commitMessage={selectedFile ? commitMsgDrafts[selectedFile.path] ?? "" : ""}
            onCommitMessageChange={(value) =>
              selectedFile && setCommitMsgDrafts((prev) => ({ ...prev, [selectedFile.path]: value }))
            }
            checkedCount={checkedPaths.size}
            onDeselectAll={handleDeselectAll}
            onCommitSelected={handleCommitSelected}
            committing={false}
            commitError={commitNotice}
          />
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        <button
          className="primary"
          disabled={fileChanges.length === 0 || approving || generating}
          onClick={handleApprove}
        >
          Approve ✓
        </button>
      </div>
    </>
  );
}
