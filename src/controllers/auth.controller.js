import db from "../config/db.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// Hàm đăng ký
export const register = async (req, res) => {
  if (!req.body) {
    return res.status(400).json({
      success: false,
      message: "Dữ liệu gửi lên rỗng hoặc sai định dạng",
    });
  }
  // Lấy dữ liệu từ req.body
  const { email, username, password } = req.body;

  // Kiểm tra dữ liệu
  if (!email || !username || !password) {
    return res.status(400).json({
      success: false,
      message: "Vui lòng điền đầy đủ thông tin",
    });
  }
  // Kiểm tra độ mạnh mật khẩu
  const passwordErrors = [];

  // Kiểm tra độ dài mật khẩu
  if (password.length < 8) {
    passwordErrors.push("Mật khẩu phải có ít nhất 8 ký tự.");
  }

  // Kiểm tra mật khẩu phải có chữ
  if (/[a-z]/i.test(password) === false) {
    passwordErrors.push("Mật khẩu phải có ít nhất một chữ cái.");
  }

  // Kiểm tra mật khẩu phải có số
  if (/\d/.test(password) === false) {
    passwordErrors.push("Mật khẩu phải có ít nhất một chữ số.");
  }

  if (passwordErrors.length > 0) {
    return res.status(400).json({
      success: false,
      message: "Mật khẩu không đủ mạnh.",
      errors: passwordErrors,
    });
  }

  try {
    // 1. Mã hóa mật khẩu
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // 2. Lưu user vào database
    const queryText = `
      INSERT INTO users (email, username, password_hash)
      VALUES ($1, $2, $3)
      RETURNING id, email, username
    `;
    const values = [email, username, passwordHash];

    const result = await db.query(queryText, values);

    // 3. Trả về thông tin user
    res.status(201).json({
      success: true,
      message: "Đăng ký thành công!",
      user: result.rows[0],
    });
  } catch (error) {
    // Xử lý lỗi (ví dụ: email bị trùng)
    if (error.code === "23505") {
      // Mã lỗi 'unique_violation' của PostgreSQL
      return res.status(400).json({
        success: false,
        message: "Email này đã được đăng ký.",
      });
    }
    console.error("Lỗi khi đăng ký:", error.message);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ nội bộ.",
    });
  }
};

// Hàm đăng nhập
export const login = async (req, res) => {
  if (!req.body) {
    return res.status(400).json({
      success: false,
      message: "Dữ liệu gửi lên rỗng hoặc sai định dạng",
    });
  }

  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: "Vui lòng điền đầy đủ thông tin",
    });
  }

  try {
    // 1. Kiểm tra email có tồn tại không
    const queryText = "SELECT * FROM users WHERE email = $1";
    const result = await db.query(queryText, [email]);

    // Nếu không tìm thấy user
    if (result.rows.length === 0) {
      res.status(401).json({
        success: false,
        message: "Email không đúng",
      });
      return;
    }

    const user = result.rows[0];

    // 2. So sánh mật khẩu
    const isMatch = await bcrypt.compare(password, user.password_hash);

    // Nếu mật khẩu không đúng
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Mật khẩu không đúng",
      });
    }

    // 3. Tạo JWT
    const payload = {
      userId: user.id,
      role: user.role,
    };

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error("JWT_SECRET chưa được cài đặt trong file .env");
    }

    const token = jwt.sign(payload, secret, { expiresIn: "1h" }); // token sống 1 giờ

    // 4. Trả về token
    res.json({
      success: true,
      message: "Đăng nhập thành công",
      token,
    });
  } catch (error) {
    console.error("Lỗi khi đăng nhập:", error.message);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ nội bộ.",
    });
  }
};


//  Xử lý Callback từ Social Login
export const socialLoginCallback = async (req, res) => {
  // Nếu code chạy đến được đây, Passport đã xác thực user thành công
  // Passport sẽ tự động gắn user từ DB vào req.user (từ hàm done() trong passport.js)

  if(!req.user){
    return res.status(401).json({
      success: false,
      message: "Xác thực thất bại",
    });
  }

  // req.user bây giờ chính là user từ DB (tìm hoặc tạo/liên kết mới)
  const user = req.user;

  // Tạo JWT
  const payload = {
    userId: user.id,
    role: user.role,
  };

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET chưa được cài đặt trong file .env");
  }

  const token = jwt.sign(payload, secret, { expiresIn: "1h" });


  // TRẢ TOKEN VỀ CHO FRONTEND
  res.redirect(`${process.env.CLIENT_URL}/login-success?token=${token}`);
}
