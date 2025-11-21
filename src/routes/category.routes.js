import { Router } from 'express';
import { getCategories, createCategory } from '../controllers/category.controller.js';

import { verifyToken, verifyAdmin } from '../middleware/auth.middleware.js';

const router = Router();


// GET /api/categories - Lấy danh sách tất cả thể loại
router.get('/', getCategories);

// POST /api/categories - Tạo thể loại mới (admin only)
router.post('/', verifyToken, verifyAdmin, createCategory);

export default router;