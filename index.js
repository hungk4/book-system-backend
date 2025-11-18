import "dotenv/config";
import express from "express";
import cors from "cors";
import passport from "passport";


import "./src/config/passport.js"; // Cấu hình passport (Google, Facebook strategies)

import mainApiRouter from "./src/routes/index.route.js"; 


const app = express();

app.use(cors()); // Cho phép fe gọi API
app.use(express.json());

app.use(passport.initialize()); // Khởi tạo passport

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.use('/api', mainApiRouter);





const port = 5000;
app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
