import { Router } from "express";
import { postPriority } from "../controllers/priorityController.js";

const router = Router();

router.post("/priority", postPriority);

export default router;
