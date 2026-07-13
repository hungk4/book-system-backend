import db from "../config/db.js";
import { getReadUrl } from "../services/s3.service.js";

// GET /api/users
export const getAllUsers = async (req, res) => {
  try {
    const currentUserId = req.user.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const { keyword, membership, status } = req.query;

    let whereClause = " WHERE id != $1";
    const values = [currentUserId];
    let paramCount = 2;

    if (keyword) {
      whereClause += ` AND (username ILIKE $${paramCount} OR email ILIKE $${paramCount})`;
      values.push(`%${keyword}%`);
      paramCount++;
    }

    if (status && status !== "all") {
      whereClause += ` AND status = $${paramCount}`;
      values.push(status);
      paramCount++;
    }

    if (membership === "premium") {
      whereClause += ` AND EXISTS (SELECT 1 FROM subscriptions WHERE user_id = users.id AND status = 'active' AND expiry_date > NOW())`;
    } else if (membership === "regular") {
      whereClause += ` AND NOT EXISTS (SELECT 1 FROM subscriptions WHERE user_id = users.id AND status = 'active' AND expiry_date > NOW())`;
    }

    // 1. Đếm tổng số user thỏa mãn bộ lọc
    const countQuery = `SELECT COUNT(*) FROM users ${whereClause}`;
    const countResult = await db.query(countQuery, values);
    const total = parseInt(countResult.rows[0].count) || 0;
    const totalPages = Math.ceil(total / limit) || 1;

    // 2. Lấy dữ liệu người dùng của trang hiện tại
    const queryText = `
      SELECT id, username, email, google_id, role, points, streak_count, created_at, last_checkin_date, status, 
      (EXISTS (SELECT 1 FROM subscriptions WHERE user_id = users.id AND status = 'active' AND expiry_date > NOW())) as is_premium 
      FROM users 
      ${whereClause} 
      ORDER BY created_at DESC 
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;
    const queryValues = [...values, limit, offset];
    const result = await db.query(queryText, queryValues);

    const totalUsersCountRes = await db.query("SELECT COUNT(*) FROM users WHERE id != $1", [currentUserId]);
    const totalPremiumCountRes = await db.query(
      "SELECT COUNT(*) FROM users WHERE id != $1 AND EXISTS (SELECT 1 FROM subscriptions WHERE user_id = users.id AND status = 'active' AND expiry_date > NOW())",
      [currentUserId]
    );
    const totalBannedCountRes = await db.query("SELECT COUNT(*) FROM users WHERE id != $1 AND status = 'banned'", [currentUserId]);

    res.json({
      success: true,
      users: result.rows,
      pagination: {
        total,
        page,
        limit,
        totalPages,
      },
      stats: {
        totalUsers: parseInt(totalUsersCountRes.rows[0].count) || 0,
        totalPremium: parseInt(totalPremiumCountRes.rows[0].count) || 0,
        totalBanned: parseInt(totalBannedCountRes.rows[0].count) || 0,
      }
    });
  } catch (error) {
    console.error("Lỗi khi lấy danh sách user:", error);
    res.status(500).json({ success: false, message: "Lỗi server khi tải dữ liệu người dùng" });
  }
};

// PUT /api/users/:id/status
export const toggleUserStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  
  if (!['active', 'banned'].includes(status)) {
    return res.status(400).json({ success: false, message: "Trạng thái không hợp lệ" });
  }
  
  try {
    // Check if the user is trying to lock themselves
    if (parseInt(id) === req.user.userId) {
      return res.status(400).json({ success: false, message: "Bạn không thể tự khóa tài khoản của chính mình" });
    }

    const result = await db.query("UPDATE users SET status = $1 WHERE id = $2 RETURNING id", [status, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Không tìm thấy người dùng" });
    }
    
    res.json({ success: true, message: status === 'banned' ? "Đã khóa tài khoản thành công" : "Đã mở khóa tài khoản thành công" });
  } catch (error) {
    console.error("Lỗi cập nhật trạng thái user:", error);
    res.status(500).json({ success: false, message: "Lỗi server khi cập nhật trạng thái người dùng" });
  }
};

// GET /api/users/:id/details
export const getUserDetails = async (req, res) => {
  const { id } = req.params;

  try {
    // 1. Get basic user info
    const userQuery = `
      SELECT u.id, u.username, u.email, u.google_id, u.role, u.points, u.streak_count, u.created_at, u.last_checkin_date, u.status,
      (SELECT expiry_date FROM subscriptions WHERE user_id = u.id AND status = 'active' AND expiry_date > NOW() ORDER BY expiry_date DESC LIMIT 1) as premium_expiry
      FROM users u WHERE u.id = $1
    `;
    const userRes = await db.query(userQuery, [id]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Không tìm thấy người dùng" });
    }
    const user = userRes.rows[0];

    // 2. Get reading history (Bookmarks)
    const bookmarksQuery = `
      SELECT bm.last_page, bm.is_favorite, bm.updated_at, b.title, b.cover_image_key 
      FROM bookmarks bm
      JOIN books b ON bm.book_id = b.id
      WHERE bm.user_id = $1
      ORDER BY bm.updated_at DESC
    `;
    const bookmarksRes = await db.query(bookmarksQuery, [id]);
    const bookmarksWithUrls = await Promise.all(
      bookmarksRes.rows.map(async (bm) => ({
        ...bm,
        cover_url: bm.cover_image_key ? await getReadUrl(bm.cover_image_key) : null,
      }))
    );

    // 3. Get Payment & Subscription History
    const paymentsQuery = `
      SELECT p.amount, p.status, p.created_at as payment_date, s.start_date, s.expiry_date, s.status as sub_status
      FROM payments p
      JOIN subscriptions s ON p.subscription_id = s.id
      WHERE p.user_id = $1
      ORDER BY p.created_at DESC
    `;
    const paymentsRes = await db.query(paymentsQuery, [id]);

    // 4. Get Reviews
    const reviewsQuery = `
      SELECT r.rating, r.content, r.created_at, b.title 
      FROM reviews r
      JOIN books b ON r.book_id = b.id
      WHERE r.user_id = $1
      ORDER BY r.created_at DESC
    `;
    const reviewsRes = await db.query(reviewsQuery, [id]);

    res.json({
      success: true,
      data: {
        user,
        bookmarks: bookmarksWithUrls,
        payments: paymentsRes.rows,
        reviews: reviewsRes.rows
      }
    });

  } catch (error) {
    console.error("Lỗi lấy thông tin chi tiết user:", error);
    res.status(500).json({ success: false, message: "Lỗi server khi tải dữ liệu chi tiết người dùng" });
  }
};

// PUT /api/users/:id/points
export const updateUserPoints = async (req, res) => {
  const { id } = req.params;
  const { pointsChange } = req.body; // Can be positive or negative

  if (typeof pointsChange !== 'number') {
    return res.status(400).json({ success: false, message: "Số điểm thay đổi không hợp lệ" });
  }

  try {
    const result = await db.query(
      "UPDATE users SET points = GREATEST(0, points + $1) WHERE id = $2 RETURNING points", 
      [pointsChange, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Không tìm thấy người dùng" });
    }

    res.json({ 
      success: true, 
      message: pointsChange >= 0 ? `Đã cộng ${pointsChange} điểm thành công` : `Đã trừ ${Math.abs(pointsChange)} điểm thành công`,
      newPoints: result.rows[0].points
    });
  } catch (error) {
    console.error("Lỗi cập nhật điểm user:", error);
    res.status(500).json({ success: false, message: "Lỗi server khi cập nhật điểm" });
  }
};

// PUT /api/users/:id/premium
export const grantPremium = async (req, res) => {
  const { id } = req.params;
  const { days } = req.body;

  if (!days || days <= 0) {
    return res.status(400).json({ success: false, message: "Số ngày gia hạn không hợp lệ" });
  }

  try {
    await db.query("BEGIN");

    // Lấy gói premium hiện tại (nếu có và còn hạn)
    const checkSub = await db.query(
      "SELECT * FROM subscriptions WHERE user_id = $1 AND status = 'active' AND expiry_date > NOW()",
      [id]
    );

    let newExpiry;
    if (checkSub.rows.length > 0) {
      // Đã có gói -> Gia hạn thêm `days` từ ngày hết hạn hiện tại
      const subId = checkSub.rows[0].id;
      const updateRes = await db.query(
        "UPDATE subscriptions SET expiry_date = expiry_date + ($1 || ' days')::interval WHERE id = $2 RETURNING expiry_date",
        [days, subId]
      );
      newExpiry = updateRes.rows[0].expiry_date;
    } else {
      // Chưa có gói -> Tạo gói mới 0đ (Admin grant)
      const insertRes = await db.query(
        "INSERT INTO subscriptions (user_id, start_date, expiry_date, status) VALUES ($1, NOW(), NOW() + ($2 || ' days')::interval, 'active') RETURNING id, expiry_date",
        [id, days]
      );
      
      newExpiry = insertRes.rows[0].expiry_date;
      const subId = insertRes.rows[0].id;
      
      // Ghi nhận lịch sử giao dịch 0đ (Tạo mã giao dịch ảo ADMIN_GRANT_...)
      const fakePaymentId = `ADMIN_GRANT_${Date.now()}`;
      await db.query(
        "INSERT INTO payments (payment_id, user_id, subscription_id, amount, status) VALUES ($1, $2, $3, 0, 'succeeded')",
        [fakePaymentId, id, subId]
      );
    }
    await db.query("COMMIT");
    res.json({ success: true, message: `Đã gia hạn Premium thêm ${days} ngày`, newExpiry });
  } catch(e) {
    await db.query("ROLLBACK");
    console.error("Lỗi cấp premium:", e);
    res.status(500).json({ success: false, message: "Lỗi server khi gia hạn premium" });
  }
};
