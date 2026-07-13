import db from "../config/db.js";

// DELETE /api/reviews/:id - Xóa một đánh giá nhận xét sách
export const deleteReview = async (req, res) => {
  const { id } = req.params;

  try {
    await db.query("BEGIN");

    // 1. Xóa review và lấy thông tin user_id
    const result = await db.query(
      "DELETE FROM reviews WHERE id = $1 RETURNING *",
      [id]
    );

    if (result.rows.length === 0) {
      await db.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "Không tìm thấy đánh giá để xóa." });
    }

    const { user_id } = result.rows[0];

    // 2. Lấy cấu hình điểm thưởng review từ DB
    const configQuery = await db.query(
      "SELECT value FROM system_settings WHERE key = 'reward_points'"
    );
    const rewardPoints = configQuery.rows[0]?.value?.review !== undefined ? configQuery.rows[0].value.review : 30;

    // 3. Trừ điểm thưởng của người dùng (giữ tối thiểu là 0 điểm)
    await db.query(
      "UPDATE users SET points = GREATEST(0, points - $1) WHERE id = $2",
      [rewardPoints, user_id]
    );

    await db.query("COMMIT");

    res.json({
      success: true,
      message: `Xóa đánh giá thành công và đã trừ ${rewardPoints} điểm thưởng của người dùng.`,
    });
  } catch (error) {
    await db.query("ROLLBACK");
    console.error("Lỗi khi xóa đánh giá:", error);
    res.status(500).json({ success: false, message: "Lỗi server khi xóa đánh giá.", error: error.message });
  }
};
