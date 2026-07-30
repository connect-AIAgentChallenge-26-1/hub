import { clamp } from "./guide.js";

export const MAX_BACKGROUND_LINES = 5;

function normalizeCoordinate(value) {
  return Math.round(clamp(value) * 1_000_000) / 1_000_000;
}

export function normalizeCanvasPoint(point) {
  return [normalizeCoordinate(point.x), normalizeCoordinate(point.y)];
}

export function createBackgroundLine(lines, start, end) {
  if (!start || !end || lines.length >= MAX_BACKGROUND_LINES) return null;
  const [startX, startY] = normalizeCanvasPoint(start);
  const [endX, endY] = normalizeCanvasPoint(end);
  const distance = Math.hypot(endX - startX, endY - startY);
  if (distance < 0.006) return null;

  return {
    id: `line-${lines.length + 1}`,
    start: [startX, startY],
    end: [endX, endY],
  };
}

export function removeMostRecentLine(lines) {
  return lines.slice(0, -1);
}
