import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE_URL } from "../lib/api";

interface CreateExpansionResponse {
  expansionId: string;
  error?: string;
}

export default function FeatureRequestPage() {
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function handleSubmit() {
    if (!description.trim() || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/expansions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: description.trim() }),
        credentials: "include",
      });
      const data: CreateExpansionResponse = await res.json();
      if (!res.ok) {
        setError(data.error ?? "요청 생성에 실패했습니다. 다시 시도해주세요.");
        setSubmitting(false);
        return;
      }
      navigate(`/expansions/${data.expansionId}`);
    } catch {
      setError("요청 생성에 실패했습니다. 다시 시도해주세요.");
      setSubmitting(false);
    }
  }

  return (
    <section style={{ padding: "32px 24px", maxWidth: 640, margin: "0 auto" }}>
      <div className="card">
        <div className="card-head">
          <span style={{ fontWeight: 500 }}>기능 추가</span>
        </div>
        <div className="card-body">
          <label className="label-mono">어떤 기능을 추가하고 싶으세요?</label>
          <textarea
            className="free-text"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="대시 기능을 추가해줘"
          />
          {error && <div style={{ color: "var(--red)", fontSize: 12.5, marginTop: 10 }}>{error}</div>}
        </div>
        <div className="card-foot">
          <button onClick={() => navigate(-1)}>취소</button>
          <button className="primary" disabled={!description.trim() || submitting} onClick={handleSubmit}>
            {submitting ? "요청 중…" : "제출"}
          </button>
        </div>
      </div>
    </section>
  );
}
