import db from "../config/db.js";

import { getUploadUrl, getReadUrl } from "../services/s3.service.js";

// POST /api/books/generate-upload-link - Lấy presigned URL để upload file lên S3
export const getUploadUrlHandler = async (req, res) => {
  const { fileName, fileType } = req.body;

  if (!fileName || !fileType) {
    return res.status(400).json({
      success: false,
      message: "Thiếu fileName hoặc fileType",
    });
  }

  try {
    // Tạo tên file duy nhất
    const uniqueFileName = `${Date.now()}-${fileName}`;

    // Gọi Service S3 để lấy presigned URL
    const uploadUrl = await getUploadUrl(uniqueFileName, fileType);

    res.json({
      success: true,
      message: "Lấy URL upload thành công",
      uploadUrl,
      fileKey: uniqueFileName,
    });
  } catch (error) {
    console.error("Lỗi khi lấy URL upload:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy URL upload",
      error: error.message,
    });
  }
};

// POST /api/books - Thêm sách mới vào cơ sở dữ liệu
export const createBook = async (req, res) => {
  const {
    title,
    author,
    description,
    category_id,
    book_file_key,
    cover_image_key,
  } = req.body;

  if (!title || !book_file_key) {
    return res.status(400).json({
      success: false,
      message: "Tiêu đề và file sách là bắt buộc.",
    });
  }

  try {
    const queryText = `
      INSERT INTO books (title, author, description, category_id, book_file_key, cover_image_key)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;
    const values = [
      title,
      author,
      description,
      category_id,
      book_file_key,
      cover_image_key,
    ];

    const result = await db.query(queryText, values);
    res.status(201).json({
      success: true,
      message: "Thêm sách mới thành công!",
      book: result.rows[0],
    });
  } catch (error) {
    console.error("Lỗi khi thêm sách mới:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi server khi thêm sách mới.",
      error: error.message,
    });
  }
};

// GET /api/books?keyword=...&categoryId=... - Lấy list sách
export const getBooks = async (req, res) => {
  try {
    const { keyword, categoryId } = req.query;

    let queryText = `SELECT books.*, categories.name AS category_name
    FROM books
    LEFT JOIN categories ON books.category_id = categories.id
    WHERE 1=1`;
    const values = [];
    let paramCount = 1;
    if (keyword) {
      queryText += ` AND (books.title ILIKE $${paramCount} OR books.author ILIKE $${paramCount})`;
      values.push(`%${keyword}%`);
      paramCount++;
    }

    if (categoryId) {
      queryText += ` AND books.category_id = $${paramCount}`;
      values.push(categoryId);
      paramCount++;
    }

    queryText += " ORDER BY books.created_at DESC";

    const result = await db.query(queryText, values);
    res.json({
      success: true,
      books: result.rows,
    });
  } catch (error) {
    console.error("Lỗi khi lấy danh sách sách:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy danh sách sách.",
      error: error.message,
    });
  }
};

// GET /api/books/:id - Lấy chi tiết một cuốn sách theo ID
export const getBookDetail = async (req, res) => {
  const { id } = req.params;
  try {
    const queryText = "SELECT * FROM books WHERE id = $1";
    const result = await db.query(queryText, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy sách với ID đã cho.",
      });
    }

    res.json({
      success: true,
      book: result.rows[0],
    });
  } catch (error) {
    console.error("Lỗi khi lấy chi tiết sách:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy chi tiết sách.",
      error: error.message,
    });
  }
};

// GET /api/books/read/:id -  Đọc sách bằng presigned URL
export const readBook = async (req, res) => {
  const { id } = req.params;

  const userId = req.user ? req.user.userId : null;
  try {
    // 1. Lấy thông tin sách từ DB
    const queryText = "SELECT * FROM books WHERE id = $1";
    const result = await db.query(queryText, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy sách với ID đã cho.",
      });
    }

    const book = result.rows[0];

    // 2. Kiểm tra sách có premium ko
    if (book.is_premium) {
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Vui lòng đăng nhập để đọc sách premium.",
        });
      }

      // Kiểm tra bảng subscriptions
      // Tìm gói hội viên của user này mà đang 'active' VÀ chưa hết hạn
      const subQuery = `
        SELECT * FROM subscriptions
        WHERE user_id = $1
        AND status = 'active'
        AND expiry_date > NOW()
      `;
      const subResult = await db.query(subQuery, [userId]);

      // Nếu không tìm thấy gói hội viên hợp lệ
      if (subResult.rows.length === 0) {
        return res.status(403).json({
          success: false,
          message: "Bạn cần có gói hội viên để đọc sách premium.",
        });
      }
    }

    // 3. Gọi service S3 để lấy presigned URL đọc sách
    const readUrl = await getReadUrl(book.book_file_key);

    res.json({
      success: true,
      message: "Lấy URL đọc sách thành công.",
      readUrl,
    });
  } catch (error) {
    console.error("Lỗi khi lấy URL đọc sách:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy URL đọc sách.",
      error: error.message,
    });
  }
};
