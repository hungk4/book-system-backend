import db from "../config/db.js";

// GET /api/settings - Lấy toàn bộ cấu hình hệ thống
export const getSettings = async (req, res) => {
  try {
    const result = await db.query("SELECT key, value FROM system_settings");
    const settings = {};
    result.rows.forEach((row) => {
      settings[row.key] = row.value;
    });
    res.json({ success: true, settings });
  } catch (error) {
    console.error("Lỗi khi lấy cấu hình hệ thống:", error);
    res.status(500).json({ success: false, message: "Lỗi server khi lấy cấu hình.", error: error.message });
  }
};

// GET /api/settings/public - Lấy cấu hình công khai cho người dùng (checkin, streak, shop, moderation, packages)
export const getPublicSettings = async (req, res) => {
  try {
    const result = await db.query(
      "SELECT key, value FROM system_settings WHERE key IN ('reward_points', 'streak_milestones', 'reward_shop', 'moderation', 'premium_packages')"
    );
    const settings = {};
    result.rows.forEach((row) => {
      settings[row.key] = row.value;
    });
    res.json({ success: true, settings });
  } catch (error) {
    console.error("Lỗi khi lấy cấu hình công khai:", error);
    res.status(500).json({ success: false, message: "Lỗi server khi lấy cấu hình công khai.", error: error.message });
  }
};

// PUT /api/settings/:key - Cập nhật một cấu hình
export const updateSetting = async (req, res) => {
  const { key } = req.params;
  const { value } = req.body;

  if (value === undefined) {
    return res.status(400).json({ success: false, message: "Dữ liệu cấu hình không được để trống." });
  }

  try {
    const result = await db.query(
      "UPDATE system_settings SET value = $1, updated_at = NOW() WHERE key = $2 RETURNING *",
      [JSON.stringify(value), key]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: `Không tìm thấy key cấu hình: ${key}` });
    }

    res.json({
      success: true,
      message: "Cập nhật cấu hình thành công.",
      setting: result.rows[0]
    });
  } catch (error) {
    console.error(`Lỗi khi cập nhật cấu hình cho key ${key}:`, error);
    res.status(500).json({ success: false, message: "Lỗi server khi cập nhật cấu hình.", error: error.message });
  }
};
