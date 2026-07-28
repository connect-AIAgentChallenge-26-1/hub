import React, { useCallback, useEffect, useRef, useState } from "react";

const CAMERA_STATUS = Object.freeze({
  idle: "카메라 꺼짐",
  requesting: "권한 확인 중",
  active: "관찰 중",
  denied: "권한 필요",
  unavailable: "지원하지 않음",
  error: "연결 오류"
});

function analyzePixels(imageData, previousPixels) {
  const pixels = imageData.data;
  let luminanceTotal = 0;
  let motionTotal = 0;
  let samples = 0;

  for (let index = 0; index < pixels.length; index += 16) {
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    luminanceTotal += (red + green + blue) / 765;

    if (previousPixels) {
      motionTotal +=
        (Math.abs(red - previousPixels[index]) +
          Math.abs(green - previousPixels[index + 1]) +
          Math.abs(blue - previousPixels[index + 2])) /
        765;
    }

    samples += 1;
  }

  return {
    brightness: samples ? luminanceTotal / samples : 0,
    motion: previousPixels && samples ? motionTotal / samples : 0,
    pixels: new Uint8ClampedArray(pixels)
  };
}

function classifyScene({ brightness, motion }) {
  if (brightness < 0.16) {
    return {
      scene: "low-light",
      title: "주변이 어둡게 보여요.",
      detail: "밝기가 낮아 장면 변화 판단의 확실성을 낮췄습니다."
    };
  }

  if (motion > 0.12) {
    return {
      scene: "movement",
      title: "화면 안의 움직임을 감지했어요.",
      detail: "이전 장면과 차이가 커서 Noa의 탐색 상태를 활성화했습니다."
    };
  }

  return {
    scene: "stable",
    title: "장면이 안정적으로 유지되고 있어요.",
    detail: "큰 변화가 없어 현재 상태를 유지하는 쪽으로 판단했습니다."
  };
}

export default function NoaCamera({
  status = "idle",
  onStatusChange,
  onEvent,
  onObservation
}) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const previousPixelsRef = useRef(null);
  const lastSceneRef = useRef("");
  const analysisCanvasRef = useRef(null);
  const [cameraError, setCameraError] = useState("");

  const updateStatus = useCallback(
    (nextStatus) => {
      onStatusChange?.(nextStatus);
    },
    [onStatusChange]
  );

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    previousPixelsRef.current = null;
    lastSceneRef.current = "";

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const stopCamera = useCallback(() => {
    stopTracks();
    updateStatus("idle");
    setCameraError("");
    onObservation?.(null);
    onEvent?.({
      kind: "decision",
      title: "카메라 관찰을 멈췄습니다.",
      detail: "새로운 시각 정보 없이 기존 상태를 안정적으로 유지합니다."
    });
  }, [onEvent, onObservation, stopTracks, updateStatus]);

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      updateStatus("unavailable");
      setCameraError("이 브라우저에서는 카메라 접근을 지원하지 않습니다.");
      onEvent?.({
        kind: "system",
        title: "카메라를 사용할 수 없습니다.",
        detail: "브라우저 지원 여부를 확인하고 다른 환경에서 다시 시도해 주세요."
      });
      return;
    }

    setCameraError("");
    updateStatus("requesting");
    onEvent?.({
      kind: "system",
      title: "카메라 사용 권한을 확인합니다.",
      detail: "승인되면 영상은 기기 안에서만 분석되며 서버로 전송되지 않습니다."
    });

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 960 },
          height: { ideal: 540 }
        },
        audio: false
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play?.().catch(() => undefined);
      }

      updateStatus("active");
      onEvent?.({
        kind: "observation",
        title: "카메라 관찰을 시작했습니다.",
        detail: "Noa가 밝기와 장면 변화만 확인합니다. 감정이나 신원을 추론하지 않습니다."
      });
    } catch (error) {
      const permissionDenied =
        error?.name === "NotAllowedError" ||
        error?.name === "PermissionDeniedError";

      stopTracks();
      updateStatus(permissionDenied ? "denied" : "error");
      setCameraError(
        permissionDenied
          ? "카메라 권한이 차단되었습니다. 브라우저 설정에서 권한을 허용해 주세요."
          : "카메라를 연결하지 못했습니다. 다른 앱에서 사용 중인지 확인해 주세요."
      );
      onEvent?.({
        kind: "system",
        title: permissionDenied
          ? "카메라 권한이 허용되지 않았습니다."
          : "카메라 연결에 실패했습니다.",
        detail: permissionDenied
          ? "Noa는 카메라 없이 관찰 대기 상태를 유지합니다."
          : "장치 상태를 확인한 뒤 다시 시도할 수 있습니다."
      });
    }
  }, [onEvent, stopTracks, updateStatus]);

  useEffect(() => {
    if (status !== "active") return undefined;

    const intervalId = window.setInterval(() => {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || !video.videoWidth) return;

      if (!analysisCanvasRef.current) {
        analysisCanvasRef.current = document.createElement("canvas");
        analysisCanvasRef.current.width = 64;
        analysisCanvasRef.current.height = 36;
      }

      const canvas = analysisCanvasRef.current;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return;

      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const analysis = analyzePixels(imageData, previousPixelsRef.current);
      previousPixelsRef.current = analysis.pixels;
      const summary = classifyScene(analysis);
      const observation = {
        scene: summary.scene,
        brightness: analysis.brightness,
        motion: analysis.motion,
        observedAt: new Date().toISOString()
      };

      onObservation?.(observation);

      if (lastSceneRef.current !== summary.scene) {
        lastSceneRef.current = summary.scene;
        onEvent?.({
          kind: summary.scene === "movement" ? "state" : "observation",
          title: summary.title,
          detail: summary.detail,
          createdAt: observation.observedAt
        });
      }
    }, 1200);

    return () => window.clearInterval(intervalId);
  }, [onEvent, onObservation, status]);

  useEffect(
    () => () => {
      stopTracks();
    },
    [stopTracks]
  );

  return (
    <section className="noa-camera-card" aria-labelledby="noa-camera-title">
      <div className="section-heading">
        <div>
          <p className="section-kicker">LOCAL CAMERA OBSERVATION</p>
          <h2 id="noa-camera-title">Noa의 시각 관찰</h2>
        </div>
        <span className={`camera-status camera-status-${status}`}>
          <span aria-hidden="true" />
          {CAMERA_STATUS[status] || status}
        </span>
      </div>

      <div className={`camera-stage camera-stage-${status}`}>
        <video
          ref={videoRef}
          className="camera-video"
          autoPlay
          muted
          playsInline
          aria-label="Noa 카메라 미리보기"
        />
        {status !== "active" && (
          <div className="camera-placeholder">
            <span className="camera-icon" aria-hidden="true">
              <svg viewBox="0 0 48 48">
                <path d="M17 15.5 20 11h8l3 4.5h5.5A3.5 3.5 0 0 1 40 19v16.5a3.5 3.5 0 0 1-3.5 3.5h-25A3.5 3.5 0 0 1 8 35.5V19a3.5 3.5 0 0 1 3.5-3.5H17Z" />
                <circle cx="24" cy="27" r="7.5" />
              </svg>
            </span>
            <strong>카메라가 꺼져 있습니다.</strong>
            <p>시작하면 밝기와 장면 변화만 기기 안에서 확인합니다.</p>
          </div>
        )}
        {status === "active" && (
          <>
            <span className="camera-scan-line" aria-hidden="true" />
            <span className="camera-live-label">LIVE · LOCAL ONLY</span>
          </>
        )}
      </div>

      {cameraError && (
        <p className="camera-error" role="alert">
          {cameraError}
        </p>
      )}

      <div className="camera-actions">
        <p>
          영상은 저장하거나 전송하지 않습니다. 얼굴·감정·신원을 분석하지
          않고 화면의 밝기와 움직임 변화만 관찰합니다.
        </p>
        {status === "active" ? (
          <button type="button" className="secondary-button" onClick={stopCamera}>
            카메라 끄기
          </button>
        ) : (
          <button
            type="button"
            className="primary-button"
            onClick={startCamera}
            disabled={status === "requesting"}
          >
            {status === "requesting" ? "연결 중…" : "카메라 시작"}
          </button>
        )}
      </div>
    </section>
  );
}
