import db from "../config/db.js";

import {
  getUploadUrl,
  getReadUrl,
  deleteFileFromS3,
} from "../services/s3.service.js";
import { s3Client } from "../services/s3.service.js";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { PDFDocument, rgb, StandardFonts, degrees } from "pdf-lib";
import NodeCache from "node-cache";

// Cấu hình Cache trong bộ nhớ RAM của Server (TTL: 10 phút)
const pdfCache = new NodeCache({ stdTTL: 600, checkperiod: 60 });

const streamToBuffer = async (stream) => {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks)));
  });
};

// ------- Admin APIs -------
// POST /api/books/generate-upload-link - Lấy presigned URL để upload file lên S3
export const getUploadUrlHandler = async (req, res) => {
  try {
    const { coverName, coverType, bookName, bookType } = req.body;

    // Tạo tên file duy nhất
    const cover_image_key = `covers/${Date.now()}-${coverName}`;
    const book_file_key = `books/${Date.now()}-${bookName}`;

    const coverUploadUrl = await getUploadUrl(cover_image_key, coverType);
    const bookUploadUrl = await getUploadUrl(book_file_key, bookType);

    res.json({
      success: true,
      data: {
        cover_image: { uploadUrl: coverUploadUrl, key: cover_image_key },
        book: { uploadUrl: bookUploadUrl, key: book_file_key },
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Lỗi khi tạo presigned URL", error: error.message });
  }
};

// POST /api/books - Thêm sách mới vào cơ sở dữ liệu
export const createBook = async (req, res) => {
  const {
    title,
    author_id,
    description,
    category_id,
    book_file_key,
    cover_image_key,
    is_premium,
    total_pages,
  } = req.body;

  if (!title || !book_file_key || !cover_image_key) {
    return res.status(400).json({
      success: false,
      message: "Tiêu đề, file sách và ảnh bìa là bắt buộc.",
    });
  }

  try {
    const queryText = `
      INSERT INTO books (title, author_id, description, category_id, book_file_key, cover_image_key, is_premium, total_pages)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *;
    `;
    const values = [
      title,
      author_id,
      description,
      category_id,
      book_file_key,
      cover_image_key,
      is_premium || false,
      total_pages || 0,
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

// DELETE /api/books/:id - Xóa sách
export const deleteBook = async (req, res) => {
  const { id } = req.params;
  try {
    // 1. Lấy thông tin sách để có Key xóa trên S3
    const bookResult = await db.query(
      "SELECT cover_image_key, book_file_key FROM books WHERE id = $1",
      [id],
    );
    if (bookResult.rows.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy sách" });
    }

    const { cover_image_key, book_file_key } = bookResult.rows[0];

    // 2. Xóa file trên S3 (nếu có)
    if (cover_image_key) await deleteFileFromS3(cover_image_key);
    if (book_file_key) await deleteFileFromS3(book_file_key);

    // 3. Xóa trong Database (ràng buộc CASCADE trong init.sql sẽ tự xóa bookmarks/annotations)
    await db.query("DELETE FROM books WHERE id = $1", [id]);

    res.json({ success: true, message: "Xóa sách thành công" });
  } catch (error) {
    res.status(500).json({ message: "Lỗi khi xóa sách", error: error.message });
  }
};

// PUT /api/books/:id - Cập nhật thông tin sách
export const updateBook = async (req, res) => {
  const { id } = req.params;
  const {
    title,
    author_id,
    description,
    category_id,
    is_premium,
    total_pages,
    book_file_key,
    cover_image_key,
  } = req.body;

  try {
    // 1. Lấy thông tin sách cũ để so sánh và xóa file trên S3 nếu cần
    const oldBookRes = await db.query(
      "SELECT cover_image_key, book_file_key FROM books WHERE id = $1",
      [id],
    );
    if (oldBookRes.rows.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy sách" });
    }
    const oldBook = oldBookRes.rows[0];

    // 2. Cập nhật thông tin mới vào Database
    const updateQuery = `
      UPDATE books 
      SET title = $1, author_id = $2, description = $3, category_id = $4, 
          is_premium = $5, total_pages = $6, book_file_key = $7, cover_image_key = $8
      WHERE id = $9 RETURNING *`;

    const values = [
      title,
      author_id,
      description,
      category_id,
      is_premium,
      total_pages,
      book_file_key,
      cover_image_key,
      id,
    ];
    const result = await db.query(updateQuery, values);

    // 3. So sánh và xóa file cũ trên S3 nếu có file mới thay thế
    if (cover_image_key && cover_image_key !== oldBook.cover_image_key) {
      await deleteFileFromS3(oldBook.cover_image_key);
    }
    if (book_file_key && book_file_key !== oldBook.book_file_key) {
      await deleteFileFromS3(oldBook.book_file_key);
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ message: "Lỗi server", error: error.message });
  }
};

// GET /api/books/stats - Lấy thống kê cho admin dashboard
export const getDashboardStats = async (req, res) => {
  try {
    const totalBooksRes = await db.query("SELECT COUNT(*) FROM books");
    const totalPremiumBooksRes = await db.query("SELECT COUNT(*) FROM books WHERE is_premium = true");
    const totalUsersRes = await db.query("SELECT COUNT(*) FROM users");
    const totalActiveSubsRes = await db.query("SELECT COUNT(*) FROM subscriptions WHERE status = 'active' AND expiry_date > NOW()");
    const totalCategoriesRes = await db.query("SELECT COUNT(*) FROM categories");

    // Thống kê bổ sung
    const totalRevenueRes = await db.query("SELECT COALESCE(SUM(amount), 0) AS count FROM payments WHERE status = 'succeeded'");
    const totalCompletedBooksRes = await db.query("SELECT COUNT(*) FROM bookmarks WHERE is_completed = true");
    const totalReviewsRes = await db.query("SELECT COUNT(*) FROM reviews");

    // Doanh thu 6 tháng gần nhất
    const revenueByMonthRes = await db.query(`
      SELECT TO_CHAR(created_at, 'YYYY-MM') AS month, COALESCE(SUM(amount), 0)::float AS revenue
      FROM payments
      WHERE status = 'succeeded'
      GROUP BY TO_CHAR(created_at, 'YYYY-MM')
      ORDER BY month DESC
      LIMIT 6
    `);

    // Người dùng mới 6 tháng gần nhất
    const usersByMonthRes = await db.query(`
      SELECT TO_CHAR(created_at, 'YYYY-MM') AS month, COUNT(*)::integer AS count
      FROM users
      GROUP BY TO_CHAR(created_at, 'YYYY-MM')
      ORDER BY month DESC
      LIMIT 6
    `);

    res.json({
      success: true,
      totalBooks: parseInt(totalBooksRes.rows[0].count),
      totalPremiumBooks: parseInt(totalPremiumBooksRes.rows[0].count),
      totalUsers: parseInt(totalUsersRes.rows[0].count),
      totalActiveSubscriptions: parseInt(totalActiveSubsRes.rows[0].count),
      totalCategories: parseInt(totalCategoriesRes.rows[0].count),
      
      // Các trường mới
      totalRevenue: parseFloat(totalRevenueRes.rows[0].count),
      totalCompletedBooks: parseInt(totalCompletedBooksRes.rows[0].count),
      totalReviews: parseInt(totalReviewsRes.rows[0].count),
      revenueByMonth: revenueByMonthRes.rows.reverse(),
      usersByMonth: usersByMonthRes.rows.reverse(),
    });
  } catch (error) {
    console.error("Lỗi lấy thống kê dashboard:", error);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

// ------- Admin APIs -------

// GET /api/books?keyword=...&categoryId=... - Lấy list sách (phân trang và lọc)
export const getBooks = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    // Hỗ trợ cả camelCase và snake_case query params
    const keyword = req.query.keyword;
    const category_id = req.query.category_id || req.query.categoryId;
    const author_id = req.query.author_id || req.query.authorId;
    const is_premium = req.query.is_premium || req.query.isPremium;
    const sort = req.query.sort || req.query.sortBy;

    let whereClause = " WHERE 1=1";
    const values = [];
    let paramCount = 1;

    if (keyword) {
      whereClause += ` AND (books.title ILIKE $${paramCount} OR authors.name ILIKE $${paramCount})`;
      values.push(`%${keyword}%`);
      paramCount++;
    }

    if (category_id) {
      whereClause += ` AND books.category_id = $${paramCount}`;
      values.push(parseInt(category_id));
      paramCount++;
    }

    if (author_id) {
      whereClause += ` AND books.author_id = $${paramCount}`;
      values.push(parseInt(author_id));
      paramCount++;
    }

    if (is_premium !== undefined && is_premium !== null && is_premium !== "") {
      whereClause += ` AND books.is_premium = $${paramCount}`;
      values.push(is_premium === "true" || is_premium === true);
      paramCount++;
    }

    // 1. Đếm tổng số bản ghi thỏa mãn bộ lọc
    const countQuery = `
      SELECT COUNT(*) 
      FROM books
      LEFT JOIN categories ON books.category_id = categories.id
      LEFT JOIN authors ON books.author_id = authors.id
      ${whereClause}
    `;
    const countRes = await db.query(countQuery, values);
    const total = parseInt(countRes.rows[0].count) || 0;
    const totalPages = Math.ceil(total / limit) || 1;

    // 2. Xác định sắp xếp
    let orderClause = " ORDER BY books.created_at DESC";
    if (sort === "oldest") {
      orderClause = " ORDER BY books.created_at ASC";
    } else if (sort === "newest") {
      orderClause = " ORDER BY books.created_at DESC";
    } else if (sort === "title_asc") {
      orderClause = " ORDER BY books.title ASC";
    } else if (sort === "title_desc") {
      orderClause = " ORDER BY books.title DESC";
    } else if (sort === "most_read") {
      orderClause = " ORDER BY (SELECT COUNT(*) FROM bookmarks WHERE book_id = books.id) DESC, books.created_at DESC";
    }

    // 3. Truy vấn danh sách sách của trang hiện tại
    const queryText = `
      SELECT books.*, categories.name AS category_name, authors.name AS author_name
      FROM books
      LEFT JOIN categories ON books.category_id = categories.id
      LEFT JOIN authors ON books.author_id = authors.id
      ${whereClause}
      ${orderClause}
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;
    const queryValues = [...values, limit, offset];
    const result = await db.query(queryText, queryValues);

    const booksWithUrls = await Promise.all(
      result.rows.map(async (book) => {
        return {
          ...book,
          cover_url: book.cover_image_key
            ? await getReadUrl(book.cover_image_key)
            : null,
        };
      }),
    );

    res.json({
      success: true,
      books: booksWithUrls,
      pagination: {
        total,
        page,
        limit,
        totalPages,
      },
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
  const userId = req.user?.userId;

  try {
    const queryText = `SELECT b.*, c.name as category_name, a.name as author_name 
          FROM books b 
          LEFT JOIN categories c ON b.category_id = c.id 
          LEFT JOIN authors a ON b.author_id = a.id
          WHERE b.id = $1`;
    const result = await db.query(queryText, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy sách với ID đã cho.",
      });
    }

    const book = result.rows[0];

    const bookWithUrls = {
      ...book,
      cover_url: book.cover_image_key
        ? await getReadUrl(book.cover_image_key)
        : null,
    };

    // Get read count and favorite count from bookmarks
    const readCountResult = await db.query("SELECT COUNT(*) as count FROM bookmarks WHERE book_id = $1", [id]);
    const favoriteCountResult = await db.query("SELECT COUNT(*) as count FROM bookmarks WHERE book_id = $1 AND is_favorite = true", [id]);
    
    bookWithUrls.read_count = parseInt(readCountResult.rows[0].count) || 0;
    bookWithUrls.favorite_count = parseInt(favoriteCountResult.rows[0].count) || 0;

    let favoriteStatus = false;
    // Favorite status
    if (userId) {
      const favResult = await db.query(
        "SELECT is_favorite FROM bookmarks WHERE user_id = $1 AND book_id = $2",
        [userId, id],
      );
      favoriteStatus = favResult.rows[0]?.is_favorite || false;
    }

    // Get related books
    let relatedBooks = [];
    if (book.author_id) {
      const relatedResult = await db.query(
        "SELECT id, title, cover_image_key FROM books WHERE author_id = $1 AND id != $2 LIMIT 5",
        [book.author_id, id]
      );
      
      relatedBooks = await Promise.all(
        relatedResult.rows.map(async (rb) => {
          const rbReadCount = await db.query("SELECT COUNT(*) as count FROM bookmarks WHERE book_id = $1", [rb.id]);
          return {
            ...rb,
            cover_url: rb.cover_image_key ? await getReadUrl(rb.cover_image_key) : null,
            read_count: parseInt(rbReadCount.rows[0].count) || 0
          };
        })
      );
    }

    res.json({
      success: true,
      book: bookWithUrls,
      favoriteStatus,
      relatedBooks,
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

// GET /api/books/read/:id -  Đọc sách (phân đoạn 3 trang & watermark)
export const readBook = async (req, res) => {
  const { id } = req.params;
  const startPage = parseInt(req.query.startPage) || 1; // 1-based index (Ví dụ: 5)
  const userId = req.user ? req.user.userId : null;

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: "Vui lòng đăng nhập để đọc sách.",
    });
  }

  // Số lượng trang của mỗi phân đoạn (Chunk)
  const CHUNK_SIZE = 3; 

  try {
    // 1. Kiểm tra sự tồn tại của sách & Phân quyền Premium (giống hệt code cũ)
    const bookRes = await db.query("SELECT * FROM books WHERE id = $1", [id]);
    if (bookRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Sách không tồn tại" });
    }
    const book = bookRes.rows[0];

    if (book.is_premium) {
      const subRes = await db.query(
        "SELECT * FROM subscriptions WHERE user_id = $1 AND status = 'active' AND expiry_date > NOW()",
        [userId]
      );
      if (subRes.rows.length === 0) {
        return res.status(403).json({ success: false, message: "Cần nâng cấp gói VIP để xem nội dung Premium" });
      }
    }

    // Lấy email của user từ database
    const userRes = await db.query("SELECT email FROM users WHERE id = $1", [userId]);
    const userEmail = userRes.rows[0]?.email || "Độc giả VIP";

    // 2. Lấy dữ liệu file PDF gốc từ Cache hoặc S3
    let pdfBuffer = pdfCache.get(id);
    if (!pdfBuffer) {
      const command = new GetObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: book.book_file_key,
      });
      const s3Response = await s3Client.send(command);
      pdfBuffer = await streamToBuffer(s3Response.Body);
      pdfCache.set(id, pdfBuffer);
    }

    // 3. Khởi tạo pdf-lib để trích xuất phân đoạn
    const srcDoc = await PDFDocument.load(pdfBuffer);
    const pdfTotalPages = srcDoc.getPageCount();
    
    // Xác định khoảng trang cắt hợp lệ
    const totalPages = book.total_pages || pdfTotalPages || 1;
    const endPage = Math.min(startPage + CHUNK_SIZE - 1, totalPages);
    
    if (startPage < 1 || startPage > totalPages) {
      return res.status(400).json({ success: false, message: "Trang yêu cầu không hợp lệ" });
    }

    const chunkDoc = await PDFDocument.create();

    // Tạo danh sách trang cần cắt (0-based)
    const pageIndices = [];
    for (let i = startPage - 1; i < endPage; i++) {
      pageIndices.push(i);
    }

    // Copy các trang sang PDF mới
    const copiedPages = await chunkDoc.copyPages(srcDoc, pageIndices);
    copiedPages.forEach((page) => chunkDoc.addPage(page));

    // 4. Vẽ Watermark chìm (3 vị trí) lên toàn bộ các trang của phân đoạn
    const font = await chunkDoc.embedFont(StandardFonts.HelveticaBold);
    const pages = chunkDoc.getPages();
    const watermarkText = `E-BOOK VIP - ${userEmail}`;

    pages.forEach((activePage) => {
      const { width, height } = activePage.getSize();
      
      const watermarkPositions = [
        { x: width * 0.1, y: height * 0.75 },
        { x: width * 0.15, y: height * 0.45 },
        { x: width * 0.2, y: height * 0.15 }
      ];

      watermarkPositions.forEach((pos) => {
        activePage.drawText(watermarkText, {
          x: pos.x,
          y: pos.y,
          size: Math.min(width, height) / 18,
          font: font,
          color: rgb(0.7, 0.7, 0.7),
          opacity: 0.15,
          rotate: degrees(30),
        });
      });
    });

    // 5. Lưu và trả dữ liệu nhị phân về cho FE
    const finalPdfBytes = await chunkDoc.save();
    
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "inline");
    res.send(Buffer.from(finalPdfBytes));

  } catch (error) {
    console.error("Lỗi khi xử lý cắt trang PDF:", error);
    res.status(500).json({ success: false, message: "Lỗi hệ thống khi tải trang sách" });
  }
};

// GET /api/books/:id/bookmark - Lấy trang đã lưu
export const getBookmark = async (req, res) => {
  const { id } = req.params; // book_id
  const userId = req.user.userId;
  try {
    const result = await db.query(
      "SELECT last_page FROM bookmarks WHERE user_id = $1 AND book_id = $2",
      [userId, id],
    );
    res.json({ success: true, last_page: result.rows[0]?.last_page || 1 });
  } catch (error) {
    res.status(500).json({ message: "Lỗi khi lấy bookmark" });
  }
};

// POST /api/books/:id/bookmark - Cập nhật trang đã lưu
export const updateBookmark = async (req, res) => {
  const { id } = req.params;
  const { pageNumber } = req.body;
  const userId = req.user.userId;
  try {
    const queryText = `
      INSERT INTO bookmarks (user_id, book_id, last_page, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (user_id, book_id) 
      DO UPDATE SET last_page = EXCLUDED.last_page, updated_at = NOW();
    `;
    await db.query(queryText, [userId, id, pageNumber]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: "Lỗi khi lưu bookmark" });
  }
};

// GET /api/books/:id/annotations - Lấy tất cả ghi chú của người dùng cho một cuốn sách
export const getAnnotations = async (req, res) => {
  const { id } = req.params; // bookId
  const userId = req.user.userId;

  try {
    const result = await db.query(
      "SELECT * FROM annotations WHERE user_id = $1 AND book_id = $2",
      [userId, id],
    );
    res.json({ success: true, annotations: result.rows });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Lỗi khi lấy ghi chú", error: error.message });
  }
};

// POST /api/books/:id/annotations - Tạo ghi chú mới cho một cuốn sách
export const createAnnotation = async (req, res) => {
  const { id } = req.params; // bookId
  const { pageIndex, content, selectionRegion } = req.body;
  const userId = req.user.userId;

  try {
    const queryText = `
      INSERT INTO annotations (user_id, book_id, page_index, content, "selectionRegion")
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `;
    const result = await db.query(queryText, [
      userId,
      id,
      pageIndex,
      content,
      JSON.stringify(selectionRegion),
    ]);
    res.status(201).json({ success: true, annotation: result.rows[0] });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Lỗi khi lưu ghi chú", error: error.message });
  }
};

// DELETE /api/books/:id/annotations/:annId - Xóa ghi chú
export const deleteAnnotation = async (req, res) => {
  const { annId } = req.params; // Lấy ID ghi chú từ URL
  const userId = req.user.userId;

  try {
    const result = await db.query(
      "DELETE FROM annotations WHERE id = $1 AND user_id = $2 RETURNING *",
      [annId, userId],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy ghi chú hoặc không có quyền xóa",
      });
    }

    res.json({ success: true, message: "Đã xóa ghi chú thành công" });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Lỗi server khi xóa ghi chú" });
  }
};

// GET /api/books/library - Lấy thư viện sách của người dùng
export const getUserLibrary = async (req, res) => {
  try {
    const userId = req.user.userId;
    const query = `
      SELECT b.*, bm.last_page, bm.is_favorite, bm.updated_at, a.name AS author_name
      FROM books b
      JOIN bookmarks bm ON b.id = bm.book_id
      LEFT JOIN authors a ON b.author_id = a.id
      WHERE bm.user_id = $1
      ORDER BY bm.updated_at DESC
    `;
    const { rows } = await db.query(query, [userId]);

    const booksWithUrls = await Promise.all(
      rows.map(async (book) => ({
        ...book,
        cover_url: book.cover_image_key
          ? await getReadUrl(book.cover_image_key)
          : null,
      })),
    );

    // Trả về theo cấu trúc giống Homepage để Frontend dễ xử lý
    res.json({ success: true, books: booksWithUrls });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/books/:bookId/toggle-favorite - Thêm hoặc xóa sách khỏi danh sách yêu thích của người dùng
export const toggleFavorite = async (req, res) => {
  const { bookId } = req.params;
  const userId = req.user.userId;
  try {
    const query = `
            INSERT INTO bookmarks (user_id, book_id, is_favorite)
            VALUES ($1, $2, true)
            ON CONFLICT (user_id, book_id) 
            DO UPDATE SET is_favorite = NOT bookmarks.is_favorite
            RETURNING is_favorite;
        `;
    const { rows } = await db.query(query, [userId, bookId]);
    res.json({ isFavorite: rows[0].is_favorite });
  } catch (error) {
    res.status(500).json({ message: "Lỗi cập nhật yêu thích" });
  }
};

// POST /api/books/:id/reviews - Thêm review và tặng điểm
export const addReview = async (req, res) => {
  const { id } = req.params; // bookId
  const { content, rating } = req.body;
  const userId = req.user.userId;

  if (!rating || rating < 1 || rating > 5) {
    return res.status(400).json({ success: false, message: "Số sao không hợp lệ (1-5)." });
  }

  try {
    await db.query("BEGIN");

    // Lấy cấu hình hệ thống
    const configQuery = await db.query(
      "SELECT key, value FROM system_settings WHERE key IN ('reward_points', 'moderation')"
    );
    const configs = {};
    configQuery.rows.forEach(r => {
      configs[r.key] = r.value;
    });

    const minLength = configs.moderation?.review_min_length !== undefined ? configs.moderation.review_min_length : 10;
    const maxLength = configs.moderation?.review_max_length !== undefined ? configs.moderation.review_max_length : 500;
    const reviewPoints = configs.reward_points?.review !== undefined ? configs.reward_points.review : 30;

    const trimmedContent = (content || "").trim();
    if (trimmedContent.length < minLength) {
      await db.query("ROLLBACK");
      return res.status(400).json({ success: false, message: `Nội dung đánh giá phải dài ít nhất ${minLength} ký tự.` });
    }
    if (trimmedContent.length > maxLength) {
      await db.query("ROLLBACK");
      return res.status(400).json({ success: false, message: `Nội dung đánh giá không được vượt quá ${maxLength} ký tự.` });
    }

    // Thêm review (Nếu đã review rồi, UNIQUE constraint sẽ quăng lỗi)
    const reviewQuery = `
      INSERT INTO reviews (user_id, book_id, rating, content)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;
    const reviewResult = await db.query(reviewQuery, [userId, id, rating, trimmedContent]);

    // Thưởng điểm cho người dùng
    await db.query("UPDATE users SET points = points + $1 WHERE id = $2", [reviewPoints, userId]);

    await db.query("COMMIT");

    // Lấy thông tin user để trả về FE hiển thị ngay
    const userRes = await db.query("SELECT username FROM users WHERE id = $1", [userId]);
    
    res.status(201).json({ 
      success: true, 
      message: `Đánh giá thành công! Bạn nhận được +${reviewPoints} Điểm.`,
      review: {
        ...reviewResult.rows[0],
        username: userRes.rows[0].username
      }
    });
  } catch (error) {
    await db.query("ROLLBACK");
    // Lỗi vi phạm UNIQUE constraint trong PostgreSQL (mã lỗi 23505)
    if (error.code === '23505') {
      return res.status(400).json({ success: false, message: "Bạn đã đánh giá cuốn sách này rồi." });
    }
    console.error("Lỗi khi đánh giá:", error);
    res.status(500).json({ success: false, message: "Lỗi server khi gửi đánh giá." });
  }
};

// GET /api/books/:id/reviews - Lấy danh sách review
export const getReviews = async (req, res) => {
  const { id } = req.params;

  try {
    const query = `
      SELECT r.*, u.username
      FROM reviews r
      JOIN users u ON r.user_id = u.id
      WHERE r.book_id = $1
      ORDER BY r.created_at DESC
    `;
    const result = await db.query(query, [id]);
    res.json({ success: true, reviews: result.rows });
  } catch (error) {
    console.error("Lỗi lấy danh sách đánh giá:", error);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

// POST /api/books/:id/read-time - Cập nhật thời gian đọc và tích lũy điểm khi hoàn thành sách
export const updateReadTime = async (req, res) => {
  const { id } = req.params; // bookId
  const { page_index, seconds } = req.body;
  const userId = req.user.userId;

  if (page_index === undefined || seconds === undefined || seconds <= 0) {
    return res.status(400).json({ success: false, message: "Dữ liệu gửi lên không hợp lệ." });
  }

  try {
    await db.query("BEGIN");

    // 1. Lấy thông tin sách để có total_pages
    const bookRes = await db.query("SELECT total_pages FROM books WHERE id = $1", [id]);
    if (bookRes.rows.length === 0) {
      await db.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "Không tìm thấy cuốn sách này." });
    }
    const book = bookRes.rows[0];
    const totalPages = book.total_pages || 1;

    // 1.5. Lấy cấu hình hệ thống cho phần thưởng đọc sách
    const configQuery = await db.query(
      "SELECT value FROM system_settings WHERE key = 'reading_rewards'"
    );
    const readingConfig = configQuery.rows[0]?.value || {
      completion_points: 50,
      required_percent: 80,
      page_read_seconds: 30
    };
    // Force 30s as requested by user
    const requiredSeconds = readingConfig.page_read_seconds || 30;
    const requiredPercent = readingConfig.required_percent !== undefined ? readingConfig.required_percent : 80;
    const completionPoints = readingConfig.completion_points !== undefined ? readingConfig.completion_points : 50;



    // 2. Lấy bản ghi bookmarks hoặc tạo mới
    const bookmarkRes = await db.query(
      "SELECT pages_read_time, is_completed FROM bookmarks WHERE user_id = $1 AND book_id = $2",
      [userId, id]
    );

    let pagesReadTime = {};
    let isCompleted = false;

    if (bookmarkRes.rows.length > 0) {
      pagesReadTime = bookmarkRes.rows[0].pages_read_time || {};
      isCompleted = bookmarkRes.rows[0].is_completed || false;
    } else {
      // Nếu chưa có bookmark, tạo một dòng mới mặc định
      await db.query(
        "INSERT INTO bookmarks (user_id, book_id, last_page, pages_read_time, is_completed) VALUES ($1, $2, 1, $3, false)",
        [userId, id, JSON.stringify(pagesReadTime)]
      );
    }

    // 3. Cộng dồn giây vào trang tương ứng
    const currentPageSeconds = (pagesReadTime[page_index] || 0) + seconds;
    pagesReadTime[page_index] = currentPageSeconds;

    // 4. Đếm số trang đã đọc được >= requiredSeconds giây
    let completedPagesCount = 0;
    Object.keys(pagesReadTime).forEach((key) => {
      if (pagesReadTime[key] >= requiredSeconds) {
        completedPagesCount++;
      }
    });

    let awardGranted = false;
    let newPoints = 0;

    // 5. Kiểm tra điều kiện hoàn thành sách (>= requiredPercent total_pages)
    const readPercentage = (completedPagesCount / totalPages) * 100;
    if (!isCompleted && readPercentage >= requiredPercent) {
      isCompleted = true;
      // Cộng completionPoints điểm cho user
      const updatePointsRes = await db.query(
        "UPDATE users SET points = points + $1 WHERE id = $2 RETURNING points",
        [completionPoints, userId]
      );
      newPoints = updatePointsRes.rows[0]?.points || 0;
      awardGranted = true;

      // Cập nhật lại bookmark hoàn thành
      await db.query(
        "UPDATE bookmarks SET pages_read_time = $1, is_completed = true, completed_at = NOW(), updated_at = NOW() WHERE user_id = $2 AND book_id = $3",
        [JSON.stringify(pagesReadTime), userId, id]
      );
    } else {
      // Cập nhật lại bookmark thông thường
      await db.query(
        "UPDATE bookmarks SET pages_read_time = $1, updated_at = NOW() WHERE user_id = $2 AND book_id = $3",
        [JSON.stringify(pagesReadTime), userId, id]
      );
    }

    await db.query("COMMIT");

    res.json({
      success: true,
      pages_read_time: pagesReadTime,
      is_completed: isCompleted,
      awardGranted,
      newPoints: awardGranted ? newPoints : undefined,
      message: awardGranted ? `Chúc mừng! Bạn đã hoàn thành ${requiredPercent}% cuốn sách và được cộng ${completionPoints} điểm thưởng.` : undefined
    });
  } catch (error) {
    await db.query("ROLLBACK");
    console.error("Lỗi khi cập nhật thời gian đọc:", error);
    res.status(500).json({ success: false, message: "Lỗi hệ thống khi cập nhật thời gian đọc." });
  }
};

// GET /api/books/recently-added - Lấy 10 sách mới thêm gần nhất
export const getRecentlyAdded = async (req, res) => {
  try {
    const query = `
      SELECT b.*, c.name AS category_name, a.name AS author_name,
             (SELECT COALESCE(AVG(rating), 0)::float FROM reviews WHERE book_id = b.id) AS avg_rating
      FROM books b
      LEFT JOIN categories c ON b.category_id = c.id
      LEFT JOIN authors a ON b.author_id = a.id
      ORDER BY b.created_at DESC
      LIMIT 10
    `;
    const { rows } = await db.query(query);

    const booksWithUrls = await Promise.all(
      rows.map(async (book) => ({
        ...book,
        cover_url: book.cover_image_key
          ? await getReadUrl(book.cover_image_key)
          : null,
      }))
    );

    res.json({ success: true, books: booksWithUrls });
  } catch (error) {
    console.error("Lỗi getRecentlyAdded:", error);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

// GET /api/books/most-read - Lấy 10 sách đọc nhiều nhất
export const getMostRead = async (req, res) => {
  try {
    const query = `
      SELECT b.*, c.name AS category_name, a.name AS author_name,
             (SELECT COALESCE(AVG(rating), 0)::float FROM reviews WHERE book_id = b.id) AS avg_rating,
             (SELECT COUNT(*) FROM bookmarks WHERE book_id = b.id) AS read_count
      FROM books b
      LEFT JOIN categories c ON b.category_id = c.id
      LEFT JOIN authors a ON b.author_id = a.id
      ORDER BY read_count DESC
      LIMIT 10
    `;
    const { rows } = await db.query(query);

    const booksWithUrls = await Promise.all(
      rows.map(async (book) => ({
        ...book,
        cover_url: book.cover_image_key
          ? await getReadUrl(book.cover_image_key)
          : null,
      }))
    );

    res.json({ success: true, books: booksWithUrls });
  } catch (error) {
    console.error("Lỗi getMostRead:", error);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

// GET /api/books/continue-reading - Lấy tối đa 5 sách đang đọc dở của người dùng
export const getContinueReading = async (req, res) => {
  const userId = req.user.userId;
  try {
    const query = `
      SELECT b.*, bm.last_page, c.name AS category_name, a.name AS author_name,
             (SELECT COALESCE(AVG(rating), 0)::float FROM reviews WHERE book_id = b.id) AS avg_rating
      FROM bookmarks bm
      JOIN books b ON bm.book_id = b.id
      LEFT JOIN categories c ON b.category_id = c.id
      LEFT JOIN authors a ON b.author_id = a.id
      WHERE bm.user_id = $1 AND bm.is_completed = false AND bm.last_page > 1
      ORDER BY bm.updated_at DESC
      LIMIT 5
    `;
    const { rows } = await db.query(query, [userId]);

    const booksWithUrls = await Promise.all(
      rows.map(async (book) => ({
        ...book,
        cover_url: book.cover_image_key
          ? await getReadUrl(book.cover_image_key)
          : null,
      }))
    );

    res.json({ success: true, books: booksWithUrls });
  } catch (error) {
    console.error("Lỗi getContinueReading:", error);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};


