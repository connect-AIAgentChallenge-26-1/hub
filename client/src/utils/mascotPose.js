/* 6상태 → 마스코트 포즈 이미지 경로.
   이미지는 client/public/mascot/ (스프라이트 시트를 상태별로 자른 것).
   public 아래라 / 기준 절대경로로 부른다.

   SPIN은 RUNNING과 같은 "단안경 스캔" 포즈를 쓴다 — 세탁·탈수는 같은 "돌아가는 중" 계열이라
   포즈를 따로 두지 않는다 (시트에도 별도 포즈가 없다).
   여기 없는 상태는 null → 화면은 마스코트를 그리지 않는다 (CLAUDE.md 6상태만 존재). */
const POSE = {
  IDLE: "/mascot/mascot-idle.png",
  RUNNING: "/mascot/mascot-running.png",
  SPIN: "/mascot/mascot-running.png",
  DONE: "/mascot/mascot-done.png",
  ABANDONED: "/mascot/mascot-abandoned.png",
  COLLECTED: "/mascot/mascot-collected.png",
};

export function mascotPose(status) {
  return POSE[status] ?? null;
}
