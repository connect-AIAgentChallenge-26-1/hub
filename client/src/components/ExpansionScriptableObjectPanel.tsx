import { useEffect, useRef, useState } from "react";
import MarkdownViewer from "./MarkdownViewer";
import MarkdownEditor from "./MarkdownEditor";
import { API_BASE_URL, type DocumentRecord } from "../lib/api";

interface Props {
  expansionId: string;
  onApproved: () => void;
}

// Feature Expansion Workflow's Step 2 (ScriptableObject 생성) — chat-less,
// same "auto-generate on entry" idea as the 9-step workflow's Code
// Generation/Documentation Steps, built fresh against
// /api/expansions/:id/scriptable-objects/* instead of reusing
// WorkspaceMainPanel. Only MarkdownViewer/MarkdownEditor are reused as-is.
export default function ExpansionScriptableObjectPanel({ expansionId, onApproved }: Props) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [document, setDocument] = useState<DocumentRecord | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [approving, setApproving] = useState(false);

  // Guards against React 18 StrictMode's dev-only double-invoke of the mount
  // effect firing runGenerate() twice — same idea as WorkspaceMainPanel's
  // autoGenerateTriggeredForStepRef.
  const autoGenerateTriggeredRef = useRef(false);

  async function runGenerate() {
    setGenError(null);
    setGenerating(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/expansions/${expansionId}/scriptable-objects/generate`, {
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
    fetch(`${API_BASE_URL}/api/expansions/${expansionId}/scriptable-objects`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((doc: DocumentRecord | null) => {
        setDocument(doc);
        if (!doc && !autoGenerateTriggeredRef.current) {
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
    const res = await fetch(`${API_BASE_URL}/api/expansions/${expansionId}/scriptable-objects`, {
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
    try {
      const res = await fetch(`${API_BASE_URL}/api/expansions/${expansionId}/scriptable-objects/approve`, {
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
        <div style={{ color: "var(--text-dim)" }}>ScriptableObject 설계를 생성하는 중…</div>
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

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        <button className="primary" disabled={!document || approving || generating} onClick={handleApprove}>
          Approve ✓
        </button>
      </div>
    </>
  );
}
