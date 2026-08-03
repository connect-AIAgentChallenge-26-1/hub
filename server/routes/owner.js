import { Router } from "express";

const router = Router();

/* 사장님 대시보드 접근용 패스코드 검증 (배포 링크 공개 접근 차단).
   OWNER_PASSCODE는 서버 전용 값이다 — 프론트 번들에 내려보내면 잠금 의미가 없어지므로
   대조는 여기서만 한다. 클라이언트는 입력값만 보내고 ok/실패만 받는다.

   이건 멀티 매장 로그인이 아니다. 매장 1곳 전제(CLAUDE.md) 그대로, 배포 주소를 아는
   사람이 아무나 대시보드를 보는 걸 막는 단일 패스코드 잠금이다. */
router.post("/verify", (req, res) => {
  const configured = process.env.OWNER_PASSCODE;

  // 패스코드가 설정 안 됐으면 잠금을 걸 수도 확인할 수도 없다. 500으로 뭉개지 말고 분명히 알린다.
  if (!configured) {
    return res.status(503).json({ ok: false, error: "OWNER_PASSCODE 미설정" });
  }

  const { passcode } = req.body ?? {};
  if (typeof passcode === "string" && passcode === configured) {
    return res.json({ ok: true });
  }
  return res.status(401).json({ ok: false });
});

export default router;
