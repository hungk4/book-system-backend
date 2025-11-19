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

// GET /api/books
router.get('/', getBooks);

// GET /api/books/:id
router.get('/:id', getBookDetail); 

// GET /api/books/read/:id
router.get('/read/:id', verifyToken, readBook); 
export default router;
