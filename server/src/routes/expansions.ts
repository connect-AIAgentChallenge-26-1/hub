import { Router } from "express";
import { createExpansion } from "../utils/expansions";

const router = Router();

interface CreateExpansionRequest {
  description?: string;
}

router.post("/", async (req, res) => {
  const { description } = req.body as CreateExpansionRequest;
  if (!description || !description.trim()) {
    return res.status(400).json({ error: "description is required." });
  }

  const { expansionId, request } = await createExpansion(req.userId!, description.trim());
  res.status(201).json({ expansionId, ...request });
});

export default router;
