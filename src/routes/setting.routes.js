import { Router } from "express";
import { getSettings, updateSetting, getPublicSettings } from "../controllers/setting.controller.js";
import { verifyToken, verifyAdmin } from "../middleware/auth.middleware.js";

const router = Router();

// Lấy cấu hình công khai (Mọi user đăng nhập)
router.get("/public", verifyToken, getPublicSettings);

// Lấy toàn bộ cấu hình (Chỉ dành cho Admin)
router.get("/", verifyToken, verifyAdmin, getSettings);

// Cập nhật cấu hình (Chỉ dành cho Admin)
router.put("/:key", verifyToken, verifyAdmin, updateSetting);

export default router;
