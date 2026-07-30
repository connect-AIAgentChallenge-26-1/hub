import { useEffect, useMemo, useRef, useState } from "react";
import { MAX_BACKGROUND_LINES, createBackgroundLine, removeMostRecentLine } from "./lib/backgroundGuides";

const LOCATIONS = [
  {
    id: "daegu-modern-history-museum",
    name: "대구 근대역사관",
    description: "건물 외곽과 지붕선을 기준으로 등록",
    image: "/background-guide-samples/daegu-modern-history-museum.png",
  },
  {
    id: "daegu-sparkland-wheel",
    name: "대구 스파크랜드 관람차",
    description: "관람차 원형과 난간선을 기준으로 등록",
    image: "/background-guide-samples/daegu-sparkland-wheel.png",
  },
  {
    id: "naver-1784-stairs",
    name: "네이버 1784 계단",
    description: "계단 경계와 건물 수직선을 기준으로 등록",
    image: "/background-guide-samples/naver-1784-stairs.png",
  },
];

function downloadJson(fileName, payload) {
  const link = document.createElement("a");
  link.download = fileName;
  link.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 0);
}

function BackgroundCanvas({ location, lines, draftStart, onPoint, onHover }) {
  const canvasRef = useRef(null);
  const imageRef = useRef(null);

  useEffect(() => {
    const image = new Image();
    image.onload = () => {
      imageRef.current = image;
      const canvas = canvasRef.current;
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      context.fillStyle = "rgba(16, 29, 21, .15)";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.strokeStyle = "#ffe94a";
      context.lineCap = "round";
      context.lineWidth = Math.max(4, Math.round(Math.min(canvas.width, canvas.height) * .006));
      lines.forEach((line) => {
        context.beginPath();
        context.moveTo(line.start[0] * canvas.width, line.start[1] * canvas.height);
        context.lineTo(line.end[0] * canvas.width, line.end[1] * canvas.height);
        context.stroke();
      });
      if (draftStart) {
        context.fillStyle = "#ff2da6";
        context.beginPath();
        context.arc(draftStart.x * canvas.width, draftStart.y * canvas.height, 11, 0, Math.PI * 2);
        context.fill();
      }
    };
    image.src = location.image;
  }, [location, lines, draftStart]);

  function pointFromEvent(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
  }

  return <canvas className="background-guide-canvas" ref={canvasRef} onClick={(event) => onPoint(pointFromEvent(event))} onPointerMove={(event) => onHover(pointFromEvent(event))} onPointerLeave={() => onHover(null)} aria-label={`${location.name} 배경선 등록 사진`} />;
}

export default function BackgroundGuideBatchApp() {
  const [activeId, setActiveId] = useState(LOCATIONS[0].id);
  const [lineMap, setLineMap] = useState(() => Object.fromEntries(LOCATIONS.map((location) => [location.id, []])));
  const [draftStart, setDraftStart] = useState(null);
  const [hoverPoint, setHoverPoint] = useState(null);
  const [message, setMessage] = useState("사진 위에서 시작점과 끝점을 차례로 클릭하세요.");
  const location = useMemo(() => LOCATIONS.find((item) => item.id === activeId), [activeId]);
  const lines = lineMap[activeId];

  function switchLocation(nextId) {
    setActiveId(nextId);
    setDraftStart(null);
    setHoverPoint(null);
    setMessage("사진 위에서 시작점과 끝점을 차례로 클릭하세요.");
  }

  function registerPoint(point) {
    if (!draftStart) {
      setDraftStart(point);
      setHoverPoint(point);
      setMessage("시작점을 저장했습니다. 배경선의 끝점을 클릭하세요.");
      return;
    }
    const line = createBackgroundLine(lines, draftStart, point);
    if (!line) {
      setMessage("시작점과 충분히 떨어진 위치를 클릭하세요.");
      return;
    }
    setLineMap((current) => ({ ...current, [activeId]: [...current[activeId], line] }));
    setDraftStart(null);
    setHoverPoint(null);
    setMessage(`${location.name} 배경선 ${lines.length + 1}개를 저장했습니다.`);
  }

  function undo() {
    if (draftStart) {
      setDraftStart(null);
      setHoverPoint(null);
      setMessage("시작점 선택을 취소했습니다.");
      return;
    }
    if (!lines.length) return;
    setLineMap((current) => ({ ...current, [activeId]: removeMostRecentLine(current[activeId]) }));
    setMessage("가장 최근 배경선을 삭제했습니다.");
  }

  function downloadBatch() {
    const sceneId = location.id.replaceAll("-", "_");
    Array.from({ length: 10 }, (_, index) => {
      const id = `background_guide_${sceneId}_${String(index + 1).padStart(2, "0")}`;
      const backgroundGuide = {
        kind: "background_guide",
        version: 5,
        id,
        sceneId: location.id,
        sourceImage: location.image.split("/").pop(),
        horizonY: .62,
        backgroundLines: lines,
      };
      downloadJson(`${id}.json`, backgroundGuide);
    });
    setMessage(`${location.name}: background_guide 10개를 저장했습니다.`);
  }

  return <main className="background-guide-shell">
    <header className="topbar"><div className="brand"><div className="brand-mark">P</div><div><p className="eyebrow">Photo Navigation · Background Guide Batch</p><h1>장소별 배경선 등록</h1></div></div><a className="top-link" href="/">전체 레이아웃 등록으로</a></header>
    <section className="batch-layout">
      <aside className="background-location-list" aria-label="장소 선택">
        <p className="eyebrow">3개 장소 · 장소당 background_guide 10개</p>
        <h2>배경 가이드 선택</h2>
        {LOCATIONS.map((item) => <button className={`background-location ${item.id === activeId ? "active" : ""}`} type="button" key={item.id} onClick={() => switchLocation(item.id)}><strong>{item.name}</strong><span>{lineMap[item.id].length}개 배경선</span></button>)}
      </aside>
      <section className="background-canvas-panel">
        <div className="panel-head"><div><p className="eyebrow">background_guide: {location.id}</p><h2>{location.name}</h2></div><span className="tag">배경선 {lines.length} / {MAX_BACKGROUND_LINES}</span></div>
        <p className="background-description">{location.description}</p>
        <div className="background-canvas-stage"><BackgroundCanvas location={location} lines={lines} draftStart={draftStart} onPoint={registerPoint} onHover={setHoverPoint} /></div>
        <p className="background-message">{message}{hoverPoint && draftStart ? " 끝점을 클릭해 선을 완성하세요." : ""}</p>
      </section>
      <aside className="background-actions">
        <h2>저장 결과</h2>
        <ol><li><strong>background_guide 10개</strong><span>{`background_guide_${location.id.replaceAll("-", "_")}_01 ~ 10`}</span></li></ol>
        <p>이 페이지는 배경선만 저장합니다. pose_guide는 별도의 Overlay 분석 결과로 관리합니다.</p>
        <button className="undo-button" type="button" disabled={!draftStart && !lines.length} onClick={undo}>최근 선 되돌리기</button>
        <button className="action-button" type="button" disabled={!lines.length} onClick={downloadBatch}>이 장소 background_guide 10개 저장</button>
      </aside>
    </section>
  </main>;
}
