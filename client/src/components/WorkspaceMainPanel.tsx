import { useEffect, useMemo, useState } from "react";
import ChatThread from "./ChatThread";
import ChatInput from "./ChatInput";
import MarkdownViewer from "./MarkdownViewer";
import MarkdownEditor from "./MarkdownEditor";
import FileChangeList from "./FileChangeList";
import DiffViewer from "./DiffViewer";
import { API_BASE_URL, type Step, type ChatMessage, type DocumentRecord, type FileChange } from "../lib/api";

const STATUS_BADGE: Record<Step["status"], { label: string; className: string }> = {
  done: { label: "완료", className: "badge success" },
  active: { label: "진행 중", className: "badge warning" },
  pending: { label: "대기", className: "badge" },
};

// Which Steps produce a file-change array instead of a single Markdown
// document — mirrors the server's FILE_AGENT_PROMPTS registry key set
// (fileAgentPrompts.ts). Branches on agent_name, never on step id.
const FILE_AGENT_NAMES = new Set(["Code Generation Agent", "Refactoring Agent"]);

interface Props {
  step: Step;
  onStepsRefreshNeeded: () => void;
}

export default function WorkspaceMainPanel({ step, onStepsRefreshNeeded }: Props) {
  const isFileAgent = FILE_AGENT_NAMES.has(step.agent_name);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [document, setDocument] = useState<DocumentRecord | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatErrorCode, setChatErrorCode] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [approving, setApproving] = useState(false);

  const [fileChanges, setFileChanges] = useState<FileChange[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [checkedPaths, setCheckedPaths] = useState<Set<string>>(new Set());
  const [commitMsgDrafts, setCommitMsgDrafts] = useState<Record<string, string>>({});
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);

  function applyFileChanges(files: FileChange[]) {
    setFileChanges(files);
    setCheckedPaths(new Set(files.filter((f) => !f.approved).map((f) => f.path)));
    setCommitMsgDrafts(Object.fromEntries(files.map((f) => [f.path, f.suggestedCommitMessage])));
    setSelectedPath((prev) => (prev && files.some((f) => f.path === prev) ? prev : files[0]?.path ?? null));
  }

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    if (isFileAgent) {
      Promise.all([
        fetch(`${API_BASE_URL}/api/steps/${step.id}/file-changes`).then((res) => res.json()),
        fetch(`${API_BASE_URL}/api/chat/${step.id}/messages`).then((res) => res.json()),
      ])
        .then(([files, msgs]: [FileChange[], ChatMessage[]]) => {
          applyFileChanges(files);
          setMessages(msgs);
        })
        .catch(() => setLoadError("이 단계를 불러오지 못했습니다. 다시 시도해주세요."))
        .finally(() => setLoading(false));
      return;
    }

    Promise.all([
      fetch(`${API_BASE_URL}/api/documents/${step.id}`).then((res) => (res.ok ? res.json() : null)),
      fetch(`${API_BASE_URL}/api/chat/${step.id}/messages`).then((res) => res.json()),
    ])
      .then(([doc, msgs]: [DocumentRecord | null, ChatMessage[]]) => {
        setDocument(doc);
        setMessages(msgs);
      })
      .catch(() => setLoadError("이 단계를 불러오지 못했습니다. 다시 시도해주세요."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id]);

  const selectedFile = useMemo(
    () => fileChanges.find((f) => f.path === selectedPath) ?? null,
    [fileChanges, selectedPath]
  );

  async function handleSend(text: string) {
    setChatError(null);
    setChatErrorCode(null);
    const optimisticUser: ChatMessage = {
      id: `local-${Date.now()}`,
      from: "user",
      text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUser]);
    setSending(true);

    try {
      const res = await fetch(`${API_BASE_URL}/api/chat/${step.id}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) {
        // AI_QUOTA_EXCEEDED (Gemini 429) arrives with an already human-readable
        // `error` message from the server — no retry here on purpose, since a
        // daily quota won't recover within this request.
        setChatError(data.error ?? "메시지 전송에 실패했습니다. 다시 시도해주세요.");
        setChatErrorCode(data.code ?? null);
        return;
      }

      setMessages(data.messages);
      if (data.document) {
        setDocument(data.document);
        onStepsRefreshNeeded(); // progress_pct depends on the new document's checklist
      }
      if (data.files) {
        applyFileChanges(data.files);
        onStepsRefreshNeeded(); // progress_pct depends on the new files' approved count
      }
    } catch {
      setChatError("메시지 전송에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setSending(false);
    }
  }

  async function handleFinalize() {
    const userMessageCount = messages.filter((m) => m.from === "user").length;
    if (userMessageCount < 1 && !window.confirm("아직 대화가 별로 없는데 지금 문서를 만들까요?")) {
      return;
    }

    setChatError(null);
    setChatErrorCode(null);
    setFinalizing(true);

    try {
      const res = await fetch(`${API_BASE_URL}/api/chat/${step.id}/finalize`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setChatError(data.error ?? "문서 생성에 실패했습니다. 다시 시도해주세요.");
        setChatErrorCode(data.code ?? null);
        return;
      }

      setMessages(data.messages);
      if (data.document) {
        setDocument(data.document);
        onStepsRefreshNeeded(); // progress_pct depends on the new document's checklist
      }
    } catch {
      setChatError("문서 생성에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setFinalizing(false);
    }
  }

  function handleEdit() {
    setDraft(document?.content ?? "");
    setIsEditing(true);
  }
  function handleCancel() {
    setIsEditing(false);
  }
  async function handleSave() {
    const res = await fetch(`${API_BASE_URL}/api/documents/${step.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: draft, path: document?.path }),
    });
    const updated: DocumentRecord = await res.json();
    setDocument(updated);
    setIsEditing(false);
    onStepsRefreshNeeded();
  }

  async function handleApprove() {
    setApproving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/steps/${step.id}/approve`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setChatError(data.error ?? "Approve에 실패했습니다.");
        return;
      }
      onStepsRefreshNeeded();
    } finally {
      setApproving(false);
    }
  }

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

  async function handleCommitSelected() {
    if (checkedPaths.size === 0) return;
    setCommitting(true);
    setCommitError(null);
    try {
      const files = Array.from(checkedPaths).map((path) => ({
        path,
        commitMessage: commitMsgDrafts[path] ?? "",
      }));
      const res = await fetch(`${API_BASE_URL}/api/repo/${step.id}/commit-batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "commit failed");

      applyFileChanges(data.files);
      if (data.failed?.length > 0) {
        setCommitError(
          `${data.failed.length}개 파일 커밋 실패: ${data.failed.map((f: { path: string; error: string }) => `${f.path} (${f.error})`).join(", ")}`
        );
      }
      onStepsRefreshNeeded(); // progress_pct depends on the newly-approved files
    } catch (err) {
      setCommitError(
        err instanceof Error && err.message !== "commit failed" ? err.message : "커밋에 실패했습니다. 다시 시도해주세요."
      );
    } finally {
      setCommitting(false);
    }
  }

  return (
    <>
      <div className="ws-top">
        <div>
          <div className="ws-eyebrow">
            STEP {String(step.id).padStart(2, "0")} / 09 · {step.agent_name}
          </div>
          <div className="ws-title">{step.name}</div>
        </div>
        <span className={STATUS_BADGE[step.status].className}>{STATUS_BADGE[step.status].label}</span>
      </div>

      {loading ? (
        <div style={{ color: "var(--text-dim)" }}>불러오는 중…</div>
      ) : loadError ? (
        <div style={{ color: "var(--red)", fontSize: 13 }}>{loadError}</div>
      ) : step.status === "done" && isFileAgent ? (
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
      ) : step.status === "done" ? (
        <div>
          <label className="label-mono">문서</label>
          {document ? (
            <MarkdownViewer content={document.content} />
          ) : (
            <div style={{ color: "var(--text-mute)", fontSize: 13 }}>문서가 없습니다.</div>
          )}
        </div>
      ) : (
        <>
          {/* Which Step has a working chat is entirely up to the backend (AGENT_PROMPTS
              in agentPrompts.ts) — Steps without a registered agent just get a clear
              error from the first send attempt via chatError below, no hardcoding here. */}
          <div className="qa-box">
            <div className="chat-head">
              <span>{step.agent_name}</span>
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
            {!isFileAgent && (
              <button
                disabled={sending || finalizing}
                onClick={handleFinalize}
                style={{ alignSelf: "flex-end" }}
              >
                지금까지 내용으로 문서 만들기
              </button>
            )}
          </div>
          {chatError && chatErrorCode === "AI_QUOTA_EXCEEDED" ? (
            <div
              style={{
                background: "var(--red-bg)",
                color: "var(--red)",
                borderRadius: 8,
                padding: "10px 12px",
                fontSize: 12.5,
              }}
            >
              {chatError}
            </div>
          ) : (
            chatError && <div style={{ color: "var(--red)", fontSize: 12.5 }}>{chatError}</div>
          )}

          {isFileAgent ? (
            fileChanges.length === 0 ? (
              <div style={{ color: "var(--text-mute)", fontSize: 13 }}>
                아직 제안된 파일이 없습니다. 대화를 통해 파일 생성을 요청해보세요.
              </div>
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
                  committing={committing}
                  commitError={commitError}
                />
              </div>
            )
          ) : (
            <div>
              <div className="md-preview-head">
                <span className="path">{document?.path ?? "문서 없음"}</span>
                {document && !isEditing && (
                  <span
                    onClick={handleEdit}
                    style={{ color: "var(--text-dim)", cursor: "pointer" }}
                    title="원문 수정"
                  >
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
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: "auto" }}>
            <button className="primary" disabled={approving} onClick={handleApprove}>
              Approve ✓
            </button>
          </div>
        </>
      )}
    </>
  );
}
