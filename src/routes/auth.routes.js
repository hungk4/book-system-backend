import { Router } from "express";
import passport from "passport";

import {
  register,
  login,
  socialLoginCallback,
} from "../controllers/auth.controller.js";

const router = Router();

router.post("/register", register);
router.post("/login", login);

// --- API ĐĂNG NHẬP GOOGLE ---
// (http://localhost:5000/api/auth/google) - Chuyển hướng đăng nhập Google
router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"], // Yêu cầu Google trả về profile và email
  })
);

// (http://localhost:5000/api/auth/google/callback) - Goole redirect, trả về kết quả
router.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: `${process.env.CLIENT_URL}/login-failed`, // Nếu thất bại, redirect về FE
    session: false, // Passport mặc định dùng Session/Cookie: User đăng nhập -> Server tạo một "Session ID" -> Lưu thông tin user vào bộ nhớ (RAM hoặc DB) -> Gửi Session ID về trình duyệt dưới dạng Cookie.
  }),
  socialLoginCallback // Hàm controller sẽ tạo JWT
);

// --- API ĐĂNG NHẬP FACEBOOK
// router.get('/facebook', ...);
// router.get('/facebook/callback', ...);

export default router;
