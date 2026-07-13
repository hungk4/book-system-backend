import "dotenv/config";
import express from "express";
import cors from "cors";
import passport from "passport";
import cookieParser from "cookie-parser";

import "./src/config/passport.js"; // Cấu hình passport (Google, Facebook strategies)

import mainApiRouter from "./src/routes/index.route.js";

const app = express();

// Tin tưởng reverse proxy (Render) để lấy đúng giao thức https cho OAuth Callback
app.set("trust proxy", true);

const corsOptions = {
  origin: process.env.CLIENT_URL || "http://localhost:5173",
  // Cho phép trình duyệt gửi và nhận Cookie/Header xác thực
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.use(express.json());

app.use(passport.initialize()); // Khởi tạo passport

app.use(cookieParser());

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.use("/api", mainApiRouter);

const port = 5000;
app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
