import { Router } from "express";
import { getDocument, saveDocument } from "../utils/documents";

const router = Router();

router.get("/:stepId", async (req, res) => {
  const doc = await getDocument(req.userId!, req.params.stepId);
  if (!doc) {
    return res.status(404).json({ error: "Document not found." });
  }
  res.json(doc);
});

router.put("/:stepId", async (req, res) => {
  const { content, path } = req.body as { content?: string; path?: string };
  if (!content) {
    return res.status(400).json({ error: "content is required." });
  }

  const userId = req.userId!;
  const existing = await getDocument(userId, req.params.stepId);
  const docPath = path ?? existing?.path;
  if (!docPath) {
    return res.status(400).json({ error: "path is required for a new document." });
  }

  const record = await saveDocument(userId, req.params.stepId, docPath, content);
  res.json(record);
});

export default router;
