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

    // Kiểm tra tài khoản bị khóa
    if (user.status === 'banned') {
      return res.status(403).json({
        success: false,
        message: "Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên.",
      });
    }

    if (!user.password_hash) {
      return res.status(400).json({
        success: false,
        message:
          "Tài khoản này được đăng ký qua Google. Vui lòng sử dụng chức năng 'Đăng nhập với Google",
      });
    }

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

    const accessToken = jwt.sign(payload, secret, { expiresIn: "1h" });

    const refreshToken = jwt.sign(payload, secret, { expiresIn: "7d" });


    // Gửi Refresh Token vào Cookie (HttpOnly để bảo mật)
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Lax", // Hoặc 'Strict' tùy cấu hình CORS
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    const userData = JSON.stringify({
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
    });

    // 4. Trả về token
    res.json({
      success: true,
      message: "Đăng nhập thành công",
      token: accessToken,
      user: userData,
    });
  } catch (error) {
    console.error("Lỗi khi đăng nhập:", error.message);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ nội bộ.",
    });
  }
};

export const socialLoginCallback = async (req, res) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Xác thực thất bại",
    });
  }

  const user = req.user;
  
  if (user.status === 'banned') {
    return res.redirect(`${process.env.CLIENT_URL}/login?error=banned`);
  }

  const secret = process.env.JWT_SECRET;
  const payload = {
    userId: user.id,
    role: user.role,
  };

  try {
    // 1. Tạo cặp Token
    const accessToken = jwt.sign(payload, secret, { expiresIn: "1h" });
    const refreshToken = jwt.sign(payload, secret, { expiresIn: "7d" });

    // 2. Gửi Refresh Token vào Cookie
    // Lưu ý: Trình duyệt sẽ tự động lưu cookie này khi nhận lệnh redirect
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 ngày
    });

    const userData = JSON.stringify({
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
    });

    // 3. Redirect về Frontend kèm theo Access Token (token 1h)
    // Sau khi về tới trang Login ở FE, bạn cần lấy token này lưu vào localStorage
    res.redirect(
      `${process.env.CLIENT_URL}/login?token=${accessToken}&user=${userData}`,
    );
  } catch (error) {
    console.error("Lỗi trong socialLoginCallback:", error);
    res.redirect(`${process.env.CLIENT_URL}/login?error=auth_failed`);
  }
};

export const refreshToken = async (req, res) => {
  const token = req.cookies.refreshToken;

  if (!token) return res.status(401).json({ success: false });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const newAccessToken = jwt.sign(
      { userId: decoded.userId, role: decoded.role },
      process.env.JWT_SECRET,
      { expiresIn: "1h" },
    );

    res.json({ success: true, accessToken: newAccessToken });
  } catch (error) {
    res.status(403).json({ success: false, message: "Phiên làm việc hết hạn" });
  }
};

export const logout = async (req, res) => {
  // Xóa Cookie ở trình duyệt
  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Lax",
  });

  res.json({ success: true, message: "Đã đăng xuất" });
};

// GET /api/auth/profile
export const getProfile = async (req, res) => {
  const userId = req.user.userId;
  try {
    const userQuery = `
      SELECT u.id, u.username, u.email, u.google_id, u.role, u.points, u.streak_count, u.created_at, u.last_checkin_date, u.status,
      (u.password_hash IS NOT NULL) as has_password,
      (SELECT expiry_date FROM subscriptions WHERE user_id = u.id AND status = 'active' AND expiry_date > NOW() ORDER BY expiry_date DESC LIMIT 1) as premium_expiry
      FROM users u WHERE u.id = $1
    `;
    const result = await db.query(userQuery, [userId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Không tìm thấy người dùng" });
    }
    const user = result.rows[0];
    res.json({ success: true, user });
  } catch (error) {
    console.error("Lỗi khi lấy profile:", error);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

// PUT /api/auth/profile
export const updateProfile = async (req, res) => {
  const userId = req.user.userId;
  const { username, currentPassword, newPassword } = req.body;

  try {
    const userRes = await db.query("SELECT * FROM users WHERE id = $1", [userId]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Không tìm thấy người dùng" });
    }
    const user = userRes.rows[0];

    let updatedUsername = user.username;
    if (username && username.trim() !== "") {
      updatedUsername = username.trim();
    }

    let passwordHash = user.password_hash;
    
    if (newPassword) {
      if (user.password_hash) {
        if (!currentPassword) {
          return res.status(400).json({ success: false, message: "Vui lòng nhập mật khẩu hiện tại" });
        }
        const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
        if (!isMatch) {
          return res.status(400).json({ success: false, message: "Mật khẩu hiện tại không đúng" });
        }
      }

      const passwordErrors = [];
      if (newPassword.length < 8) {
        passwordErrors.push("Mật khẩu mới phải có ít nhất 8 ký tự.");
      }
      if (/[a-z]/i.test(newPassword) === false) {
        passwordErrors.push("Mật khẩu mới phải có ít nhất một chữ cái.");
      }
      if (/\d/.test(newPassword) === false) {
        passwordErrors.push("Mật khẩu mới phải có ít nhất một chữ số.");
      }
      if (passwordErrors.length > 0) {
        return res.status(400).json({ success: false, message: passwordErrors.join(" ") });
      }

      const salt = await bcrypt.genSalt(10);
      passwordHash = await bcrypt.hash(newPassword, salt);
    }

    const updateQuery = `
      UPDATE users 
      SET username = $1, password_hash = $2
      WHERE id = $3
      RETURNING id, username, email, role, points, streak_count
    `;
    const updateResult = await db.query(updateQuery, [updatedUsername, passwordHash, userId]);

    res.json({
      success: true,
      message: "Cập nhật tài khoản thành công",
      user: updateResult.rows[0]
    });
  } catch (error) {
    console.error("Lỗi khi cập nhật profile:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ khi cập nhật tài khoản" });
  }
};

