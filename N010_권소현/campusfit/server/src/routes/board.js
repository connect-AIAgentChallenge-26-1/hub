import { Router } from "express";
import { db } from "../db/client.js";

const router = Router();

function daysUntil(dateStr) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const deadline = new Date(`${dateStr}T00:00:00Z`);
  return Math.round((deadline - today) / 86400000);
}

function toPost(row) {
  const listing = db.prepare("SELECT deadline_date FROM listings WHERE id = ?").get(row.listing_id);
  const dDay = listing ? daysUntil(listing.deadline_date) : undefined;
  const comments = db
    .prepare("SELECT who, text FROM comments WHERE post_id = ? ORDER BY id")
    .all(row.id);
  return {
    id: row.id,
    listingId: row.listing_id,
    title: row.title,
    meta: row.meta,
    dDay,
    body: row.body,
    comments,
  };
}

router.get("/", (req, res) => {
  const { listingId } = req.query;
  const rows = listingId
    ? db.prepare("SELECT * FROM board_posts WHERE listing_id = ?").all(listingId)
    : db.prepare("SELECT * FROM board_posts").all();
  res.json(rows.map(toPost));
});

router.get("/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM board_posts WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });
  res.json(toPost(row));
});

router.post("/", (req, res) => {
  const { listingId, title, meta, body } = req.body;
  if (!listingId || !title || !meta || !body) {
    return res.status(400).json({ error: "listingId, title, meta, body는 필수입니다" });
  }
  const listing = db.prepare("SELECT id FROM listings WHERE id = ?").get(listingId);
  if (!listing) return res.status(400).json({ error: "존재하지 않는 listingId입니다" });

  const id = `p-${Date.now()}`;
  db.prepare(
    "INSERT INTO board_posts (id, listing_id, title, meta, body) VALUES (?, ?, ?, ?, ?)"
  ).run(id, listingId, title, meta, body);

  const row = db.prepare("SELECT * FROM board_posts WHERE id = ?").get(id);
  res.status(201).json(toPost(row));
});

router.post("/:id/comments", (req, res) => {
  const post = db.prepare("SELECT id FROM board_posts WHERE id = ?").get(req.params.id);
  if (!post) return res.status(404).json({ error: "not found" });
  const { who, text } = req.body;
  if (!text) return res.status(400).json({ error: "text is required" });

  const comment = { who: who || "익명", text };
  db.prepare("INSERT INTO comments (post_id, who, text) VALUES (?, ?, ?)").run(
    req.params.id,
    comment.who,
    comment.text
  );
  res.status(201).json(comment);
});

export default router;
