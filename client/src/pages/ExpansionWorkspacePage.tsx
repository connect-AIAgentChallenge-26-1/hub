import { useParams, useNavigate } from "react-router-dom";

// Placeholder landing spot for a newly-created feature expansion request —
// the real 1단계(설계 변경 제안) Agent screen is Day 20's job. This just
// proves the routing/expansion_id handoff works end to end.
export default function ExpansionWorkspacePage() {
  const { expansionId } = useParams<{ expansionId: string }>();
  const navigate = useNavigate();

  return (
    <section style={{ padding: "32px 24px", maxWidth: 640, margin: "0 auto" }}>
      <div className="card">
        <div className="card-head">
          <span style={{ fontWeight: 500 }}>기능 추가 — 1단계: 설계 변경 제안</span>
        </div>
        <div className="card-body">
          <label className="label-mono">EXPANSION ID</label>
          <div style={{ fontFamily: "var(--mono)", fontSize: 13, marginBottom: 16 }}>{expansionId}</div>
          <div style={{ color: "var(--text-dim)" }}>다음 단계 준비 중입니다.</div>
        </div>
        <div className="card-foot">
          <button onClick={() => navigate("/workspace")}>워크스페이스로 돌아가기</button>
        </div>
      </div>
    </section>
  );
}
