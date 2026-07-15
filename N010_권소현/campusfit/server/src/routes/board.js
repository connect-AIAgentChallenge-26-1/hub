import { Router } from "express";
import { boardPosts } from "../data/seed.js";

const router = Router();

router.get("/", (req, res) => {
  const { listingId } = req.query;
  const result = listingId
    ? boardPosts.filter((p) => p.listingId === listingId)
    : boardPosts;
  res.json(result);
});

router.get("/:id", (req, res) => {
  const post = boardPosts.find((p) => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: "not found" });
  res.json(post);
});

router.post("/:id/comments", (req, res) => {
  const post = boardPosts.find((p) => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: "not found" });
  const { who, text } = req.body;
  if (!text) return res.status(400).json({ error: "text is required" });
  const comment = { who: who || "익명", text };
  post.comments.push(comment);
  res.status(201).json(comment);
});

export default router;
