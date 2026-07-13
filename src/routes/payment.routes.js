import { Router } from "express";
import { createPaymentUrl, sepayWebhook, getMySubscription, exchangePointsForVip, getCheckinStatus, dailyCheckin, getAdminPayments } from "../controllers/payment.controller.js";
import { verifyToken, verifyAdmin } from '../middleware/auth.middleware.js';

const router = Router();

// POST /api/payments/create-payment-url - Tạo URL thanh toán qua SePay/QR
router.post("/create-payment-url", verifyToken, createPaymentUrl);

// POST /api/payments/sepay-webhook - Webhook để SePay gọi về khi nhận được tiền
router.post("/sepay-webhook", sepayWebhook); 

// POST /api/payments/exchange-points - Đổi điểm lấy ngày Premium
router.post("/exchange-points", verifyToken, exchangePointsForVip);

// GET /api/payments/checkin-status - Lấy trạng thái điểm danh hôm nay
router.get("/checkin-status", verifyToken, getCheckinStatus);

// POST /api/payments/checkin - Thực hiện điểm danh nhận điểm
router.post("/checkin", verifyToken, dailyCheckin);

// GET /api/payments/my-subscription - Lấy gói hội viên hiện tại của User
router.get("/my-subscription", verifyToken, getMySubscription); 

// GET /api/payments/admin - Danh sách giao dịch dành cho Admin
router.get("/admin", verifyToken, verifyAdmin, getAdminPayments);

export default router;