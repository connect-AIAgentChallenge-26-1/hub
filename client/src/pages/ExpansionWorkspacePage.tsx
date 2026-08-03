import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import StepSidebar from "../components/StepSidebar";
import ExpansionDesignPanel from "../components/ExpansionDesignPanel";
import ExpansionScriptableObjectPanel from "../components/ExpansionScriptableObjectPanel";
import ExpansionCodeReviewPanel from "../components/ExpansionCodeReviewPanel";
import ExpansionDocsPanel from "../components/ExpansionDocsPanel";
import { API_BASE_URL, type SidebarStep } from "../lib/api";

interface ExpansionRequest {
  description: string;
  status: string;
  created_at: string;
}

export default function ExpansionWorkspacePage() {
  const { expansionId } = useParams<{ expansionId: string }>();
  const navigate = useNavigate();
  const [request, setRequest] = useState<ExpansionRequest | null>(null);
  const [steps, setSteps] = useState<SidebarStep[]>([]);
  const [selectedStepId, setSelectedStepId] = useState<number | null>(null);
  const [phase, setPhase] = useState<"loading" | "error" | "ready">("loading");

  const refresh = useCallback(() => {
    if (!expansionId) return;
    Promise.all([
      fetch(`${API_BASE_URL}/api/expansions/${expansionId}`, { credentials: "include" }).then((res) => {
        if (!res.ok) throw new Error();
        return res.json();
      }),
      fetch(`${API_BASE_URL}/api/expansions/${expansionId}/steps`, { credentials: "include" }).then((res) => {
        if (!res.ok) throw new Error();
        return res.json();
      }),
    ])
      .then(([requestData, stepsData]: [ExpansionRequest, SidebarStep[]]) => {
        setRequest(requestData);
        setSteps(stepsData);
        setPhase("ready");
      })
      .catch(() => setPhase("error"));
  }, [expansionId]);

  useEffect(refresh, [refresh]);

  // Picks a default step to open once, the same way WorkspacePage does for
  // the 9-step sidebar (earliest active-or-done step) — deliberately only
  // fires while nothing is selected yet, so approving the currently-open
  // step never yanks the view to a different one afterwards; the user clicks
  // ahead manually, same as the 9-step workflow.
  useEffect(() => {
    if (steps.length === 0 || selectedStepId !== null) return;
    const firstClickable = steps.find((s) => s.status === "active" || s.status === "done");
    if (firstClickable) setSelectedStepId(firstClickable.id);
  }, [steps, selectedStepId]);

  if (!expansionId) return null;

  const selectedStep = steps.find((s) => s.id === selectedStepId) ?? null;
  const readOnly = selectedStep?.status === "done";

  function renderPanel() {
    if (!selectedStep) {
      return <div style={{ color: "var(--text-dim)" }}>표시할 단계가 없습니다.</div>;
    }
    switch (selectedStep.id) {
      case 1:
        return <ExpansionDesignPanel key={1} expansionId={expansionId!} onApproved={refresh} readOnly={readOnly} />;
      case 2:
        return (
          <ExpansionScriptableObjectPanel key={2} expansionId={expansionId!} onApproved={refresh} readOnly={readOnly} />
        );
      case 3:
      case 4:
        // Steps 3-4 (코드 생성/코드 리뷰) share one screen — same key
        // regardless of which of the two sidebar rows was clicked.
        return <ExpansionCodeReviewPanel key="code" expansionId={expansionId!} onApproved={refresh} readOnly={readOnly} />;
      case 5:
      case 6:
        // Steps 5-6 (문서화/커밋) likewise share one screen.
        return <ExpansionDocsPanel key="docs" expansionId={expansionId!} onApproved={refresh} readOnly={readOnly} />;
      default:
        return null;
    }
  }

  return (
    <section style={{ padding: "32px 24px", maxWidth: 1080, margin: "0 auto" }}>
      <div className="ws-top">
        <div>
          <div className="ws-eyebrow">기능 추가</div>
          <div className="ws-title">{request?.description ?? "…"}</div>
        </div>
      </div>

      {phase === "loading" && (
        <div style={{ color: "var(--text-dim)", marginTop: 16 }}>불러오는 중…</div>
      )}
      {phase === "error" && (
        <div style={{ color: "var(--red)", fontSize: 13, marginTop: 16 }}>
          불러오지 못했습니다. 새로고침 후 다시 시도해주세요.
        </div>
      )}

      {phase === "ready" && (
        <>
          {request?.status === "completed" && (
            <div className="card" style={{ marginTop: 16 }}>
              <div className="card-body">
                <div style={{ color: "var(--teal)", fontWeight: 500, marginBottom: 4 }}>
                  기능 추가가 완료되었습니다 ✓
                </div>
                <div style={{ color: "var(--text-dim)", fontSize: 13 }}>
                  설계 제안부터 실제 커밋까지 모든 단계가 끝났습니다. 아래에서 각 단계를 다시 열람할 수 있습니다.
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

          <div className="workspace" style={{ marginTop: 16 }}>
            <StepSidebar steps={steps} selectedStepId={selectedStepId} onSelectStep={setSelectedStepId} />
            <div className="ws-main">{renderPanel()}</div>
          </div>
        </>
      )}
    </section>
  );
}
