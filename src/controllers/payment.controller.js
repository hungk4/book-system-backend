import db from "../config/db.js";

// POST /create-payment-url
export const createPaymentUrl = async (req, res) => {
  const userId = req.user.userId;
  const months = Number(req.body.months);

  try {
    // 1. Lấy cấu hình gói VIP từ DB
    const configQuery = await db.query(
      "SELECT value FROM system_settings WHERE key = 'premium_packages'"
    );
    const premiumPackages = configQuery.rows[0]?.value || [];
    
    // Tìm gói tương ứng có số tháng trùng khớp
    const pkg = premiumPackages.find(p => Number(p.duration_months) === months);
    if (!pkg) {
      return res.status(400).json({ message: "Gói đăng ký không hợp lệ" });
    }

    const amount = pkg.price;
    const bankAccount = process.env.SEPAY_BANK_ACCOUNT || "0123456789";
    const bankName = process.env.SEPAY_BANK_NAME || "MBBank";

    // Cấu trúc nội dung chuyển khoản bắt buộc: BOOKVIP [userId] [months] (VD: BOOKVIP 1 6)
    const transferContent = `BOOKVIP ${userId} ${months}`;

    // Link tạo QR code tự động của SePay VietQR
    const qrUrl = `https://qr.sepay.vn/img?acc=${bankAccount}&bank=${bankName}&amount=${amount}&des=${transferContent}`;

    res.status(200).json({ paymentUrl: qrUrl, transferContent, amount });
  } catch (error) {
    console.error("Lỗi tạo QR thanh toán:", error);
    res.status(500).json({ message: "Lỗi server khi tạo QR thanh toán" });
  }
};

// POST /sepay-webhook
export const sepayWebhook = async (req, res) => {
  console.log("SePay Webhook received:", req.body);

  const { transferAmount, content, transferType, referenceCode } = req.body;

  // 1. Chỉ bắt giao dịch cộng tiền (nhận tiền vào)
  if (transferType !== "in") {
    return res.json({ success: true, message: "Ignored outgoing transfer" });
  }

  // 2. Tìm cú pháp nạp tiền trong nội dung ck. Regex bắt chữ BOOKVIP theo sau là 2 số
  const match = content.match(/BOOKVIP\s+(\d+)\s+(\d+)/i);

  if (match) {
    const userId = parseInt(match[1]);
    const months = parseInt(match[2]);

    try {
      // 3. Chống lặp giao dịch (Idempotency) dựa trên mã GD của ngân hàng
      const checkPayment = await db.query(
        "SELECT id FROM payments WHERE payment_id = $1", [referenceCode]
      );
      if (checkPayment.rows.length > 0) {
        return res.json({ success: true, message: "Đã xử lý trước đó" });
      }

      // 3.5. Kiểm tra số tiền chuyển khoản thực tế với giá gói trong cấu hình DB
      const configQuery = await db.query(
        "SELECT value FROM system_settings WHERE key = 'premium_packages'"
      );
      const premiumPackages = configQuery.rows[0]?.value || [];
      const pkg = premiumPackages.find(p => Number(p.duration_months) === months);

      if (!pkg) {
        console.warn(`Webhook SePay: Không tìm thấy gói VIP ${months} tháng trong cấu hình.`);
        return res.json({ success: true, message: "Gói đăng ký không tồn tại" });
      }

      const expectedAmount = Number(pkg.price);
      const actualAmount = Number(transferAmount);

      if (actualAmount < expectedAmount) {
        console.warn(`Webhook SePay: Số tiền không đủ cho gói ${months} tháng. Giao dịch: ${referenceCode}, Thực nhận: ${actualAmount}, Yêu cầu: ${expectedAmount}`);
        return res.json({ success: true, message: "Số tiền chuyển khoản không đủ để nâng cấp gói" });
      }

      await db.query("BEGIN");

      // 4. Tìm gói cũ để nối ngày hoặc lấy ngày hôm nay
      const lastSub = await db.query(
        "SELECT expiry_date FROM subscriptions WHERE user_id = $1 AND status = 'active' ORDER BY expiry_date DESC LIMIT 1",
        [userId]
      );

      let startDate = new Date();
      if (lastSub.rows.length > 0 && new Date(lastSub.rows[0].expiry_date) > startDate) {
        startDate = new Date(lastSub.rows[0].expiry_date);
      }

      const expiryDate = new Date(startDate);
      expiryDate.setMonth(expiryDate.getMonth() + months);

      // 5. Thêm gói VIP
      const subResult = await db.query(
        "INSERT INTO subscriptions (user_id, start_date, expiry_date, status) VALUES ($1, $2, $3, 'active') RETURNING id",
        [userId, startDate, expiryDate]
      );

      // 6. Lưu lịch sử
      await db.query(
        "INSERT INTO payments (payment_id, user_id, subscription_id, amount, status) VALUES ($1, $2, $3, $4, 'succeeded')",
        [referenceCode, userId, subResult.rows[0].id, transferAmount]
      );

      await db.query("COMMIT");

      return res.json({ success: true, message: "Cấp VIP thành công!" });
    } catch (err) {
      console.error("Lỗi Webhook SePay:", err);
      await db.query("ROLLBACK");
      // Trả lại HTTP 500 thì SePay sẽ tự retry
      return res.status(500).json({ success: false, message: "Lỗi DB" });
    }
  }

  // Giao dịch không đúng cú pháp, trả về 200 để SePay khỏi gọi lại
  return res.json({ success: true, message: "Non-matching transaction" });
};

// GET /my-subscription
export const getMySubscription = async (req, res) => {
  const userId = req.user.userId;
  try {
    const result = await db.query(
      "SELECT * FROM subscriptions WHERE user_id = $1 ORDER BY expiry_date DESC LIMIT 1",
      [userId]
    );
    const userRes = await db.query("SELECT points FROM users WHERE id = $1", [userId]);
    res.json({
      success: true,
      subscription: result.rows[0],
      points: userRes.rows[0]?.points || 0
    });
  } catch (error) {
    res.status(500).json({ message: "Lỗi server" });
  }
};

// POST /exchange-points
export const exchangePointsForVip = async (req, res) => {
  const userId = req.user.userId;
  const { prizeId } = req.body;

  if (!prizeId) {
    return res.status(400).json({ success: false, message: "Mã phần quà đổi thưởng (prizeId) là bắt buộc." });
  }

  try {
    await db.query("BEGIN");

    // 1. Lấy cấu hình đổi quà từ DB
    const configQuery = await db.query(
      "SELECT value FROM system_settings WHERE key = 'reward_shop'"
    );
    const rewardShop = configQuery.rows[0]?.value || {};
    const prizes = rewardShop.prizes || [];
    
    // Tìm phần quà tương ứng (bắt buộc tìm thấy)
    const prize = prizes.find(p => p.id === prizeId);
    if (!prize) {
      await db.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "Phần quà đổi thưởng không tồn tại hoặc đã bị xóa." });
    }

    const POINTS_NEEDED = prize.points;
    const DAYS_TO_ADD = prize.days;
    const PRIZE_NAME = prize.name;

    // 2. Kiểm tra điểm của user
    const userRes = await db.query("SELECT points FROM users WHERE id = $1", [userId]);
    const userPoints = userRes.rows[0]?.points || 0;

    if (userPoints < POINTS_NEEDED) {
      await db.query("ROLLBACK");
      return res.status(400).json({ success: false, message: `Bạn không đủ ${POINTS_NEEDED} điểm để đổi thưởng.` });
    }

    const newPoints = userPoints - POINTS_NEEDED;

    // 3. Trừ điểm
    await db.query("UPDATE users SET points = $1 WHERE id = $2", [newPoints, userId]);

    // 4. Cộng ngày VIP
    const lastSub = await db.query(
      "SELECT expiry_date FROM subscriptions WHERE user_id = $1 AND status = 'active' ORDER BY expiry_date DESC LIMIT 1",
      [userId]
    );

    let startDate = new Date();
    if (lastSub.rows.length > 0 && new Date(lastSub.rows[0].expiry_date) > startDate) {
      startDate = new Date(lastSub.rows[0].expiry_date);
    }

    const expiryDate = new Date(startDate);
    expiryDate.setDate(expiryDate.getDate() + DAYS_TO_ADD);

    await db.query(
      "INSERT INTO subscriptions (user_id, start_date, expiry_date, status) VALUES ($1, $2, $3, 'active')",
      [userId, startDate, expiryDate]
    );

    await db.query("COMMIT");
    return res.json({ 
      success: true, 
      message: `Đổi ${POINTS_NEEDED} điểm lấy ${PRIZE_NAME} thành công!`, 
      newPoints 
    });
  } catch (error) {
    await db.query("ROLLBACK");
    console.error("Lỗi đổi điểm:", error);
    return res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

// GET /checkin-status
export const getCheckinStatus = async (req, res) => {
  const userId = req.user.userId;
  try {
    const query = await db.query(`
      SELECT points, streak_count, 
      (CURRENT_DATE - last_checkin_date) as days_diff
      FROM users WHERE id = $1
    `, [userId]);

    const user = query.rows[0];
    const hasCheckedInToday = user.days_diff === 0;

    // Nếu quá 1 ngày chưa điểm danh thì chuỗi bị đứt
    let currentStreak = user.streak_count || 0;
    if (user.days_diff > 1) {
      currentStreak = 0;
    }

    res.json({
      success: true,
      hasCheckedInToday,
      streakCount: currentStreak,
      points: user.points || 0
    });
  } catch (error) {
    console.error("Lỗi getCheckinStatus:", error);
    res.status(500).json({ message: "Lỗi server" });
  }
};

// POST /checkin
export const dailyCheckin = async (req, res) => {
  const userId = req.user.userId;
  try {
    await db.query("BEGIN");

    // 1. Lấy thông tin user
    const query = await db.query(`
      SELECT points, streak_count, 
      last_checkin_date, 
      CURRENT_DATE as db_today,
      (CURRENT_DATE - last_checkin_date) as days_diff
      FROM users WHERE id = $1
    `, [userId]);

    const user = query.rows[0];
    const daysDiff = user.days_diff;

    if (daysDiff === 0) {
      await db.query("ROLLBACK");
      return res.status(400).json({ success: false, message: "Hôm nay bạn đã điểm danh rồi! Hãy quay lại vào ngày mai nhé." });
    }

    // 2. Lấy cấu hình hệ thống động từ DB
    const configQuery = await db.query(
      "SELECT key, value FROM system_settings WHERE key IN ('reward_points', 'streak_milestones')"
    );
    const configs = {};
    configQuery.rows.forEach(r => {
      configs[r.key] = r.value;
    });

    const checkinPoints = configs.reward_points?.checkin !== undefined ? configs.reward_points.checkin : 10;
    const streakMilestones = configs.streak_milestones || [];

    let newStreak = 1;
    let pointsEarned = checkinPoints; // Điểm cơ bản từ cấu hình

    if (daysDiff === 1) {
      newStreak = (user.streak_count || 0) + 1;
    }

    // 3. Tính điểm bonus dựa trên mốc streak động
    const milestone = streakMilestones.find(m => m.days === newStreak);
    if (milestone) {
      pointsEarned += milestone.bonus;
    }

    // Tự động reset streak về 0 nếu đạt mốc ngày cao nhất được cấu hình
    const maxMilestoneDays = streakMilestones.length > 0
      ? Math.max(...streakMilestones.map(m => m.days))
      : 30; // Mặc định là 30 nếu không có mốc nào

    let finalStreak = newStreak;
    if (newStreak >= maxMilestoneDays) {
      finalStreak = 0; // Reset streak về 0 để quay vòng mới
    }

    await db.query(
      "UPDATE users SET points = points + $1, streak_count = $2, last_checkin_date = CURRENT_DATE WHERE id = $3",
      [pointsEarned, finalStreak, userId]
    );

    await db.query("COMMIT");

    res.json({
      success: true,
      message: `Điểm danh thành công! Bạn nhận được ${pointsEarned} điểm.`,
      pointsEarned,
      newStreak: finalStreak,
      newPoints: (user.points || 0) + pointsEarned
    });

  } catch (error) {
    await db.query("ROLLBACK");
    console.error("Lỗi điểm danh:", error);
    res.status(500).json({ success: false, message: "Lỗi hệ thống" });
  }
};

// GET /admin - Lấy danh sách toàn bộ giao dịch cho Admin (phân trang và lọc)
export const getAdminPayments = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const { keyword, type, status, date, sort } = req.query;

    let whereClause = " WHERE 1=1";
    const values = [];
    let paramCount = 1;

    if (keyword) {
      whereClause += ` AND (p.payment_id ILIKE $${paramCount} OR u.username ILIKE $${paramCount} OR u.email ILIKE $${paramCount})`;
      values.push(`%${keyword}%`);
      paramCount++;
    }

    if (status && status !== "all") {
      whereClause += ` AND p.status = $${paramCount}`;
      values.push(status);
      paramCount++;
    }

    if (type === "revenue") {
      whereClause += ` AND p.amount > 0`;
    } else if (type === "grant") {
      whereClause += ` AND p.amount = 0`;
    }

    if (date) {
      whereClause += ` AND DATE(p.created_at) = $${paramCount}`;
      values.push(date);
      paramCount++;
    }

    // 1. Đếm tổng số bản ghi giao dịch thỏa bộ lọc
    const countQuery = `
      SELECT COUNT(*) 
      FROM payments p
      JOIN users u ON p.user_id = u.id
      ${whereClause}
    `;
    const countRes = await db.query(countQuery, values);
    const total = parseInt(countRes.rows[0].count) || 0;
    const totalPages = Math.ceil(total / limit) || 1;

    // 2. Xác định sắp xếp
    const orderDirection = sort === "asc" ? "ASC" : "DESC";

    // 3. Thực hiện truy vấn danh sách giao dịch phân trang
    const queryText = `
      SELECT p.id, p.payment_id, p.amount, p.status, p.created_at, u.username, u.email
      FROM payments p
      JOIN users u ON p.user_id = u.id
      ${whereClause}
      ORDER BY p.created_at ${orderDirection}
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;
    const queryValues = [...values, limit, offset];
    const result = await db.query(queryText, queryValues);

    // Tính tổng doanh thu (chỉ các giao dịch thành công và amount > 0)
    const revenueResult = await db.query(`
      SELECT SUM(amount) as total_revenue 
      FROM payments 
      WHERE status = 'succeeded' AND amount > 0
    `);

    // Tính thống kê hôm nay
    const todayResult = await db.query(`
      SELECT COUNT(*) as today_count, SUM(amount) as today_revenue
      FROM payments
      WHERE status = 'succeeded' AND amount > 0 AND DATE(created_at) = CURRENT_DATE
    `);

    res.json({
      success: true,
      data: result.rows,
      stats: {
        total_revenue: parseInt(revenueResult.rows[0].total_revenue) || 0,
        today_count: parseInt(todayResult.rows[0].today_count) || 0,
        today_revenue: parseInt(todayResult.rows[0].today_revenue) || 0
      },
      pagination: {
        total,
        page,
        limit,
        totalPages,
      }
    });
  } catch (error) {
    console.error("Lỗi lấy danh sách giao dịch:", error);
    res.status(500).json({ success: false, message: "Lỗi server khi tải dữ liệu giao dịch" });
  }
};