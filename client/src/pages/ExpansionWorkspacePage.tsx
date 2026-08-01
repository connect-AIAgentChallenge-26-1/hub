import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ExpansionDesignPanel from "../components/ExpansionDesignPanel";
import ExpansionScriptableObjectPanel from "../components/ExpansionScriptableObjectPanel";
import ExpansionCodeReviewPanel from "../components/ExpansionCodeReviewPanel";
import ExpansionDocsPanel from "../components/ExpansionDocsPanel";
import { API_BASE_URL } from "../lib/api";

interface ExpansionRequest {
  description: string;
  status: string;
  created_at: string;
}

const PHASE_LABEL: Record<string, string> = {
  design_pending: "1단계: 설계 변경 제안",
  scriptable_objects_pending: "2단계: ScriptableObject 생성",
  code_pending: "3~4단계: 코드 생성 및 리뷰",
  docs_pending: "5~6단계: 문서화 및 커밋",
  completed: "완료",
};

export default function ExpansionWorkspacePage() {
  const { expansionId } = useParams<{ expansionId: string }>();
  const navigate = useNavigate();
  const [request, setRequest] = useState<ExpansionRequest | null>(null);
  const [phase, setPhase] = useState<"loading" | "error" | "ready">("loading");

  const refresh = useCallback(() => {
    if (!expansionId) return;
    fetch(`${API_BASE_URL}/api/expansions/${expansionId}`, { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((data: ExpansionRequest) => {
        setRequest(data);
        setPhase("ready");
      })
      .catch(() => setPhase("error"));
  }, [expansionId]);

  useEffect(refresh, [refresh]);

  if (!expansionId) return null;

  return (
    <section style={{ padding: "32px 24px", maxWidth: 900, margin: "0 auto" }}>
      <div className="ws-top">
        <div>
          <div className="ws-eyebrow">
            기능 추가 · {PHASE_LABEL[request?.status ?? ""] ?? "진행 중"}
          </div>
          <div className="ws-title">{request?.description ?? "…"}</div>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        {phase === "loading" && <div style={{ color: "var(--text-dim)" }}>불러오는 중…</div>}
        {phase === "error" && (
          <div style={{ color: "var(--red)", fontSize: 13 }}>불러오지 못했습니다. 새로고침 후 다시 시도해주세요.</div>
        )}
        {phase === "ready" && request?.status === "design_pending" && (
          <ExpansionDesignPanel expansionId={expansionId} onApproved={refresh} />
        )}
        {phase === "ready" && request?.status === "scriptable_objects_pending" && (
          <ExpansionScriptableObjectPanel expansionId={expansionId} onApproved={refresh} />
        )}
        {phase === "ready" && request?.status === "code_pending" && (
          <ExpansionCodeReviewPanel expansionId={expansionId} onApproved={refresh} />
        )}
        {phase === "ready" && request?.status === "docs_pending" && (
          <ExpansionDocsPanel expansionId={expansionId} onApproved={refresh} />
        )}
        {phase === "ready" && request?.status === "completed" && (
          <div className="card">
            <div className="card-body">
              <div style={{ color: "var(--teal)", fontWeight: 500, marginBottom: 4 }}>
                기능 추가가 완료되었습니다 ✓
              </div>
              <div style={{ color: "var(--text-dim)", fontSize: 13 }}>
                설계 제안부터 실제 커밋까지 모든 단계가 끝났습니다.
              </div>
            </div>
            <div className="card-foot">
              <button onClick={() => navigate("/workspace")}>워크스페이스로 돌아가기</button>
              <button className="primary" onClick={() => navigate("/expansions/new")}>
                다른 기능 추가하기
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
