import React from "react";

const STATE_DIMENSIONS = Object.freeze([
  ["예측 오차", "입력과 예상의 불일치"],
  ["자원 압력", "현재 처리 부담"],
  ["목표 충돌", "동시에 경쟁하는 목표"],
  ["연속성", "이전 맥락과의 연결"],
  ["상호작용 동기화", "입력과 처리 흐름의 정합성"],
  ["탐색 동력", "새 방향을 조사하려는 경향"]
]);

const ACTION_LABELS = Object.freeze({
  continue_task: "작업 계속",
  request_clarification: "명확화 요청",
  verify_context: "맥락 확인",
  ask_priority: "우선순위 질문",
  explore_topic: "주제 탐색",
  reduce_scope: "범위 축소",
  pause_or_recover: "일시 정지·복구",
  acknowledge_observation: "관찰 반영"
});

export default function AgentStatePanel({
  status = "waiting",
  interaction,
  error = ""
}) {
  const actionType = interaction?.response?.actionType;

  return (
    <section
      className="agent-state-panel"
      aria-labelledby="agent-state-title"
    >
      <div className="agent-state-heading">
        <div>
          <p className="agent-state-kicker">INTERNAL STATE v0</p>
          <h2 id="agent-state-title">로봇 내부 상태</h2>
        </div>
        <span className={`state-runtime state-runtime-${status}`}>
          {status === "thinking" ? "갱신 중" : "작동 중"}
        </span>
      </div>

      <div className="state-dimension-grid">
        {STATE_DIMENSIONS.map(([label, description]) => (
          <div className="state-dimension" key={label}>
            <strong>{label}</strong>
            <span>{description}</span>
          </div>
        ))}
      </div>

      <dl className="last-decision">
        <div>
          <dt>마지막 순번</dt>
          <dd>{interaction?.sequenceNumber ?? "—"}</dd>
        </div>
        <div>
          <dt>선택 행동</dt>
          <dd>{ACTION_LABELS[actionType] || "입력 대기"}</dd>
        </div>
      </dl>

      <p className="state-privacy-note">
        내부 수치와 판단 추적은 서버에만 보관되며, 클라이언트는 선택된
        행동만 전달받습니다.
      </p>
      {error && (
        <p className="agent-state-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
