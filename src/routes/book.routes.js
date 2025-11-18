import { Router } from 'express';
import { getUploadUrlHandler, createBook } from '../controllers/book.controller.js';
import { verifyToken } from '../middleware/auth.middleware.js';

const router = Router();


// POST /api/books/generate-upload-link
router.post('/generate-upload-link', verifyToken, getUploadUrlHandler);


// POST /api/books
router.post('/', verifyToken, createBook);

export default router;