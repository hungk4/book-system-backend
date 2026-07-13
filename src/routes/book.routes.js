import { Router } from "express";
import {
  getUploadUrlHandler,
  createBook,
  getBooks,
  getBookDetail,
  readBook,
  getBookmark,
  updateBookmark,
  getAnnotations,
  createAnnotation,
  deleteAnnotation,
  getUserLibrary,
  toggleFavorite,
  deleteBook,
  updateBook,
  addReview,
  getReviews,
  getDashboardStats,
  updateReadTime,
  getRecentlyAdded,
  getMostRead,
  getContinueReading,
} from "../controllers/book.controller.js";
import { verifyToken, verifyAdmin } from "../middleware/auth.middleware.js";

const router = Router();

// POST /api/books/generate-upload-link - Lấy presigned URL để upload file lên S3
router.post(
  "/generate-upload-link",
  verifyToken,
  verifyAdmin,
  getUploadUrlHandler
);

// POST /api/books - Tạo sách mới
router.post("/", verifyToken, verifyAdmin, createBook);

// DELETE /api/books/:id - Xóa sách
router.delete("/:id", verifyToken, verifyAdmin, deleteBook);

// PUT /api/books/:id - Cập nhật thông tin sách
router.put("/:id", verifyToken, verifyAdmin, updateBook);

// GET /api/books/stats - Lấy thống kê cho admin dashboard (Phải đặt trước /:id)
router.get("/stats", verifyToken, verifyAdmin, getDashboardStats);

// --- Public Routes ---
// GET /api/books - Lấy danh sách tất cả sách
router.get('/', getBooks);

// GET /api/books/recently-added - Lấy 10 sách mới thêm gần nhất
router.get('/recently-added', getRecentlyAdded);

// GET /api/books/most-read - Lấy 10 sách đọc nhiều nhất
router.get('/most-read', getMostRead);

// GET /api/books/continue-reading - Lấy tối đa 5 sách đang đọc dở (yêu cầu token)
router.get('/continue-reading', verifyToken, getContinueReading);

// GET /api/books/library - Lấy thư viện sách của người dùng
router.get('/library', verifyToken, getUserLibrary);

// GET /api/books/:id - Chi tiết sách
router.get('/:id', getBookDetail); 

// GET /api/books/read/:id - Đọc sách (yêu cầu xác thực)
router.get('/read/:id', verifyToken, readBook); 

// GET /api/books/:id/bookmark - Lấy bookmark của người dùng cho sách
router.get("/:id/bookmark", verifyToken, getBookmark);

// POST /api/books/:id/bookmark - Cập nhật bookmark của người dùng cho sách
router.post("/:id/bookmark", verifyToken, updateBookmark);

// POST /api/books/:id/read-time - Cập nhật thời gian đọc và tích lũy điểm khi hoàn thành sách
router.post("/:id/read-time", verifyToken, updateReadTime);

// GET /api/books/:id/annotations - Lấy tất cả ghi chú của người dùng cho một cuốn sách
router.get("/:id/annotations", verifyToken, getAnnotations);

// POST /api/books/:id/annotations - Tạo ghi chú mới cho một cuốn sách
router.post("/:id/annotations", verifyToken, createAnnotation);

// DELETE /api/books/:id/annotations/:annId - Xóa ghi chú
router.delete('/annotations/:annId', verifyToken, deleteAnnotation);


// POST /api/books/:bookId/toggle-favorite - Thêm hoặc xóa sách khỏi danh sách yêu thích của người dùng
router.post('/:bookId/toggle-favorite', verifyToken, toggleFavorite);

// GET /api/books/:id/reviews - Lấy tất cả review của sách
router.get('/:id/reviews', getReviews);

// POST /api/books/:id/reviews - Đăng review mới (cộng điểm)
router.post('/:id/reviews', verifyToken, addReview);

export default router;
