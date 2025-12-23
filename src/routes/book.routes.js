import { Router } from "express";
import {
  getUploadUrlHandler,
  createBook,
  getBooks,
  getBookDetail,
  readBook,
} from "../controllers/book.controller.js";
import { verifyToken , verifyAdmin} from "../middleware/auth.middleware.js";

const router = Router();

// --- Admin Routes ---
// POST /api/books/generate-upload-link
router.post(
  "/generate-upload-link",
  verifyToken,
  verifyAdmin,
  getUploadUrlHandler
);

// POST /api/books
router.post("/", verifyToken, verifyAdmin, createBook);


// --- Public Routes ---
// GET /api/books - Lấy danh sách tất cả sách
router.get('/', getBooks);

// GET /api/books/:id - Chi tiết sách
router.get('/:id', getBookDetail); 

// GET /api/books/read/:id - Đọc sách (yêu cầu xác thực)
// router.get('/read/:id', verifyToken, readBook); 
router.get('/read/:id', readBook); 
export default router;
