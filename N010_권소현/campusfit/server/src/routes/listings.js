import { Router } from "express";
import { categories, listings } from "../data/seed.js";

const router = Router();

router.get("/categories", (req, res) => {
  res.json(categories);
});

router.get("/", (req, res) => {
  const { categoryId } = req.query;
  const result = categoryId
    ? listings.filter((l) => l.categoryId === categoryId)
    : listings;
  res.json(result);
});

export default router;
