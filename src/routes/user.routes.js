import { Router } from "express";
import { getAllUsers, toggleUserStatus, getUserDetails, updateUserPoints, grantPremium } from "../controllers/user.controller.js";
import { verifyToken, verifyAdmin } from "../middleware/auth.middleware.js";

const router = Router();

// Protect all routes with auth and admin checks
router.use(verifyToken, verifyAdmin);

// GET /api/users - Lấy danh sách tất cả người dùng (Admin)
router.get("/", getAllUsers);

// GET /api/users/:id/details - Lấy chi tiết hồ sơ người dùng (Admin)
router.get("/:id/details", getUserDetails);

// PUT /api/users/:id/status - Khóa/Mở khóa tài khoản (Admin)
router.put("/:id/status", toggleUserStatus);

// PUT /api/users/:id/points - Cộng/Trừ điểm thủ công (Admin)
router.put("/:id/points", updateUserPoints);

// PUT /api/users/:id/premium - Tặng gói Premium thủ công (Admin)
router.put("/:id/premium", grantPremium);

export default router;
