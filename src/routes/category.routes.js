import { Router } from 'express';
import { getCategories, createCategory, updateCategory, deleteCategory } from '../controllers/category.controller.js';

import { verifyToken, verifyAdmin } from '../middleware/auth.middleware.js';

const router = Router();


// GET /api/categories - Lấy danh sách tất cả thể loại
router.get('/', getCategories);

// POST /api/categories - Tạo thể loại mới (admin only)
router.post('/', verifyToken, verifyAdmin, createCategory);

// PUT /api/categories/:id - Cập nhật thể loại
router.put("/:id", verifyToken, verifyAdmin, updateCategory);

// DELETE /api/categories/:id - Xóa thể loại
router.delete("/:id", verifyToken, verifyAdmin, deleteCategory);

export default router;