import jwt from "jsonwebtoken";
import db from "../config/db.js";

// Middleware kiểm tra user (bắt buộc)
export const verifyToken = async (req, res, next) => {
  // 1. Lấy token từ header "Authorization" ( "Bearer <token>" )
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Không tìm thấy token xác thực",
    });
  }

  try {
    // 2. Kiểm tra token hợp lệ
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 3. Kiểm tra user trong DB xem có bị khóa không
    const userRes = await db.query("SELECT status FROM users WHERE id = $1", [decoded.userId]);
    if (userRes.rows.length === 0 || userRes.rows[0].status === 'banned') {
      return res.status(403).json({
        success: false,
        message: "Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên.",
      });
    }

    req.user = decoded; // Lưu thông tin user đã giải mã vào req.user { userId, role, iat, exp }

    next();
  } catch (error) {
    return res.status(403).json({
      success: false,
      message: "Token không hợp lệ hoặc đã hết hạn",
    });
  }
};

// Middleware kiểm tra vai trò admin
export const verifyAdmin = (req, res, next) => {
  if (req.user && req.user.role === "admin") {
    next();
  } else {
    res.status(403).json({
      success: false,
      message: "Yêu cầu quyền admin để thực hiện hành động này",
    });
  }
};

// Middleware yêu cầu request phải đi qua Gateway .NET
export const requireGateway = (req, res, next) => {
  const secretHeader = req.headers['x-internal-secret'];
  if (!secretHeader || secretHeader !== process.env.GATEWAY_SECRET) {
    return res.status(403).json({ 
      success: false, 
      message: "Forbidden: Yêu cầu truy cập phải đi qua cổng API Gateway!" 
    });
  }
  next();
};


