import db from "../config/db.js";

import { getUploadUrl } from "../services/s3.service.js";

// POST /api/books/upload-url - Lấy presigned URL để upload file lên S3
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
    const uniqueFileName = `${fileName}-${Date.now()}`;

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
