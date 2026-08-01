import { useEffect, useMemo, useRef, useState } from "react";
import FileChangeList from "./FileChangeList";
import DiffViewer from "./DiffViewer";
import { API_BASE_URL, type FileChange } from "../lib/api";

interface Props {
  expansionId: string;
  onApproved: () => void;
}

// Feature Expansion Workflow's Steps 3-4 (코드 생성 + 코드 리뷰) — chat-less,
// same "auto-generate on entry" idea as the 9-step workflow's file-agent
// Steps, built fresh against /api/expansions/:id/code/* and
// /api/expansions/:id/file-changes instead of reusing WorkspaceMainPanel.
// FileChangeList/DiffViewer are reused as-is (unmodified) — real commits
// aren't wired up yet (Day 22's job), so the commit button here just
// explains that instead of calling a commit-batch endpoint.
export default function ExpansionCodeReviewPanel({ expansionId, onApproved }: Props) {
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
        if (files.length === 0 && !autoGenerateTriggeredRef.current) {
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

  // Day 22 wires this up to a real commit-batch endpoint — for now this just
  // tells the user honestly that committing isn't available yet, rather than
  // pretending to commit or silently doing nothing.
  function handleCommitSelected() {
    setCommitNotice("커밋은 다음 작업(Day 22)에서 지원될 예정입니다.");
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
