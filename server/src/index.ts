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
import { isDemoMode } from "./utils/demoMode";

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
const CLIENT_URL = process.env.CLIENT_URL ?? "http://localhost:5173";

app.use(cors({ origin: CLIENT_URL }));
app.use(express.json());
app.use(cookieParser(process.env.SESSION_SECRET));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", demoMode: isDemoMode() });
});

app.use("/api/auth", authRouter);
app.use("/api/repo", repoRouter);
app.use("/api/analysis", analysisRouter);
app.use("/api/steps", stepsRouter);
app.use("/api/chat", chatRouter);
app.use("/api/documents", documentsRouter);
app.use("/api/dev", devRouter);

app.listen(PORT, () => {
  console.log(`GameForge Agent API server listening on http://localhost:${PORT}`);
});
