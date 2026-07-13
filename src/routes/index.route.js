import { Router } from "express";
import { requireGateway } from "../middleware/auth.middleware.js";
import authRoutes from "./auth.routes.js";
import bookRoutes from "./book.routes.js";
import categoryRoutes from "./category.routes.js";
import authorRoutes from "./author.routes.js";
import paymentRoutes from "./payment.routes.js";
import userRoutes from "./user.routes.js";
import reviewRoutes from "./review.routes.js";
import settingRoutes from "./setting.routes.js";

import db from "../config/db.js";


const router = Router();

router.use(requireGateway);

router.use("/auth", authRoutes);
router.use('/books', bookRoutes); 
router.use('/categories', categoryRoutes);
router.use('/authors', authorRoutes);
router.use('/payments', paymentRoutes);
router.use('/users', userRoutes);
router.use('/reviews', reviewRoutes);
router.use('/settings', settingRoutes);


router.get("/test-db", async (req, res) => {
  try {
    const result = await db.query("SELECT NOW()");
    res.json({
      success: true,
      message: "Database connected successfully",
      db_time: result.rows[0].now,
    });
  } catch (error) {
    res.status(500).json({ message: "Database connection failed", error });
  }
});


export default router;
