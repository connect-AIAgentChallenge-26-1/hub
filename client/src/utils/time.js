/* 화면이 쓰는 시간 계산. 서버는 ISO 문자열만 내려주고, 표시는 전부 여기서 만든다.
   세 화면이 같은 함수를 써야 "방치 32분"이 화면마다 다르게 나오지 않는다. */

/* "18:45" */
export function formatTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/* 예상 시각은 점이 아니라 범위로 — "18:45~18:55" (빨래집사 Domain Rule) */
export function formatRange(fromIso, toIso) {
  if (!fromIso || !toIso) return "";
  return `${formatTime(fromIso)}~${formatTime(toIso)}`;
}

export function minutesSince(iso) {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(iso)) / 60_000));
}

/* "32분" / "1시간 12분" — 경과 시간은 사람이 읽는 단위로 */
export function formatElapsed(iso) {
  const total = minutesSince(iso);
  if (total < 60) return `${total}분`;
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return minutes === 0 ? `${hours}시간` : `${hours}시간 ${minutes}분`;
}

/* 진행률 — 시작 시각부터 예상 종료(늦은 쪽)까지. 예상은 어디까지나 예상이라 99%에서 멈춘다.
   100%로 채워두면 아직 안 끝났는데 끝난 것처럼 보인다. */
export function progressPercent(startedAt, etaTo) {
  if (!startedAt || !etaTo) return 0;
  const start = new Date(startedAt).getTime();
  const end = new Date(etaTo).getTime();
  if (end <= start) return 0;
  const ratio = (Date.now() - start) / (end - start);
  return Math.min(99, Math.max(0, Math.round(ratio * 100)));
}
