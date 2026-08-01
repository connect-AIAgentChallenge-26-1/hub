import { useEffect, useState } from "react";
import ChatThread from "./ChatThread";
import ChatInput from "./ChatInput";
import MarkdownViewer from "./MarkdownViewer";
import MarkdownEditor from "./MarkdownEditor";
import { API_BASE_URL, type ChatMessage, type DocumentRecord } from "../lib/api";

interface Props {
  expansionId: string;
  onApproved: () => void;
}

// Feature Expansion Workflow's Step 1 (설계 변경 제안) — chat-based, same
// look/behavior as the 9-step workflow's doc-chat Steps (WorkspaceMainPanel),
// but built fresh against the /api/expansions/:id/design/* endpoints instead
// of reusing WorkspaceMainPanel itself. Only the smaller shared pieces
// (ChatThread/ChatInput/MarkdownViewer/MarkdownEditor) are reused as-is.
export default function ExpansionDesignPanel({ expansionId, onApproved }: Props) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [document, setDocument] = useState<DocumentRecord | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    Promise.all([
      fetch(`${API_BASE_URL}/api/expansions/${expansionId}/design`, { credentials: "include" }).then((res) =>
        res.ok ? res.json() : null
      ),
      fetch(`${API_BASE_URL}/api/expansions/${expansionId}/design/messages`, { credentials: "include" }).then(
        (res) => res.json()
      ),
    ])
      .then(([doc, msgs]: [DocumentRecord | null, ChatMessage[]]) => {
        setDocument(doc);
        setMessages(msgs);
      })
      .catch(() => setLoadError("불러오지 못했습니다. 다시 시도해주세요."))
      .finally(() => setLoading(false));
  }, [expansionId]);

  async function runFinalize() {
    setChatError(null);
    setFinalizing(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/expansions/${expansionId}/design/finalize`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        setChatError(data.error ?? "생성에 실패했습니다. 다시 시도해주세요.");
        return;
      }
      setMessages(data.messages);
      if (data.document) setDocument(data.document);
    } catch {
      setChatError("생성에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setFinalizing(false);
    }
  }

  async function handleSend(text: string) {
    setChatError(null);
    const optimisticUser: ChatMessage = {
      id: `local-${Date.now()}`,
      from: "user",
      text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUser]);
    setSending(true);

    try {
      const res = await fetch(`${API_BASE_URL}/api/expansions/${expansionId}/design/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        setChatError(data.error ?? "메시지 전송에 실패했습니다. 다시 시도해주세요.");
        return;
      }
      setMessages(data.messages);
      if (data.document) setDocument(data.document);
    } catch {
      setChatError("메시지 전송에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setSending(false);
    }
  }

  function handleFinalizeClick() {
    const userMessageCount = messages.filter((m) => m.from === "user").length;
    if (userMessageCount < 1 && !window.confirm("아직 대화가 별로 없는데 지금 문서를 만들까요?")) {
      return;
    }
    runFinalize();
  }

  function handleEdit() {
    setDraft(document?.content ?? "");
    setIsEditing(true);
  }
  function handleCancel() {
    setIsEditing(false);
  }
  async function handleSave() {
    const res = await fetch(`${API_BASE_URL}/api/expansions/${expansionId}/design`, {
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
      const res = await fetch(`${API_BASE_URL}/api/expansions/${expansionId}/design/approve`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setChatError(data.error ?? "Approve에 실패했습니다.");
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
      <div className="qa-box">
        <div className="chat-head">
          <span>Feature Design Agent</span>
          <span>{messages.length}개 메시지</span>
        </div>
        {messages.length === 0 && !sending && !finalizing ? (
          <div style={{ color: "var(--text-mute)", fontSize: 13 }}>
            아직 대화가 없습니다. 메시지를 보내 대화를 시작해보세요.
          </div>
        ) : (
          <ChatThread messages={messages} sending={sending || finalizing} />
        )}
        <ChatInput onSend={handleSend} disabled={sending || finalizing} />
        <button disabled={sending || finalizing} onClick={handleFinalizeClick} style={{ alignSelf: "flex-end" }}>
          지금까지 내용으로 문서 만들기
        </button>
      </div>
      {chatError && <div style={{ color: "var(--red)", fontSize: 12.5, marginTop: 8 }}>{chatError}</div>}

      <div style={{ marginTop: 16 }}>
        <div className="md-preview-head">
          <span className="path">{document?.path ?? "문서 없음"}</span>
          {document && !isEditing && (
            <span onClick={handleEdit} style={{ color: "var(--text-dim)", cursor: "pointer" }} title="원문 수정">
              ✎ 수정
            </span>
          )}
        </div>
        {!document ? (
          <div style={{ color: "var(--text-mute)", fontSize: 13 }}>
            아직 문서가 없습니다. 대화를 통해 정보가 모이면 자동으로 생성됩니다.
          </div>
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

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        <button className="primary" disabled={!document || approving || finalizing} onClick={handleApprove}>
          Approve ✓
        </button>
      </div>
    </>
  );
}
