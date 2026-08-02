import { useEffect, useRef, useState } from "react";
import MarkdownViewer from "./MarkdownViewer";
import MarkdownEditor from "./MarkdownEditor";
import { API_BASE_URL, type DocumentRecord } from "../lib/api";

interface Props {
  expansionId: string;
  onApproved: () => void;
  // See ExpansionDesignPanel's readOnly doc — same "already done, just
  // revisiting" contract. Note: Step 6 (커밋) has no document of its own, so
  // when revisiting it the sidebar routes here too and this still shows
  // Step 5's change-log doc, same as the active screen already covers both.
  readOnly?: boolean;
}

interface CommitOutcome {
  path: string;
  commitSha?: string | null;
  error?: string;
}

interface ApproveResponse {
  committed: CommitOutcome[];
  failed: CommitOutcome[];
  skipped: string[];
  request?: { status: string };
}

// Feature Expansion Workflow's Step 5 (문서화) + Step 6 (커밋 트리거) — same
// chat-less auto-generate + MarkdownEditor pattern as
// ExpansionScriptableObjectPanel, built fresh against
// /api/expansions/:id/docs/* instead of reusing WorkspaceMainPanel. Approve
// here also triggers Step 6's real commit (reusing the same GitHub-writing
// pipeline as the 9-step workflow's commit-batch) and shows the result
// before finishing.
export default function ExpansionDocsPanel({ expansionId, onApproved, readOnly = false }: Props) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [document, setDocument] = useState<DocumentRecord | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [approving, setApproving] = useState(false);
  const [approveResult, setApproveResult] = useState<ApproveResponse | null>(null);

  const autoGenerateTriggeredRef = useRef(false);

  async function runGenerate() {
    setGenError(null);
    setGenerating(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/expansions/${expansionId}/docs/generate`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        setGenError(data.error ?? "생성에 실패했습니다. 다시 시도해주세요.");
        return;
      }
      if (data.document) setDocument(data.document);
    } catch {
      setGenError("생성에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setGenerating(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    fetch(`${API_BASE_URL}/api/expansions/${expansionId}/docs`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((doc: DocumentRecord | null) => {
        setDocument(doc);
        if (!doc && !readOnly && !autoGenerateTriggeredRef.current) {
          autoGenerateTriggeredRef.current = true;
          runGenerate();
        }
      })
      .catch(() => setLoadError("불러오지 못했습니다. 다시 시도해주세요."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expansionId]);

  function handleEdit() {
    setDraft(document?.content ?? "");
    setIsEditing(true);
  }
  function handleCancel() {
    setIsEditing(false);
  }
  async function handleSave() {
    const res = await fetch(`${API_BASE_URL}/api/expansions/${expansionId}/docs`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: draft, path: document?.path }),
      credentials: "include",
    });
    const updated: DocumentRecord = await res.json();
    setDocument(updated);
    setIsEditing(false);
  }

  async function handleApprove() {
    setApproving(true);
    setApproveResult(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/expansions/${expansionId}/docs/approve`, {
        method: "POST",
        credentials: "include",
      });
      const data: ApproveResponse = await res.json();
      if (!res.ok) {
        setGenError((data as unknown as { error?: string }).error ?? "커밋에 실패했습니다.");
        return;
      }
      setApproveResult(data);
    } catch {
      setGenError("커밋에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setApproving(false);
    }
  }

  if (loading) return <div style={{ color: "var(--text-dim)" }}>불러오는 중…</div>;
  if (loadError) return <div style={{ color: "var(--red)", fontSize: 13 }}>{loadError}</div>;

  if (readOnly) {
    return (
      <div>
        <label className="label-mono">문서</label>
        {document ? (
          <MarkdownViewer content={document.content} />
        ) : (
          <div style={{ color: "var(--text-mute)", fontSize: 13 }}>문서가 없습니다.</div>
        )}
      </div>
    );
  }

  return (
    <>
      {generating ? (
        <div style={{ color: "var(--text-dim)" }}>변경 로그를 정리하는 중…</div>
      ) : genError ? (
        <div>
          <div style={{ color: "var(--red)", fontSize: 12.5 }}>{genError}</div>
          <button style={{ marginTop: 8 }} onClick={runGenerate}>
            다시 시도
          </button>
        </div>
      ) : (
        <div>
          <div className="md-preview-head">
            <span className="path">{document?.path ?? "문서 없음"}</span>
            {document && !isEditing && (
              <span onClick={handleEdit} style={{ color: "var(--text-dim)", cursor: "pointer" }} title="원문 수정">
                ✎ 수정
              </span>
            )}
          </div>
          {!document ? (
            <div style={{ color: "var(--text-mute)", fontSize: 13 }}>생성된 문서가 없습니다.</div>
          ) : isEditing ? (
            <>
              <MarkdownEditor value={draft} onChange={setDraft} />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
                <button onClick={handleCancel}>취소</button>
                <button className="primary" onClick={handleSave}>
                  저장
                </button>
              </div>
            </>
          ) : (
            <MarkdownViewer content={document.content} />
          )}
        </div>
      )}

      {approveResult && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-body">
            <label className="label-mono">커밋 결과</label>
            <div style={{ fontSize: 13 }}>
              커밋됨 {approveResult.committed.length}개
              {approveResult.skipped.length > 0 && `, 문법 오류로 제외됨 ${approveResult.skipped.length}개`}
              {approveResult.failed.length > 0 && `, 실패 ${approveResult.failed.length}개`}
            </div>
            <ul style={{ marginTop: 8, fontSize: 12.5, color: "var(--text-dim)" }}>
              {approveResult.committed.map((c) => (
                <li key={c.path}>✓ {c.path}</li>
              ))}
              {approveResult.skipped.map((path) => (
                <li key={path} style={{ color: "var(--amber)" }}>
                  ⚠ {path} (문법 오류로 제외)
                </li>
              ))}
              {approveResult.failed.map((f) => (
                <li key={f.path} style={{ color: "var(--red)" }}>
                  ✗ {f.path} — {f.error}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        {approveResult ? (
          <button className="primary" onClick={onApproved}>
            완료
          </button>
        ) : (
          <button
            className="primary"
            disabled={!document || approving || generating}
            onClick={handleApprove}
          >
            Approve ✓
          </button>
        )}
      </div>
    </>
  );
}
