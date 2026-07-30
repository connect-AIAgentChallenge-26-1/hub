import { ArrowLeft, Camera, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { ShotFrame } from "../types/photoSpot";

type Props = {
  frame: ShotFrame;
  onBack: () => void;
  onCapture: (image: string) => void;
  onOrientationChange: (orientation: "portrait" | "landscape") => void;
};

export function CameraCapture({ frame, onBack, onCapture, onOrientationChange }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const storedImageSize = frame.poseGuide?.imageSize;
  const storedGuideAspectRatio = Number(storedImageSize?.width) / Number(storedImageSize?.height);
  const [state, setState] = useState<"loading" | "ready" | "blocked">("loading");
  const [cameraRetry, setCameraRetry] = useState(0);
  const [opacity, setOpacity] = useState(72);
  const [guideAspectRatio, setGuideAspectRatio] = useState(
    Number.isFinite(storedGuideAspectRatio) && storedGuideAspectRatio > 0 ? storedGuideAspectRatio : 3 / 4,
  );
  const [facingMode, setFacingMode] = useState<"environment" | "user">(
    frame.title.includes("셀카") ? "user" : "environment",
  );
  const backgroundLines = frame.backgroundGuide?.backgroundLines ?? [];
  const personFrames = (frame.poseGuide?.personFrames ?? [])
    .map((person) => {
      const values = person as Record<string, unknown>;
      const x = Number(values.x);
      const y = Number(values.y);
      const width = Number(values.width);
      const height = Number(values.height);
      return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(width) && Number.isFinite(height)
        ? [x, y, width, height] as const
        : null;
    })
    .filter((person): person is readonly [number, number, number, number] => person !== null);
  const personOutlineContours = (frame.poseGuide?.personOutlines ?? []).flatMap((outline) => {
    const contours = (outline as { contours?: unknown }).contours;
    if (!Array.isArray(contours)) return [];
    return contours.filter((contour): contour is [number, number][] =>
      Array.isArray(contour) && contour.length > 0 && contour.every((point) =>
        Array.isArray(point) && point.length === 2 && point.every((coordinate) => Number.isFinite(Number(coordinate))),
      ),
    );
  });
  const guideOrientation = guideAspectRatio >= 1 ? "landscape" : "portrait";

  useEffect(() => {
    onOrientationChange(guideOrientation);
  }, [guideOrientation, onOrientationChange]);

  useEffect(() => {
    if (guideOrientation !== "landscape") return undefined;

    // Mobile browsers may reject this outside fullscreen/PWA mode. The layout
    // still switches as soon as the user rotates the device manually.
    const orientation = window.screen?.orientation as (ScreenOrientation & {
      lock?: (value: "landscape") => Promise<void>;
      unlock?: () => void;
    }) | undefined;
    void orientation?.lock?.("landscape").catch(() => undefined);
    return () => orientation?.unlock?.();
  }, [guideOrientation]);

  useEffect(() => {
    let disposed = false;
    if (!frame.referenceImageUrl) return undefined;

    const reference = new Image();
    reference.onload = () => {
      const ratio = reference.naturalWidth / reference.naturalHeight;
      if (!disposed && Number.isFinite(ratio) && ratio > 0) setGuideAspectRatio(ratio);
    };
    reference.src = frame.referenceImageUrl;
    return () => { disposed = true; };
  }, [frame.referenceImageUrl]);

  useEffect(() => {
    let stream: MediaStream | undefined;
    let disposed = false;
    const startCamera = async () => {
      setState("loading");
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facingMode },
            aspectRatio: { ideal: guideAspectRatio },
            width: { ideal: guideAspectRatio >= 1 ? 1920 : 1080 },
            height: { ideal: guideAspectRatio >= 1 ? 1080 : 1920 },
          },
          audio: false,
        });
        if (disposed || !videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setState("ready");
      } catch {
        setState("blocked");
      }
    };
    void startCamera();
    return () => { disposed = true; stream?.getTracks().forEach((track) => track.stop()); };
  }, [facingMode, guideAspectRatio, cameraRetry]);

  const capture = () => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video || state !== "ready" || video.videoWidth === 0 || video.videoHeight === 0) return;
    const sourceWidth = video.videoWidth;
    const sourceHeight = video.videoHeight;
    const sourceAspectRatio = sourceWidth / sourceHeight;
    const cropWidth = sourceAspectRatio > guideAspectRatio ? Math.round(sourceHeight * guideAspectRatio) : sourceWidth;
    const cropHeight = sourceAspectRatio > guideAspectRatio ? sourceHeight : Math.round(sourceWidth / guideAspectRatio);
    const cropX = Math.max(0, Math.round((sourceWidth - cropWidth) / 2));
    const cropY = Math.max(0, Math.round((sourceHeight - cropHeight) / 2));
    const width = cropWidth;
    const height = cropHeight;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return;
    if (facingMode === "user") {
      context.save();
      context.translate(width, 0);
      context.scale(-1, 1);
      context.drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, width, height);
      context.restore();
    } else {
      context.drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, width, height);
    }
    context.globalAlpha = opacity / 100;
    context.strokeStyle = "#39f1aa";
    context.lineWidth = Math.max(4, width / 190);
    context.setLineDash([12, 10]);
    backgroundLines.forEach((line) => {
      context.beginPath();
      context.moveTo(width * line.start[0], height * line.start[1]);
      context.lineTo(width * line.end[0], height * line.end[1]);
      context.stroke();
    });
    context.setLineDash([]);
    context.strokeStyle = "#39f1aa";
    context.lineWidth = Math.max(4, width / 220);
    if (personOutlineContours.length > 0) {
      personOutlineContours.forEach((contour) => {
        const [[firstX, firstY], ...remaining] = contour;
        context.beginPath();
        context.moveTo(width * firstX, height * firstY);
        remaining.forEach(([x, y]) => context.lineTo(width * x, height * y));
        context.closePath();
        context.stroke();
      });
    } else {
      const frames = personFrames.length > 0
        ? personFrames
        : frame.people === "couple" ? [[.29, .39, .18, .37], [.53, .39, .18, .37]] as const : [[.39, .34, .23, .48]] as const;
      frames.forEach(([x, y, w, h]) => context.strokeRect(width * x, height * y, width * w, height * h));
    }
    onCapture(canvas.toDataURL("image/png"));
  };

  return <section className={`camera-screen ${guideOrientation}`}>
    <header className="camera-header"><button type="button" onClick={onBack} aria-label="프레임 선택으로"><ArrowLeft size={24} /></button><div><small>{guideOrientation === "landscape" ? "가로로 들고 촬영" : "세로로 들고 촬영"}</small><strong>{frame.title}</strong></div><span>{state === "ready" ? "LIVE" : "GUIDE"}</span></header>
    <div className="camera-stage">
    <div className={`camera-view ${frame.tone} ${guideOrientation}`} style={{ "--camera-aspect-ratio": String(guideAspectRatio) } as CSSProperties}>
      <video ref={videoRef} className={`camera-video ${facingMode === "user" ? "mirrored" : ""}`} playsInline muted />
      {state !== "ready" && <div className="camera-fallback">{frame.referenceImageUrl && <img src={frame.referenceImageUrl} alt="촬영 기준 예시" />}<div className="camera-fallback-message"><p>{state === "loading" ? "카메라를 준비하고 있어요" : "카메라 권한을 허용하면 실제 화면으로 촬영할 수 있어요"}</p>{state === "blocked" && <button type="button" onClick={() => setCameraRetry((current) => current + 1)}>카메라 다시 연결</button>}</div></div>}
      <div className="composition-overlay" style={{ opacity: opacity / 100 }}>
        {(backgroundLines.length > 0 || personOutlineContours.length > 0 || personFrames.length > 0) && <svg className="composition-guide-svg" viewBox="0 0 1 1" preserveAspectRatio="none" aria-label="촬영 구도 가이드">
          <g className="background-guide-lines">{backgroundLines.map((line) => <line key={line.id} x1={line.start[0]} y1={line.start[1]} x2={line.end[0]} y2={line.end[1]} />)}</g>
          {personOutlineContours.length > 0 ? <g className="person-outline-lines">{personOutlineContours.map((contour, index) => <polygon key={index} points={contour.map(([x, y]) => `${x},${y}`).join(" ")} />)}</g> : <g className="person-frame-lines">{personFrames.map(([x, y, width, height], index) => <rect key={index} x={x} y={y} width={width} height={height} />)}</g>}
        </svg>}
        {personOutlineContours.length === 0 && personFrames.length === 0 && (frame.people === "couple" ? <><div className="person-guide left" /><div className="person-guide right" /></> : <div className="person-guide solo" />)}
      </div>
    </div>
    </div>
    {guideOrientation === "landscape" && <p className="camera-rotate-hint">가로로 돌려 촬영하세요</p>}
    <div className="camera-panel"><p>{state === "ready" ? frame.guide : "카메라 권한을 허용하고 실제 화면이 보이면 촬영할 수 있어요."}</p><label>오버레이 <input type="range" min="0" max="100" value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} /><b>{opacity}%</b></label><div className="shutter-row"><button type="button" onClick={() => setFacingMode((current) => current === "environment" ? "user" : "environment")} aria-label={facingMode === "environment" ? "셀카 카메라로 전환" : "후면 카메라로 전환"}><RotateCcw size={23} /></button><button type="button" className="shutter" onClick={capture} disabled={state !== "ready"} aria-label="사진 촬영"><Camera size={26} /></button><span /></div></div><canvas ref={canvasRef} hidden />
  </section>;
}
