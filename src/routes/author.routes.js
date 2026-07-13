import { Router } from "express";
import {
  getAuthors,
  createAuthor,
  updateAuthor,
  deleteAuthor,
} from "../controllers/author.controller.js";
import { verifyToken, verifyAdmin } from "../middleware/auth.middleware.js";

const router = Router();

// GET /api/authors - Lấy danh sách tất cả tác giả (public)
router.get("/", getAuthors);

// POST /api/authors - Tạo tác giả mới (admin only)
router.post("/", verifyToken, verifyAdmin, createAuthor);

// PUT /api/authors/:id - Cập nhật tác giả (admin only)
router.put("/:id", verifyToken, verifyAdmin, updateAuthor);

// DELETE /api/authors/:id - Xóa tác giả (admin only)
router.delete("/:id", verifyToken, verifyAdmin, deleteAuthor);

export default router;
