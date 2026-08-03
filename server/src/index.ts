import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import authRouter from "./routes/auth";
import repoRouter from "./routes/repo";
import analysisRouter from "./routes/analysis";
import stepsRouter from "./routes/steps";
import chatRouter from "./routes/chat";
import documentsRouter from "./routes/documents";
import devRouter from "./routes/dev";
import expansionsRouter from "./routes/expansions";
import { isDemoMode } from "./utils/demoMode";
import { isNewProjectWorkflowEnabled } from "./utils/featureFlags";
import { resolveSession, requireAuth } from "./middleware/auth";

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
const CLIENT_URL = process.env.CLIENT_URL ?? "http://localhost:5173";

app.use(cors({ origin: CLIENT_URL, credentials: true }));
app.use(express.json());
app.use(cookieParser(process.env.SESSION_SECRET));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", demoMode: isDemoMode(), enableNewProjectWorkflow: isNewProjectWorkflowEnabled() });
});

// resolveSession is mounted globally (including under /api/auth) so it can
// populate req.userId/req.authSession for GET /api/auth/session's own soft
// "am I logged in?" check — it never blocks. requireAuth is what actually
// enforces login, applied per-router below to everything except /api/auth
// itself (login/callback issue the session; session/logout only need the
// soft check resolveSession already gives them).
app.use(resolveSession);

app.use("/api/auth", authRouter);
app.use("/api/repo", requireAuth, repoRouter);
app.use("/api/analysis", requireAuth, analysisRouter);
app.use("/api/steps", requireAuth, stepsRouter);
app.use("/api/chat", requireAuth, chatRouter);
app.use("/api/documents", requireAuth, documentsRouter);
app.use("/api/dev", requireAuth, devRouter);
app.use("/api/expansions", requireAuth, expansionsRouter);

app.listen(PORT, () => {
  console.log(`GameForge Agent API server listening on http://localhost:${PORT}`);
});
