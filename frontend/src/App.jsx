import React, { useCallback, useRef, useState } from "react";
import {
  NoaCamera,
  NoaCore,
  NoaDecisionLog
} from "./features/noa";

function createInitialLogs() {
  const startedAt = new Date().toISOString();

  return [
    {
      id: "noa-started",
      kind: "system",
      title: "Noa가 준비되었습니다.",
      detail: "내부 상태를 안정적으로 유지하며 새로운 관찰을 기다립니다.",
      createdAt: startedAt
    },
    {
      id: "noa-policy",
      kind: "decision",
      title: "현재 판단: 관찰 대기",
      detail: "확인된 외부 신호가 없어 상태를 임의로 바꾸지 않습니다.",
      createdAt: startedAt
    }
  ];
}

export default function App() {
  const [logs, setLogs] = useState(createInitialLogs);
  const [cameraStatus, setCameraStatus] = useState("idle");
  const [latestObservation, setLatestObservation] = useState(null);
  const logSequenceRef = useRef(0);

  const appendLog = useCallback((event) => {
    logSequenceRef.current += 1;
    const createdAt = event.createdAt || new Date().toISOString();

    setLogs((currentLogs) => [
      ...currentLogs.slice(-9),
      {
        id: `noa-log-${Date.now()}-${logSequenceRef.current}`,
        kind: event.kind || "observation",
        title: event.title,
        detail: event.detail,
        createdAt
      }
    ]);
  }, []);

  const noaStatus =
    cameraStatus === "active"
      ? "observing"
      : cameraStatus === "requesting"
        ? "updating"
        : cameraStatus === "denied" || cameraStatus === "error"
          ? "attention"
          : "ready";

  return (
    <div className="app-root">
      <header className="site-header">
        <a className="site-brand" href="/" aria-label="Noa 홈">
          <span className="site-brand-mark" aria-hidden="true">N</span>
          <span>Noa</span>
        </a>
        <p>Visible state, quiet decisions.</p>
      </header>

      <main className="noa-shell">
        <NoaCore
          status={noaStatus}
          cameraStatus={cameraStatus}
          observation={latestObservation}
        />

        <NoaDecisionLog entries={logs} />

        <NoaCamera
          status={cameraStatus}
          onStatusChange={setCameraStatus}
          onEvent={appendLog}
          onObservation={setLatestObservation}
        />

        <footer className="site-footer">
          <span>Noa · Internal State System</span>
          <span>영상과 관찰값은 이 브라우저 안에서만 처리됩니다.</span>
        </footer>
      </main>
    </div>
  );
}
