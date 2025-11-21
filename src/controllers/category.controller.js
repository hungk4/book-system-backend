import db from "../config/db.js";

// GET /api/categories - Lấy danh sách tất cả thể loại
export const getCategories = async (req, res) => {
  try {
    const queryText = "SELECT * FROM categories ORDER BY created_at DESC";
    const result = await db.query(queryText);

    res.json({
      success: true,
      categories: result.rows,
    });
  } catch (error) {
    console.error("Lỗi khi lấy danh sách thể loại:", error);
    res.status(500).json({ message: "Lỗi server" });
  }
};

// POST /api/categories - Tạo thể loại mới (admin only)
export const createCategory = async (req, res) => {
  const {name} = req.body;

  if(!name) {
    return res.status(400).json({ message: "Tên thể loại là bắt buộc" });
  }

  try {

    // Kiểm tra thể loại đã tồn tại chưa
    const checkQueryText = "SELECT * FROM categories WHERE name = $1";
    const checkResult = await db.query(checkQueryText, [name]);

    if (checkResult.rows.length > 0) {
      return res.status(400).json({ message: "Thể loại đã tồn tại" });
    }

    // Tạo thể loại mới lưu vào database
    const insertQueryText = "INSERT INTO categories (name) VALUES ($S1) RETURNING *";
    const result = await db.query(insertQueryText, [name]);

    res.status(201).json({
      success: true,
      message: "Tạo thể loại thành công",
      category: result.rows[0],
    });
  } catch (error) {
    console.error("Lỗi khi tạo thể loại:", error);
    res.status(500).json({ message: "Lỗi server" });
  }
};
