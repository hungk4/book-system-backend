import { Router } from "express";
import { createPaymentUrl, vnpayIpn } from "../controllers/payment.controller.js";
import { verifyToken } from '../middleware/auth.middleware.js';

const router = Router();

router.post("/create-payment-url", verifyToken, createPaymentUrl);
router.get("/vnpay-ipn", vnpayIpn); 


export default router;