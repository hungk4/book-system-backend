import db from "../config/db.js";

// GET /api/authors - Lấy danh sách tác giả (hỗ trợ phân trang và all=true)
export const getAuthors = async (req, res) => {
  try {
    const { all, keyword, sortBy } = req.query;

    if (all === "true") {
      let queryText = `
        SELECT a.*, COUNT(b.id)::int AS book_count 
        FROM authors a
        LEFT JOIN books b ON b.author_id = a.id
      `;
      const values = [];
      if (keyword) {
        queryText += " WHERE a.name ILIKE $1 OR a.bio ILIKE $1";
        values.push(`%${keyword}%`);
      }
      queryText += " GROUP BY a.id ORDER BY a.name ASC";
      const result = await db.query(queryText, values);
      return res.json({
        success: true,
        authors: result.rows,
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const values = [];
    let whereClause = "";
    if (keyword) {
      whereClause = "WHERE a.name ILIKE $1 OR a.bio ILIKE $1";
      values.push(`%${keyword}%`);
    }

    // 1. Đếm tổng số tác giả
    const countQuery = `SELECT COUNT(*) FROM authors a ${whereClause}`;
    const countResult = await db.query(countQuery, values);
    const total = parseInt(countResult.rows[0].count) || 0;
    const totalPages = Math.ceil(total / limit) || 1;

    // Xác định thứ tự sắp xếp
    let orderByText = "ORDER BY a.name ASC";
    if (sortBy === "name_desc") {
      orderByText = "ORDER BY a.name DESC";
    } else if (sortBy === "books_desc") {
      orderByText = "ORDER BY book_count DESC, a.name ASC";
    } else if (sortBy === "books_asc") {
      orderByText = "ORDER BY book_count ASC, a.name ASC";
    }

    // 2. Lấy dữ liệu phân trang của trang hiện tại kèm số lượng sách
    const queryText = `
      SELECT a.*, COUNT(b.id)::int AS book_count 
      FROM authors a
      LEFT JOIN books b ON b.author_id = a.id
      ${whereClause}
      GROUP BY a.id
      ${orderByText}
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}
    `;
    const queryValues = [...values, limit, offset];
    const result = await db.query(queryText, queryValues);

    res.json({
      success: true,
      authors: result.rows,
      pagination: {
        total,
        page,
        limit,
        totalPages,
      },
    });
  } catch (error) {
    console.error("Lỗi khi lấy danh sách tác giả:", error);
    res.status(500).json({ message: "Lỗi server" });
  }
};


// POST /api/authors - Tạo tác giả mới (admin only)
export const createAuthor = async (req, res) => {
  const { name, bio } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ message: "Tên tác giả là bắt buộc" });
  }

  try {
    const check = await db.query("SELECT id FROM authors WHERE name = $1", [name.trim()]);
    if (check.rows.length > 0) {
      return res.status(400).json({ message: "Tác giả đã tồn tại trong hệ thống" });
    }

    const result = await db.query(
      "INSERT INTO authors (name, bio) VALUES ($1, $2) RETURNING *",
      [name.trim(), bio?.trim() || null]
    );

    res.status(201).json({
      success: true,
      message: "Tạo tác giả thành công",
      author: result.rows[0],
    });
  } catch (error) {
    console.error("Lỗi khi tạo tác giả:", error);
    res.status(500).json({ message: "Lỗi server" });
  }
};

// PUT /api/authors/:id - Cập nhật tác giả (admin only)
export const updateAuthor = async (req, res) => {
  const { id } = req.params;
  const { name, bio } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ message: "Tên tác giả là bắt buộc" });
  }

  try {
    const result = await db.query(
      "UPDATE authors SET name = $1, bio = $2 WHERE id = $3 RETURNING *",
      [name.trim(), bio?.trim() || null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy tác giả" });
    }

    res.json({ success: true, author: result.rows[0] });
  } catch (error) {
    console.error("Lỗi khi cập nhật tác giả:", error);
    res.status(500).json({ message: "Lỗi server" });
  }
};

// DELETE /api/authors/:id - Xóa tác giả (admin only)
export const deleteAuthor = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query(
      "DELETE FROM authors WHERE id = $1 RETURNING *",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy tác giả để xóa" });
    }

    res.json({ success: true, message: "Xóa tác giả thành công" });
  } catch (error) {
    // Lỗi foreign key (tác giả đang được dùng bởi sách)
    if (error.code === "23503") {
      return res.status(400).json({ message: "Không thể xóa: tác giả đang được liên kết với một hoặc nhiều cuốn sách" });
    }
    console.error("Lỗi khi xóa tác giả:", error);
    res.status(500).json({ message: "Lỗi server" });
  }
};
