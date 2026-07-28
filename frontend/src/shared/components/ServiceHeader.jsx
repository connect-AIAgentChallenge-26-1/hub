import React from "react";
import { CobeGlobeLabels } from "./CobeGlobeLabels";

const statusLabels = {
  waiting: "입력 대기",
  thinking: "상태 갱신 중",
  speaking: "행동 실행 중"
};

export default function ServiceHeader({ status = "waiting" }) {
  return (
    <header className="ai-card">
      <div className="ai-card-copy">
        <p className="ai-eyebrow">ROBOT STATE SYSTEM</p>
        <div className="ai-title-row">
          <h1 className="ai-name">내부 상태 에이전트</h1>
          <div className={`ai-status ai-status-${status}`} role="status" aria-live="polite">
            <span className="ai-status-dot" aria-hidden="true" />
            {statusLabels[status] || status}
          </div>
        </div>
        <p className="ai-description">
          독립적인 내부 상태를 갱신하고 그 결과로 다음 행동을 선택합니다.
        </p>
      </div>
      <CobeGlobeLabels className="ai-globe" />
      <p className="ai-globe-caption">드래그하여 상태 차원 둘러보기</p>
    </header>
  );
}
