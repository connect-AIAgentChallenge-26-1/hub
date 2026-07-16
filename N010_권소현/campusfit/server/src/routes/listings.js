import { Router } from "express";
import { db } from "../db/client.js";

const router = Router();

function daysUntil(dateStr) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const deadline = new Date(`${dateStr}T00:00:00Z`);
  return Math.round((deadline - today) / 86400000);
}

function toListing(row) {
  const dDay = daysUntil(row.deadline_date);
  return {
    id: row.id,
    categoryId: row.category_id,
    title: row.title,
    desc: row.desc,
    dDay,
    eligibleRegions: row.eligible_regions ? JSON.parse(row.eligible_regions) : undefined,
    eligibleGrades: row.eligible_grades ? JSON.parse(row.eligible_grades) : undefined,
    interest: row.interest || undefined,
    teamBoardCount: row.team_board_count || undefined,
  };
}

router.get("/categories", (req, res) => {
  const categories = db.prepare("SELECT id, label, desc FROM categories").all();
  res.json(categories);
});

router.get("/", (req, res) => {
  const { categoryId } = req.query;
  const rows = categoryId
    ? db.prepare("SELECT * FROM listings WHERE category_id = ?").all(categoryId)
    : db.prepare("SELECT * FROM listings").all();
  res.json(rows.map(toListing));
});

router.get("/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM listings WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });
  res.json(toListing(row));
});

export default router;
