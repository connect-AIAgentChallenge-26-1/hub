import { useEffect, useMemo, useRef, useState } from "react";
import { analyzePhotoLayout, LayoutAnalysisError, withAdjustments } from "./features/vision-overlay";
import { createBackgroundGuide, createPoseGuide } from "./lib/guide";
import { MAX_BACKGROUND_LINES, createBackgroundLine, removeMostRecentLine } from "./lib/backgroundGuides";

const emptyMessage = "사진을 선택한 뒤 AI 레이아웃 생성을 시작하세요.";

function drawOverlay(context, guide, width, height, opacity) {
  const unit = Math.min(width, height);
  const strokeWidth = Math.max(2, Math.round(unit * 0.006));
  context.save();
  context.globalAlpha = opacity / 100;
  context.lineCap = "round";
  context.lineJoin = "round";

  // Keep all place guides behind the person silhouette, including its transparent interior.
  context.save();
  context.beginPath();
  context.rect(0, 0, width, height);
  guide.personOutlines?.forEach((outline) => {
    outline.contours.forEach((contour) => {
      if (contour.length < 3) return;
      context.moveTo(contour[0][0] * width, contour[0][1] * height);
      contour.slice(1).forEach(([x, y]) => context.lineTo(x * width, y * height));
      context.closePath();
    });
  });
  context.clip("evenodd");

  context.strokeStyle = "#ffe94a";
  context.lineWidth = strokeWidth;
  guide.backgroundLines.forEach((line) => {
    context.beginPath();
    context.moveTo(line.start[0] * width, line.start[1] * height);
    context.lineTo(line.end[0] * width, line.end[1] * height);
    context.stroke();
  });
  const horizonY = guide.horizonY * height;
  context.strokeStyle = "#ffffff";
  context.lineWidth = Math.max(1, strokeWidth - 1);
  context.setLineDash([strokeWidth * 4, strokeWidth * 3]);
  context.beginPath();
  context.moveTo(0, horizonY);
  context.lineTo(width, horizonY);
  context.stroke();
  context.setLineDash([]);
  context.restore();

  if (guide.personOutlines?.length) {
    guide.personOutlines.forEach((outline) => {
      context.strokeStyle = "#3dffae";
      context.lineWidth = strokeWidth;
      context.setLineDash([]);
      outline.contours.forEach((contour) => {
        if (contour.length < 3) return;
        context.beginPath();
        context.moveTo(contour[0][0] * width, contour[0][1] * height);
        contour.slice(1).forEach(([x, y]) => context.lineTo(x * width, y * height));
        context.closePath();
        context.stroke();
      });
    });
  }
  context.restore();
}

function drawRegistrationPreview(context, width, height, draftStart, hoverPoint) {
  if (!draftStart) return;
  const startX = draftStart.x * width;
  const startY = draftStart.y * height;
  context.save();
  context.strokeStyle = "#ff2da6";
  context.fillStyle = "#ff2da6";
  context.lineWidth = Math.max(3, Math.round(Math.min(width, height) * 0.006));
  context.shadowColor = "rgba(0, 0, 0, .75)";
  context.shadowBlur = 8;
  context.beginPath();
  context.arc(startX, startY, Math.max(6, Math.round(Math.min(width, height) * 0.013)), 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = "#ffffff";
  context.lineWidth = Math.max(2, Math.round(Math.min(width, height) * 0.003));
  context.stroke();
  if (hoverPoint) {
    context.shadowBlur = 0;
    context.strokeStyle = "#ff2da6";
    context.lineWidth = Math.max(2, Math.round(Math.min(width, height) * 0.004));
    context.setLineDash([10, 8]);
    context.beginPath();
    context.moveTo(startX, startY);
    context.lineTo(hoverPoint.x * width, hoverPoint.y * height);
    context.stroke();
    context.setLineDash([]);
  }
  context.restore();
}

function GuideCanvas({ image, guide, opacity, previewCanvasRef, overlayCanvasRef, lineRegistration, draftStart, hoverPoint, onCanvasPoint, onHoverPoint }) {
  useEffect(() => {
    if (!image || !guide) return;
    const preview = previewCanvasRef.current;
    const overlay = overlayCanvasRef.current;
    preview.width = image.naturalWidth;
    preview.height = image.naturalHeight;
    overlay.width = image.naturalWidth;
    overlay.height = image.naturalHeight;

    const previewContext = preview.getContext("2d");
    const overlayContext = overlay.getContext("2d");
    previewContext.clearRect(0, 0, preview.width, preview.height);
    previewContext.drawImage(image, 0, 0);
    previewContext.fillStyle = "rgba(16, 29, 21, 0.2)";
    previewContext.fillRect(0, 0, preview.width, preview.height);
    drawOverlay(previewContext, guide, preview.width, preview.height, opacity);
    drawRegistrationPreview(previewContext, preview.width, preview.height, draftStart, hoverPoint);

    overlayContext.clearRect(0, 0, overlay.width, overlay.height);
    drawOverlay(overlayContext, guide, overlay.width, overlay.height, opacity);
  }, [guide, image, opacity, overlayCanvasRef, previewCanvasRef, draftStart, hoverPoint]);

  function pointFromEvent(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
  }

  return <canvas className={`guide-canvas ${lineRegistration ? "line-registration-active" : ""}`} ref={previewCanvasRef} aria-label="자동 생성된 레이아웃 가이드" onClick={(event) => lineRegistration && onCanvasPoint(pointFromEvent(event))} onPointerMove={(event) => lineRegistration && onHoverPoint(pointFromEvent(event))} onPointerLeave={() => lineRegistration && onHoverPoint(null)} />;
}

function AnalysisProgress({ phase, progressStep, message }) {
  const steps = ["서버 연결", "YOLO·SAM2", "수평 가이드", "가이드 생성"];
  return (
    <section className={`analysis-progress ${phase === "error" ? "error" : ""}`} aria-live="polite">
      <div className="analysis-progress-head"><strong>{phase === "ready" ? "분석 완료" : phase === "loading" ? "분석 진행 중" : phase === "error" ? "분석 안내" : "가이드 구성"}</strong><span>{phase === "loading" ? `${progressStep}/4` : phase === "ready" ? "4/4" : ""}</span></div>
      <ol className="analysis-steps">
        {steps.map((step, index) => <li className={index + 1 < progressStep || phase === "ready" ? "done" : index + 1 === progressStep && phase === "loading" ? "active" : ""} key={step}>{step}</li>)}
      </ol>
      <p>{message}</p>
    </section>
  );
}

function App() {
  const inputRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const overlayCanvasRef = useRef(null);
  const objectUrlRef = useRef(null);
  const [image, setImage] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [imageUrl, setImageUrl] = useState("");
  const [fileName, setFileName] = useState("photo-overlay");
  const [backgroundGuideId, setBackgroundGuideId] = useState("untitled-scene");
  const [mode, setMode] = useState("couple");
  const [baseGuide, setBaseGuide] = useState(null);
  const [backgroundLines, setBackgroundLines] = useState([]);
  const [lineRegistration, setLineRegistration] = useState(false);
  const [draftStart, setDraftStart] = useState(null);
  const [hoverPoint, setHoverPoint] = useState(null);
  const [horizon, setHorizon] = useState(62);
  const [opacity, setOpacity] = useState(88);
  const [phase, setPhase] = useState("idle");
  const [message, setMessage] = useState(emptyMessage);
  const [progressStep, setProgressStep] = useState(0);

  const guide = useMemo(() => {
    if (!baseGuide) return null;
    return withAdjustments({ ...baseGuide, backgroundLines }, { frameScale: 100, horizonPercent: horizon });
  }, [baseGuide, backgroundLines, horizon]);

  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  function chooseMode(nextMode) {
    setMode(nextMode);
    setLineRegistration(false);
    setDraftStart(null);
    setHoverPoint(null);
    if (baseGuide) {
      setBaseGuide(null);
      setBackgroundLines([]);
      setLineRegistration(false);
      setDraftStart(null);
      setHoverPoint(null);
      setPhase("idle");
      setProgressStep(0);
      setMessage(`${nextMode === "solo" ? "1인" : "커플"} 모드로 변경했습니다. AI 레이아웃을 다시 생성하세요.`);
    }
  }

  function selectImage(file) {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setPhase("error");
      setMessage("JPG, PNG, WebP 사진만 분석할 수 있습니다.");
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setPhase("error");
      setMessage("12MB 이하의 사진을 선택하세요.");
      return;
    }

    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const objectUrl = URL.createObjectURL(file);
    objectUrlRef.current = objectUrl;
    const uploadedImage = new Image();
    uploadedImage.onload = () => {
      setImage(uploadedImage);
      setSelectedFile(file);
      setImageUrl(objectUrl);
      setFileName(file.name.replace(/\.[^/.]+$/, "") || "photo-overlay");
      setBackgroundGuideId((current) => current === "untitled-scene" ? file.name.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase() : current);
      setBaseGuide(null);
      setPhase("idle");
      setProgressStep(0);
      setMessage("사진을 준비했습니다. AI 레이아웃 생성을 시작하세요.");
    };
    uploadedImage.onerror = () => {
      setPhase("error");
      setMessage("사진을 읽지 못했습니다. 다른 파일을 선택하세요.");
    };
    uploadedImage.src = objectUrl;
  }

  async function analyze() {
    if (!image) {
      inputRef.current?.click();
      return;
    }
    try {
      setPhase("loading");
      setProgressStep(1);
      setMessage("로컬 YOLO/SAM2 서버를 준비하고 있습니다.");
      const { guide: nextGuide, warning, timings, engine } = await analyzePhotoLayout({
        file: selectedFile,
        image,
        mode,
        onProgress: (step, nextMessage) => {
          setProgressStep(step);
          setMessage(nextMessage);
        },
      });
      setBaseGuide(nextGuide);
      setHorizon(Math.round(nextGuide.horizonY * 100));
      setPhase("ready");
      setProgressStep(4);
      const seconds = timings?.total ? ` (${(timings.total / 1000).toFixed(1)}초)` : "";
      setMessage(`${engine} 분석 완료${seconds}: ${mode === "solo" ? "인물 1명" : "인물 2명"}의 ${engine === "YOLO + SAM2" ? "정밀 윤곽과 " : "프레임과 "}배경 가이드를 생성했습니다.${warning ? ` ${warning}` : ""}`);
    } catch (error) {
      setBaseGuide(null);
      setPhase("error");
      setProgressStep(0);
      setMessage(error instanceof LayoutAnalysisError ? error.message : `분석을 시작하지 못했습니다. 로컬 API 실행 상태를 확인하세요. (${error.message})`);
    }
  }

  function startLineRegistration() {
    if (!baseGuide) return;
    if (backgroundLines.length >= MAX_BACKGROUND_LINES) {
      setMessage("배경선은 최대 5개까지 등록할 수 있습니다.");
      return;
    }
    setLineRegistration(true);
    setDraftStart(null);
    setHoverPoint(null);
    setMessage("배경선의 시작점을 선택하세요.");
  }

  function registerCanvasPoint(point) {
    if (!draftStart) {
      setDraftStart(point);
      setHoverPoint(point);
      setMessage("시작점을 등록했습니다. 끝점을 선택하세요.");
      return;
    }
    const line = createBackgroundLine(backgroundLines, draftStart, point);
    if (!line) {
      setMessage("시작점과 충분히 떨어진 위치를 끝점으로 선택하세요.");
      return;
    }
    const nextLines = [...backgroundLines, line];
    setBackgroundLines(nextLines);
    setDraftStart(null);
    setHoverPoint(null);
    if (nextLines.length >= MAX_BACKGROUND_LINES) {
      setLineRegistration(false);
      setMessage("배경선 5개를 등록했습니다.");
    } else {
      setMessage(`배경선 ${nextLines.length}개를 등록했습니다. 다음 시작점을 선택하세요.`);
    }
  }

  function undoBackgroundLine() {
    if (draftStart) {
      setDraftStart(null);
      setHoverPoint(null);
      setMessage("시작점 선택을 취소했습니다. 시작점을 다시 선택하세요.");
      return;
    }
    if (!backgroundLines.length) return;
    const nextLines = removeMostRecentLine(backgroundLines);
    setBackgroundLines(nextLines);
    setLineRegistration(true);
    setMessage("가장 최근 배경선을 삭제했습니다. 시작점을 선택하세요.");
  }

  function downloadOverlay() {
    const canvas = overlayCanvasRef.current;
    if (!canvas || !guide) return;
    const link = document.createElement("a");
    link.download = `${fileName}-overlay.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  function downloadBackgroundGuide() {
    if (!guide) return;
    const payload = createBackgroundGuide({
      id: backgroundGuideId,
      horizonY: guide.horizonY,
      backgroundLines: guide.backgroundLines,
      sourceImage: selectedFile?.name ?? null,
    });
    const link = document.createElement("a");
    link.download = `${payload.id}.background-guide.json`;
    link.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 0);
  }

  function downloadPoseGuide() {
    if (!guide) return;
    const payload = createPoseGuide({
      id: fileName,
      backgroundGuideId,
      personFrames: guide.personFrames,
      personOutlines: guide.personOutlines,
      personPoses: guide.personPoses,
      analysisMeta: guide.analysisMeta,
    });
    const link = document.createElement("a");
    link.download = `${payload.id}.pose-guide.json`;
    link.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 0);
  }

  const canDownload = phase === "ready" && Boolean(guide);
  const sourceMeta = image ? `${image.naturalWidth} × ${image.naturalHeight}` : "사진을 선택하세요";

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">P</div>
          <div>
            <p className="eyebrow">Photo Navigation · Local Vision Overlay Studio</p>
            <h1>사진 레이아웃 Agent</h1>
          </div>
        </div>
        <div className="header-actions"><p className="status"><strong>로컬 YOLO + SAM2</strong> · 사진은 외부 Vision API로 전송되지 않습니다.</p><a className="top-link" href={`${import.meta.env.BASE_URL}compare/`}>촬영 구도 비교</a></div>
      </header>

      <section className="workspace" aria-label="사진 레이아웃 작업 공간">
        <article className="panel">
          <div className="panel-head"><h2 className="panel-title">Before · 원본 사진</h2><span className="panel-kicker">{sourceMeta}</span></div>
          <div className="image-stage">
            {imageUrl ? <img className="preview-image" src={imageUrl} alt="업로드한 원본 사진" /> : <EmptyStage title="사진을 업로드하세요" text="JPG, PNG, WebP 사진을 넣으면 원본과 AI 가이드 결과를 나란히 확인할 수 있습니다." icon="▧" />}
          </div>
        </article>

        <aside className="panel controls-panel" aria-label="레이아웃 설정">
          <div className="panel-head"><h2 className="panel-title">레이아웃 설정</h2><span className="tag">{mode === "solo" ? "1인" : "커플"}</span></div>
          <div className="controls">
            <label className="file-button">사진 선택<input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => selectImage(event.target.files?.[0])} /></label>
            <label className="scene-id-input">배경 가이드 ID<input value={backgroundGuideId} onChange={(event) => setBackgroundGuideId(event.target.value)} placeholder="daegu-museum" /></label>
            <ControlLabel title="프레임 구성" detail="인물 수" />
            <div className="segmented" role="group" aria-label="인물 프레임 선택">
              <button className={`segment ${mode === "solo" ? "active" : ""}`} onClick={() => chooseMode("solo")} type="button">1인</button>
              <button className={`segment ${mode === "couple" ? "active" : ""}`} onClick={() => chooseMode("couple")} type="button">커플</button>
            </div>
            <RangeControl title="수평 가이드" displayValue={`${horizon}%`} min="35" max="78" inputValue={horizon} onChange={setHorizon} disabled={!baseGuide} />
            <RangeControl title="Overlay 투명도" displayValue={`${opacity}%`} min="0" max="100" inputValue={opacity} onChange={setOpacity} disabled={!baseGuide} />
            <div className="workflow"><div><b>1</b>사진 선택</div><i>→</i><div><b>2</b>AI 분석</div><i>→</i><div><b>3</b>Overlay</div></div>
            <button className="action-button" onClick={analyze} type="button" disabled={phase === "loading"}>{phase === "loading" ? "AI 분석 중..." : baseGuide ? "AI 레이아웃 재분석" : "AI 레이아웃 생성"}</button>
            <div className="line-registration-controls"><div className="control-label">배경선 등록<span>{backgroundLines.length} / {MAX_BACKGROUND_LINES}</span></div><div className="line-registration-actions"><button className="line-button" type="button" disabled={!baseGuide || backgroundLines.length >= MAX_BACKGROUND_LINES} onClick={startLineRegistration}>{lineRegistration ? "선 등록 중" : "선 등록"}</button><button className="undo-button" type="button" disabled={!draftStart && !backgroundLines.length} onClick={undoBackgroundLine}>되돌리기</button></div><p>건물 지붕·무대 외곽처럼 고정된 구조를 최대 5개까지 등록하세요.</p></div>
            <button className="download-button" onClick={downloadOverlay} type="button" disabled={!canDownload}>Overlay PNG 다운로드</button>
            <button className="json-button" onClick={downloadBackgroundGuide} type="button" disabled={!canDownload}>background_guide 다운로드</button>
            <button className="json-button" onClick={downloadPoseGuide} type="button" disabled={!canDownload}>pose_guide 다운로드</button>
            <AnalysisProgress phase={phase} progressStep={progressStep} message={message} />
          </div>
        </aside>

        <article className="panel after">
          <div className="panel-head"><h2 className="panel-title">After · AI 레이아웃 가이드</h2><span className="panel-kicker">{guide ? `${mode === "solo" ? "1인" : "커플"} · ${image.naturalWidth} × ${image.naturalHeight}` : "생성 전"}</span></div>
          <div className="image-stage">
            {image && guide ? <GuideCanvas image={image} guide={guide} opacity={opacity} previewCanvasRef={previewCanvasRef} overlayCanvasRef={overlayCanvasRef} lineRegistration={lineRegistration} draftStart={draftStart} hoverPoint={hoverPoint} onCanvasPoint={registerCanvasPoint} onHoverPoint={setHoverPoint} /> : <EmptyStage title="촬영 가이드를 준비합니다" text="사진을 선택한 뒤 AI 레이아웃을 생성하면 인물 윤곽과 수평 가이드가 표시됩니다." icon="✦" />}
          </div>
          <div className="result-note"><strong>PNG 결과물</strong>은 원본 사진 위에 보이는 안내선만 포함하는 투명 이미지입니다.</div>
        </article>
      </section>
      <canvas className="hidden-canvas" ref={overlayCanvasRef} />
    </main>
  );
}

function EmptyStage({ title, text, icon }) {
  return <div className="empty"><div className="empty-icon">{icon}</div><h2>{title}</h2><p>{text}</p></div>;
}

function ControlLabel({ title, detail }) {
  return <div className="control-label">{title}<span>{detail}</span></div>;
}

function RangeControl({ title, displayValue, min, max, inputValue, onChange, disabled }) {
  return <div className="control-group"><ControlLabel title={title} detail={displayValue} /><input type="range" min={min} max={max} value={inputValue} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} /></div>;
}

export default App;
