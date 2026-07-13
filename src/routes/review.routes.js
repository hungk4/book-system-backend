import { Router } from "express";
import { deleteReview } from "../controllers/review.controller.js";
import { verifyToken, verifyAdmin } from "../middleware/auth.middleware.js";

const router = Router();

// DELETE /api/reviews/:id - Xóa một review (Yêu cầu quyền admin)
router.delete("/:id", verifyToken, verifyAdmin, deleteReview);

export default router;
