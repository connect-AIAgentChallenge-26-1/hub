import React, { useCallback, useEffect, useRef, useState } from "react";
import createGlobe from "cobe";

const defaultMarkers = [
  {
    id: "prediction",
    location: [37.57, 126.98],
    text: "예측 오차",
    color: "#5b5bd6",
    rotate: -5,
  },
  {
    id: "continuity",
    location: [35.68, 139.65],
    text: "연속성",
    color: "#d97355",
    rotate: 4,
  },
  {
    id: "synchrony",
    location: [48.86, 2.35],
    text: "동기화",
    color: "#2f7d6d",
    rotate: -3,
  },
  {
    id: "exploration",
    location: [40.71, -74.01],
    text: "탐색 동력",
    color: "#8b5aa5",
    rotate: 5,
  },
];

export function CobeGlobeLabels({
  markers = defaultMarkers,
  className = "",
  speed = 0.0022,
}) {
  const canvasRef = useRef(null);
  const pointerStartRef = useRef(null);
  const dragRef = useRef({ phi: 0, theta: 0 });
  const rotationRef = useRef({ phi: 0, theta: 0 });
  const pausedRef = useRef(false);
  const [supportsAnchors, setSupportsAnchors] = useState(true);

  const handlePointerDown = useCallback((event) => {
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
    pausedRef.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, []);

  const finishInteraction = useCallback((event) => {
    if (pointerStartRef.current) {
      rotationRef.current.phi += dragRef.current.phi;
      rotationRef.current.theta = Math.max(
        -0.55,
        Math.min(0.55, rotationRef.current.theta + dragRef.current.theta),
      );
    }

    dragRef.current = { phi: 0, theta: 0 };
    pointerStartRef.current = null;
    pausedRef.current = false;
    event?.currentTarget?.releasePointerCapture?.(event.pointerId);
  }, []);

  const handlePointerMove = useCallback((event) => {
    if (!pointerStartRef.current) return;

    dragRef.current = {
      phi: (event.clientX - pointerStartRef.current.x) / 220,
      theta: (event.clientY - pointerStartRef.current.y) / 500,
    };
  }, []);

  useEffect(() => {
    setSupportsAnchors(
      typeof CSS === "undefined" ||
        typeof CSS.supports !== "function" ||
        CSS.supports("position-anchor: --cobe-marker"),
    );
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof WebGLRenderingContext === "undefined") return undefined;

    let globe = null;
    let animationFrame = 0;
    let opacityTimer = 0;
    let resizeObserver = null;
    let phi = 0;
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const initialize = () => {
      const width = canvas.offsetWidth;
      if (!width || globe) return;

      globe = createGlobe(canvas, {
        devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2),
        width: width * Math.min(window.devicePixelRatio || 1, 2),
        height: width * Math.min(window.devicePixelRatio || 1, 2),
        phi: 0,
        theta: 0.2,
        dark: 0,
        diffuse: 1.25,
        mapSamples: 16000,
        mapBrightness: 7,
        baseColor: [0.94, 0.95, 1],
        markerColor: [0.36, 0.36, 0.84],
        glowColor: [0.84, 0.86, 1],
        markerElevation: 0.025,
        markers: markers.map((marker) => ({
          location: marker.location,
          size: 0.04,
          id: marker.id,
        })),
      });

      const animate = () => {
        if (!pausedRef.current && !reducedMotion) phi += speed;

        globe.update({
          phi: phi + rotationRef.current.phi + dragRef.current.phi,
          theta: 0.2 + rotationRef.current.theta + dragRef.current.theta,
        });
        animationFrame = window.requestAnimationFrame(animate);
      };

      animate();
      opacityTimer = window.setTimeout(() => {
        canvas.style.opacity = "1";
      }, 80);
    };

    if (canvas.offsetWidth > 0) {
      initialize();
    } else {
      resizeObserver = new ResizeObserver((entries) => {
        if (entries[0]?.contentRect.width > 0) {
          resizeObserver?.disconnect();
          resizeObserver = null;
          initialize();
        }
      });
      resizeObserver.observe(canvas);
    }

    return () => {
      resizeObserver?.disconnect();
      window.clearTimeout(opacityTimer);
      window.cancelAnimationFrame(animationFrame);
      globe?.destroy();
    };
  }, [markers, speed]);

  return (
    <div className={`cobe-globe ${className}`.trim()}>
      <canvas
        ref={canvasRef}
        className="cobe-globe-canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishInteraction}
        onPointerCancel={finishInteraction}
        aria-hidden="true"
      />

      <div className={supportsAnchors ? "globe-labels" : "globe-labels globe-labels-fallback"}>
        {markers.map((marker) => (
          <span
            className="globe-label"
            key={marker.id}
            style={{
              "--label-color": marker.color,
              "--label-rotation": `${marker.rotate}deg`,
              positionAnchor: supportsAnchors ? `--cobe-${marker.id}` : undefined,
              opacity: supportsAnchors ? `var(--cobe-visible-${marker.id}, 0)` : undefined,
            }}
          >
            {marker.text}
          </span>
        ))}
      </div>
    </div>
  );
}
