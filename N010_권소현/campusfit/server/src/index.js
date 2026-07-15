import express from "express";
import cors from "cors";
import listingsRouter from "./routes/listings.js";
import boardRouter from "./routes/board.js";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.use("/api/listings", listingsRouter);
app.use("/api/board", boardRouter);

app.listen(PORT, () => {
  console.log(`캠퍼스핏 서버 실행 중 http://localhost:${PORT}`);
});
