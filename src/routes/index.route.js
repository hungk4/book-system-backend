import { Router } from "express";
import authRoutes from "./auth.routes.js";
import bookRoutes from "./book.routes.js";
import categoryRoutes from "./category.routes.js";

import db from "../config/db.js";


const router = Router();

router.use("/auth", authRoutes);
router.use('/books', bookRoutes); 
router.use('/categories', categoryRoutes);


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
