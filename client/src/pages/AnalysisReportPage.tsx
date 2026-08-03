import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AnalysisReportCard, { type AnalysisStats } from "../components/AnalysisReportCard";
import { API_BASE_URL } from "../lib/api";
import { useDemoMode } from "../lib/DemoModeContext";

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "success"; stats: AnalysisStats; report: string };

export default function AnalysisReportPage() {
  const [state, setState] = useState<State>({ status: "loading" });
  const navigate = useNavigate();
  const { enableNewProjectWorkflow } = useDemoMode();

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/analysis/report`, { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error("report fetch failed");
        return res.json();
      })
      .then((data: { stats: AnalysisStats; report: string }) =>
        setState({ status: "success", stats: data.stats, report: data.report })
      )
      .catch(() => setState({ status: "error" }));
  }, []);

  function handleApprove() {
    // Step[1] is already "active" from the seed data — sidebar/step state
    // management itself is Day 9's job, not this screen's. When the 9-step
    // workflow is feature-flagged off, route straight into the Feature
    // Expansion Workflow's entry point instead (null treated as "off", the
    // same safe default as the server's own flag default).
    navigate(enableNewProjectWorkflow ? "/workspace" : "/expansions/new");
  }

  return (
    <section style={{ padding: "32px 24px", maxWidth: 1080, margin: "0 auto" }}>
      {state.status === "loading" && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
            padding: 48,
            color: "var(--text-dim)",
          }}
        >
          <div className="spinner" />
          <div>분석 중…</div>
        </div>
      )}

      {state.status === "error" && (
        <div className="card" style={{ maxWidth: 480, margin: "0 auto" }}>
          <div className="card-body" style={{ textAlign: "center" }}>
            <div style={{ color: "var(--red)", marginBottom: 12 }}>
              분석에 실패했습니다. 다시 시도해주세요.
            </div>
            <button onClick={() => navigate("/repo")}>저장소 연결로 돌아가기</button>
          </div>
        </div>
      )}

      {state.status === "success" && (
        <AnalysisReportCard stats={state.stats} report={state.report} onApprove={handleApprove} />
      )}
    </section>
  );
}
