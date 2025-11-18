import jwt from 'jsonwebtoken';


export const verifyToken = (req, res, next) => {
  // 1. Lấy token từ header "Authorization" ( "Bearer <token>" )
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ 
      success: false,
      message: 'Không tìm thấy token xác thực' });
  }

  try {
    // 2. Kiểm tra token hợp lệ
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded; // Lưu thông tin user đã giải mã vào req.user { userId, role, iat, exp }

    next(); 
  } catch (error) {
    return res.status(403).json({ 
      success: false,
      message: 'Token không hợp lệ hoặc đã hết hạn' });
  }

}