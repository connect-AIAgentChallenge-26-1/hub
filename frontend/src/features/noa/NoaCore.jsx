import React, { useMemo, useState } from "react";
import { CobeGlobeLabels } from "../../shared/components/CobeGlobeLabels";

const STATUS_LABELS = Object.freeze({
  ready: "안정 상태",
  observing: "관찰 중",
  updating: "연결 중",
  attention: "확인 필요"
});

function readLevel(value, thresholds = [0.12, 0.3]) {
  if (!Number.isFinite(value)) return "대기";
  if (value < thresholds[0]) return "낮음";
  if (value < thresholds[1]) return "보통";
  return "높음";
}

function createStateDimensions(observation, cameraStatus) {
  const isObserving = cameraStatus === "active";

  return [
    {
      id: "prediction",
      label: "예측 변화",
      value: readLevel(observation?.motion, [0.08, 0.2]),
      description: "이전 장면과 현재 관찰의 차이"
    },
    {
      id: "pressure",
      label: "처리 부담",
      value: isObserving ? "보통" : "낮음",
      description: "현재 관찰을 다루는 자원 수준"
    },
    {
      id: "competition",
      label: "목표 충돌",
      value: "없음",
      description: "동시에 경쟁하는 행동의 정도"
    },
    {
      id: "continuity",
      label: "연속성",
      value: isObserving ? "유지" : "대기",
      description: "직전 관찰과 현재 흐름의 연결"
    },
    {
      id: "synchrony",
      label: "관찰 동기화",
      value: isObserving ? "연결됨" : "꺼짐",
      description: "카메라 신호와 상태 갱신의 정합성"
    },
    {
      id: "exploration",
      label: "탐색 동력",
      value: observation?.scene === "movement" ? "활성" : "안정",
      description: "새로운 변화를 확인하려는 경향"
    }
  ];
}

export default function NoaCore({
  status = "ready",
  cameraStatus = "idle",
  observation = null
}) {
  const [isStateOpen, setIsStateOpen] = useState(false);
  const stateDimensions = useMemo(
    () => createStateDimensions(observation, cameraStatus),
    [cameraStatus, observation]
  );

  return (
    <section className="noa-core" aria-labelledby="noa-title">
      <div className="noa-core-copy">
        <p className="noa-eyebrow">INTERNAL STATE SYSTEM · NOA</p>
        <div className="noa-title-row">
          <h1 id="noa-title">Noa</h1>
          <span
            className={`noa-status noa-status-${status}`}
            role="status"
            aria-live="polite"
          >
            <span className="noa-status-dot" aria-hidden="true" />
            {STATUS_LABELS[status] || status}
          </span>
        </div>
        <p className="noa-description">
          Noa는 관찰을 받아들이고, 자신의 상태를 조정한 뒤 다음 행동을
          선택합니다.
        </p>
      </div>

      <CobeGlobeLabels
        className="noa-globe"
        expanded={isStateOpen}
        ariaLabel={
          isStateOpen
            ? "Noa 내부 상태 닫기"
            : "Noa 내부 상태 열기"
        }
        onActivate={() => setIsStateOpen((isOpen) => !isOpen)}
      />

      <button
        type="button"
        className="state-toggle"
        aria-expanded={isStateOpen}
        aria-controls="noa-internal-state"
        onClick={() => setIsStateOpen((isOpen) => !isOpen)}
      >
        <span>{isStateOpen ? "내부 상태 닫기" : "지구본을 눌러 내부 상태 보기"}</span>
        <span aria-hidden="true">{isStateOpen ? "−" : "+"}</span>
      </button>

      {isStateOpen && (
        <section
          id="noa-internal-state"
          className="noa-internal-state"
          aria-labelledby="noa-state-title"
        >
          <div className="noa-state-heading">
            <div>
              <p>PUBLIC STATE SUMMARY</p>
              <h2 id="noa-state-title">Noa의 현재 내부 상태</h2>
            </div>
            <span>{observation ? "방금 갱신됨" : "기본 상태"}</span>
          </div>

          <div className="noa-state-grid">
            {stateDimensions.map((dimension) => (
              <article className="noa-state-item" key={dimension.id}>
                <div>
                  <strong>{dimension.label}</strong>
                  <span>{dimension.value}</span>
                </div>
                <p>{dimension.description}</p>
              </article>
            ))}
          </div>

          <p className="noa-state-note">
            표시 값은 Noa의 비공개 계산을 그대로 노출한 것이 아니라,
            현재 상태와 변화 방향을 이해하기 쉽게 정리한 공개 요약입니다.
          </p>
        </section>
      )}
    </section>
  );
}
