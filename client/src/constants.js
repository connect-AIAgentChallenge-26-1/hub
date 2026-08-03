/* 화면이 공유하는 도메인 상수. 값의 정의는 CLAUDE.md가 원본이다.
   숫자 상수(방치 시간·전력 임계값 등)는 서버가 판단에 쓰는 값이라 여기 두지 않는다 —
   화면은 서버가 내려준 상태·시각만 표시한다. */

/* 알림 5종 — CLAUDE.md Notification Rule.
   서버가 notification.type으로 내려주는 값과 문자열이 같아야 한다. */
export const NOTIFICATION_TYPE = {
  DEPARTURE: "DEPARTURE", // 출발 (종료 임박)
  COMPLETED: "COMPLETED", // 완료
  COLLECT_1: "COLLECT_1", // 1차 수거
  COLLECT_2: "COLLECT_2", // 2차 수거
  OWNER_ALERT: "OWNER_ALERT", // 사장님 알림
};
