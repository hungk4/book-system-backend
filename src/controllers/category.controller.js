import db from "../config/db.js";

// GET /api/categories - Lấy danh sách thể loại (hỗ trợ phân trang và all=true)
export const getCategories = async (req, res) => {
  try {
    const { all, keyword, sortBy } = req.query;

    if (all === "true") {
      let queryText = "SELECT * FROM categories";
      const values = [];
      if (keyword) {
        queryText += " WHERE name ILIKE $1";
        values.push(`%${keyword}%`);
      }
      queryText += " ORDER BY name ASC";
      const result = await db.query(queryText, values);
      return res.json({
        success: true,
        categories: result.rows,
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const values = [];
    let whereClause = "";
    if (keyword) {
      whereClause = "WHERE c.name ILIKE $1";
      values.push(`%${keyword}%`);
    }

    // 1. Đếm tổng số thể loại
    const countQuery = `SELECT COUNT(*) FROM categories c ${whereClause}`;
    const countResult = await db.query(countQuery, values);
    const total = parseInt(countResult.rows[0].count) || 0;
    const totalPages = Math.ceil(total / limit) || 1;

    // Xác định thứ tự sắp xếp
    let orderByText = "ORDER BY c.name ASC";
    if (sortBy === "name_desc") {
      orderByText = "ORDER BY c.name DESC";
    } else if (sortBy === "books_desc") {
      orderByText = "ORDER BY book_count DESC, c.name ASC";
    } else if (sortBy === "books_asc") {
      orderByText = "ORDER BY book_count ASC, c.name ASC";
    }

    // 2. Lấy dữ liệu phân trang của trang hiện tại kèm số lượng sách
    const queryText = `
      SELECT c.*, COUNT(b.id)::int AS book_count 
      FROM categories c
      LEFT JOIN books b ON b.category_id = c.id
      ${whereClause}
      GROUP BY c.id
      ${orderByText}
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}
    `;
    const queryValues = [...values, limit, offset];
    const result = await db.query(queryText, queryValues);

    res.json({
      success: true,
      categories: result.rows,
      pagination: {
        total,
        page,
        limit,
        totalPages,
      },
    });
  } catch (error) {
    console.error("Lỗi khi lấy danh sách thể loại:", error);
    res.status(500).json({ message: "Lỗi server" });
  }
};

// POST /api/categories - Tạo thể loại mới (admin only)
export const createCategory = async (req, res) => {
  const { name } = req.body;

  if (!name) {
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
    const insertQueryText =
      "INSERT INTO categories (name) VALUES ($1) RETURNING *";
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

// PUT /api/categories/:id - Cập nhật thể loại
export const updateCategory = async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;

  try {
    const queryText =
      "UPDATE categories SET name = $1 WHERE id = $2 RETURNING *";
    const result = await db.query(queryText, [name, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy thể loại" });
    }

    res.json({ success: true, category: result.rows[0] });
  } catch (error) {
    res.status(500).json({ message: "Lỗi server" });
  }
};

// DELETE /api/categories/:id - Xóa thể loại
export const deleteCategory = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query(
      "DELETE FROM categories WHERE id = $1 RETURNING *",
      [id],
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ message: "Không tìm thấy thể loại để xóa" });
    }

    res.json({ success: true, message: "Xóa thành công" });
  } catch (error) {
    res.status(500).json({ message: "Lỗi server" });
  }
};
