import "dotenv/config";

import path from "node:path";
import { fileURLToPath } from "node:url";

import cors from "cors";
import express from "express";

import machinesRouter from "./routes/machines.js";
import notificationsRouter from "./routes/notifications.js";
import ingestRouter from "./routes/ingest.js";
import subscriptionsRouter from "./routes/subscriptions.js";
import ownerRouter from "./routes/owner.js";
import { initDb } from "./services/db.js";
import { initPush } from "./services/push.js";

const PORT = process.env.PORT || 3000;

// 서버 시작 시 Supabase 클라이언트를 초기화한다 (T-09).
// 테이블 자체는 server/db/schema.sql을 Supabase SQL Editor에서 미리 실행해둬야 한다.
initDb();

// Web Push VAPID 설정 초기화 (T-12). .env에 VAPID_PUBLIC/VAPID_PRIVATE가 없으면 경고만 남기고
// 발송은 계속 건너뛴다 — 알림 미설정이 서버 기동 자체를 막지 않는다.
initPush();

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "빨래집사" });
});

// 센서 데이터 입구는 POST /ingest/:machineId 하나로 통일한다 (T-08)
// 라우트는 routes/, 상태 머신·방치 대응·알림은 services/ 아래에 둔다
app.use("/ingest", ingestRouter);

// QR 랜딩 알림 신청 저장 (T-12)
app.use("/api/subscriptions", subscriptionsRouter);
// 조회 API (T-13)
app.use("/api/machines", machinesRouter);
app.use("/api/notifications", notificationsRouter);
// 사장님 대시보드 패스코드 잠금 검증
app.use("/api/owner", ownerRouter);

// 배포 시 client 빌드 결과물을 같은 서버에서 정적 서빙한다 (T-25).
// dev에서는 client/dist가 없어 express.static이 그냥 next()로 넘긴다.
const clientDist = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "client", "dist");
app.use(express.static(clientDist));
app.get(/^(?!\/api|\/ingest).*/, (req, res, next) => {
  res.sendFile(path.join(clientDist, "index.html"), (err) => {
    if (err) next();
  });
});

app.listen(PORT, () => {
  console.log(`빨래집사 server → http://localhost:${PORT}`);
});
