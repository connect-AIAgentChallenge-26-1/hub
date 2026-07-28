import React from "react";

const KIND_LABELS = Object.freeze({
  system: "시스템",
  observation: "관찰",
  state: "상태 변화",
  decision: "판단"
});

function formatTime(timestamp) {
  const date = new Date(timestamp);

  if (!Number.isFinite(date.getTime())) return "방금";

  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date);
}

export default function NoaDecisionLog({ entries = [] }) {
  return (
    <section className="noa-log-card" aria-labelledby="noa-log-title">
      <div className="section-heading">
        <div>
          <p className="section-kicker">VISIBLE DECISION LOG</p>
          <h2 id="noa-log-title">Noa는 지금 이렇게 판단하고 있어요</h2>
        </div>
        <span className="section-count">{entries.length} events</span>
      </div>

      <p className="section-intro">
        숨겨진 사고과정을 그대로 보여주는 대신, Noa가 무엇을 관찰했고
        상태가 어떻게 달라졌으며 어떤 결정을 내렸는지 쉬운 말로 기록합니다.
      </p>

      <ol
        className="noa-log"
        role="log"
        aria-label="Noa 공개 판단 로그"
        aria-live="polite"
        aria-relevant="additions text"
      >
        {entries.map((entry) => (
          <li className={`noa-log-entry noa-log-${entry.kind}`} key={entry.id}>
            <div className="log-rail" aria-hidden="true">
              <span />
            </div>
            <div className="log-copy">
              <div className="log-meta">
                <span>{KIND_LABELS[entry.kind] || "기록"}</span>
                <time dateTime={entry.createdAt}>
                  {formatTime(entry.createdAt)}
                </time>
              </div>
              <strong>{entry.title}</strong>
              <p>{entry.detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
