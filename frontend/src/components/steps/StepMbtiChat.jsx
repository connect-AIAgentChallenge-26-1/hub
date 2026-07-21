// Step 1-b: 간이 MBTI 추정 채팅(ADR-008). 공식 판정 아님 · 동의 후 대화 원문을 backend 프록시로만 보낸다.
// 키 없음/실패 시 규칙 설문으로 폴백(onFallback). 성공 시 추정 4글자를 onEstimated 로 상위에 넘긴다.
import { useState } from "react";
import { estimateMbtiFromChat } from "../../lib/api";

// ≈2회 대화. 원문은 이 경로에서만 쓰고 저장하지 않는다(연구 경로와 분리).
const PROMPTS = [
  "새로운 일을 시작할 때, 계획을 먼저 촘촘히 세우는 편인가요, 일단 해보며 맞춰가는 편인가요? 편하게 적어주세요.",
  "여러 사람과 함께 있을 때 에너지가 차오르나요, 혼자 정리할 때 회복되나요? 그리고 결정할 때 논리와 감정 중 무엇을 더 따르나요?",
];

export function StepMbtiChat({ onEstimated, onFallback, onBack, onHome }) {
  const [turn, setTurn] = useState(0);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState([]);
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submitTurn() {
    const text = draft.trim();
    if (!text) {
      return;
    }
    const nextMessages = [...messages, { role: "user", text }];
    setMessages(nextMessages);
    setDraft("");

    if (turn + 1 < PROMPTS.length) {
      setTurn(turn + 1);
      return;
    }

    // 마지막 턴 → 서버 추정 요청.
    setLoading(true);
    setError("");
    try {
      const res = await estimateMbtiFromChat(nextMessages);
      if (!res?.available) {
        onFallback("지금은 AI 추정을 쓸 수 없어요. 규칙 설문으로 계속 진행할게요.");
        return;
      }
      if (!res.mbti) {
        onFallback("대화만으로는 유형을 뚜렷이 추정하기 어려웠어요. 규칙 설문으로 계속 진행할게요.");
        return;
      }
      onEstimated(res.mbti, { confidence: res.confidence, rationale: res.rationale, uncertainty: res.uncertainty });
    } catch {
      onFallback("추정 중 문제가 생겼어요. 규칙 설문으로 계속 진행할게요.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel">
      <p className="eyebrow">Step 1 · 선택</p>
      <h2>AI와 짧게 대화해 유형 간이 추정</h2>
      <p>
        공식 MBTI 결과가 없을 때, 짧은 대화로 유형을 <strong>간이 추정</strong>해 공부법 매칭에 씁니다.
        이것은 <strong>공식 판정이 아니라 탐색적 추정</strong>이며, 결과 화면에 한계 고지를 함께 보여줍니다.
      </p>

      {!consent ? (
        <div className="feedback-card" style={{ marginTop: 12 }}>
          <p className="eyebrow">외부 처리 동의</p>
          <ul>
            <li>이 대화 내용은 <strong>외부 LLM(Google Gemini)</strong>으로 전송되어 유형을 추정합니다.</li>
            <li>대화 원문은 연구 데이터로 <strong>저장하지 않습니다</strong>(추정에만 사용).</li>
            <li>이름·연락처 등 개인정보는 입력하지 마세요. 동의하지 않아도 규칙 설문으로 진행할 수 있습니다.</li>
          </ul>
          <label className="checkline">
            <input checked={consent} onChange={(event) => setConsent(event.target.checked)} type="checkbox" />
            위 내용을 이해했고, 대화 원문의 외부 처리에 동의합니다.
          </label>
          <div className="actions" style={{ marginTop: 12 }}>
            <button className="secondary" onClick={onBack} type="button">이전</button>
            <button className="secondary" onClick={() => onFallback("규칙 설문으로 진행할게요.")} type="button">
              동의 없이 설문으로
            </button>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 12 }}>
          <p className="hint">{turn + 1} / {PROMPTS.length}</p>
          <p className="lead">{PROMPTS[turn]}</p>
          <textarea
            aria-label="대화 응답"
            maxLength={500}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="편하게 적어주세요. 개인정보는 입력하지 마세요."
            value={draft}
          />
          {error && <p className="hint" style={{ color: "var(--accent-strong)" }}>{error}</p>}
          <div className="actions" style={{ marginTop: 12 }}>
            <button className="secondary" onClick={onHome} type="button">처음 화면</button>
            <button className="primary" disabled={loading || !draft.trim()} onClick={submitTurn} type="button">
              {loading ? "추정 중…" : turn + 1 < PROMPTS.length ? "다음" : "유형 추정하기"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
