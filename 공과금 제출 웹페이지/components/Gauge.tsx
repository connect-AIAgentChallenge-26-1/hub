"use client";

// 반원 예산 게이지. ratio(0~1+)에 따라 색상 전환: 여유(success)→주의(warning)→초과(danger)
export default function Gauge({
  ratio,
  centerLabel,
  subLabel,
}: {
  ratio: number;
  centerLabel: string;
  subLabel: string;
}) {
  const clamped = Math.max(0, Math.min(ratio, 1));
  // 반원 path 길이 근사값
  const R = 70;
  const cx = 85;
  const cy = 85;
  const startAngle = Math.PI; // 180도
  const angle = startAngle - clamped * Math.PI; // 180 → 0
  const endX = cx + R * Math.cos(angle);
  const endY = cy - R * Math.sin(angle);
  const largeArc = clamped > 0.5 ? 1 : 0;

  const color =
    ratio >= 1
      ? "var(--color-danger)"
      : ratio >= 0.8
      ? "var(--color-warning)"
      : "var(--color-success)";

  return (
    <div className="gauge-wrap">
      <svg className="gauge-svg" width="170" height="96" viewBox="0 0 170 96">
        <path
          d="M15 85 A70 70 0 0 1 155 85"
          fill="none"
          stroke="var(--border)"
          strokeWidth="14"
          strokeLinecap="round"
        />
        {clamped > 0.01 && (
          <path
            d={`M15 85 A70 70 0 ${largeArc} 1 ${endX.toFixed(1)} ${endY.toFixed(1)}`}
            fill="none"
            stroke={color}
            strokeWidth="14"
            strokeLinecap="round"
          />
        )}
      </svg>
      <div style={{ marginTop: -16 }}>
        <div className="gauge-num">{centerLabel}</div>
        <div className="gauge-cap">{subLabel}</div>
      </div>
    </div>
  );
}
