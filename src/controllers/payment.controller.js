import crypto from "crypto";
import dateFormat from "dateformat";
import querystring from "qs";
import { vnpayConfig } from "../config/vnpay.js";
import db from "../config/db.js";

export const createPaymentUrl = (req, res) => {
  let ipAddr =
    req.headers["x-forwarded-for"] ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress ||
    req.connection.socket.remoteAddress;

  let tmnCode = vnpayConfig.vnp_TmnCode;
  let secretKey = vnpayConfig.vnp_HashSecret;
  let vnpUrl = vnpayConfig.vnp_Url;
  let returnUrl = vnpayConfig.vnp_ReturnUrl;

  let date = new Date();
  let createDate = dateFormat(date, "yyyymmddHHmmss");

  let userId = req.user.userId;
  let months = req.body.months;
  let orderId = `${userId}_${months}_${dateFormat(date, "HHmmss")}`;

  const priceMap = { 1: 50000, 6: 250000, 12: 450000 };
  let amount = priceMap[months] || 0;
  if (amount <= 0) return res.status(400).json({ message: "Gói không hợp lệ" });
  let bankCode = req.body.bankCode;

  let orderInfo = req.body.orderDescription || "Thanh toan nang cap Premium";
  // let orderType = req.body.orderType || "other";
  let orderType = "250000"; // Thanh toán hóa đơn
  let locale = req.body.language || "vn";
  let currCode = "VND";

  let vnp_Params = {};
  vnp_Params["vnp_Version"] = "2.1.0";
  vnp_Params["vnp_Command"] = "pay";
  vnp_Params["vnp_TmnCode"] = tmnCode;
  vnp_Params["vnp_Locale"] = locale;
  vnp_Params["vnp_CurrCode"] = currCode;
  vnp_Params["vnp_TxnRef"] = orderId;
  vnp_Params["vnp_OrderInfo"] = orderInfo;
  vnp_Params["vnp_OrderType"] = orderType;
  vnp_Params["vnp_Amount"] = amount * 100;
  vnp_Params["vnp_ReturnUrl"] = returnUrl;
  vnp_Params["vnp_IpAddr"] = ipAddr;
  vnp_Params["vnp_CreateDate"] = createDate;
  if (bankCode !== null && bankCode !== "") {
    vnp_Params["vnp_BankCode"] = bankCode;
  }

  vnp_Params = sortObject(vnp_Params);

  let signData = querystring.stringify(vnp_Params, { encode: false });
  let hmac = crypto.createHmac("sha512", secretKey);
  let signed = hmac.update(Buffer.from(signData, "utf-8")).digest("hex");
  vnp_Params["vnp_SecureHash"] = signed;
  vnpUrl += "?" + querystring.stringify(vnp_Params, { encode: false });

  console.log("paymentUrl: ", vnpUrl)
  res.status(200).json({ paymentUrl: vnpUrl });
};

export const vnpayIpn = async (req, res) => {
  console.log("VNPay IPN called:", req.query);

  let vnp_Params = req.query;
  let secureHash = vnp_Params["vnp_SecureHash"];

  delete vnp_Params["vnp_SecureHash"];
  delete vnp_Params["vnp_SecureHashType"];

  vnp_Params = sortObject(vnp_Params);
  let secretKey = vnpayConfig.vnp_HashSecret;
  let signData = querystring.stringify(vnp_Params, { encode: false });
  let hmac = crypto.createHmac("sha512", secretKey);
  let signed = hmac.update(Buffer.from(signData, "utf-8")).digest("hex");

  if (secureHash === signed) {
    const orderId = vnp_Params["vnp_TxnRef"]; // {userId}_{months}_{timestamp}
    const rspCode = vnp_Params["vnp_ResponseCode"];
    const amount = vnp_Params["vnp_Amount"] / 100;
    const vnp_TransactionNo = vnp_Params["vnp_TransactionNo"];

    if (rspCode === "00") {
      const [userId, months] = orderId.split("_");

      try {
        // IPN có thể được VNPay gọi lại nhiều lần cho cùng một giao dịch (do mạng lag, hoặc timeout giả) gây trùng lặp cộng hạn hội viên
        const checkPayment = await db.query(
          "SELECT id FROM payments WHERE payment_id = $1",
          [vnp_TransactionNo]
        );

        if (checkPayment.rows.length > 0) {
          // Đã xử lý rồi thì báo VNPay là thành công luôn, không chạy logic cộng hạn nữa
          return res
            .status(200)
            .json({ RspCode: "00", Message: "Order already confirmed" });
        }

        await db.query("BEGIN");

        // 1. Tìm gói hội viên CÒN HẠN mới nhất của user này
        const lastSub = await db.query(
          `SELECT expiry_date FROM subscriptions 
                     WHERE user_id = $1 AND status = 'active' 
                     ORDER BY expiry_date DESC LIMIT 1`,
          [userId]
        );

        let startDate = new Date(); // Mặc định là hôm nay

        // Nếu tìm thấy gói cũ vẫn còn hạn, thì ngày bắt đầu gói mới = ngày hết hạn gói cũ
        if (lastSub.rows.length > 0) {
          let lastExpiry = new Date(lastSub.rows[0].expiry_date);
          if (lastExpiry > startDate) {
            startDate = lastExpiry;
          }
        }

        // 2. Tính ngày hết hạn mới
        const expiryDate = new Date(startDate);
        expiryDate.setMonth(expiryDate.getMonth() + parseInt(months));

        // 3. TẠO DÒNG MỚI trong bảng subscriptions
        const subResult = await db.query(
          `INSERT INTO subscriptions (user_id, start_date, expiry_date, status) 
                     VALUES ($1, $2, $3, 'active') RETURNING id`,
          [userId, startDate, expiryDate]
        );

        const subscriptionId = subResult.rows[0].id;

        // 4. Lưu lịch sử thanh toán
        await db.query(
          `INSERT INTO payments (payment_id, user_id, subscription_id, amount, status)
                     VALUES ($1, $2, $3, $4, 'succeeded')`,
          [vnp_TransactionNo, userId, subscriptionId, amount]
        );

        await db.query("COMMIT");

        res.status(200).json({ RspCode: "00", Message: "Success" });
      } catch (error) {
        await db.query("ROLLBACK");
        console.error("Lỗi cập nhật DB:", error);
        res.status(200).json({ RspCode: "99", Message: "Internal Error" });
      }
    } else {
      // Giao dịch thất bại tại VNPay
      res.status(200).json({ RspCode: "00", Message: "Success" });
    }
  } else {
    res.status(200).json({ RspCode: "97", Message: "Fail checksum" }); // Sai chữ ký
  }
};


function sortObject(obj) {
  let sorted = {};
  let keys = [];

  for (let key in obj) {
    if (obj.hasOwnProperty(key)) {
      keys.push(encodeURIComponent(key));
    }
  }

  keys.sort();

  for (let i = 0; i < keys.length; i++) {
    let currentKey = keys[i];
    let value = obj[currentKey];

    if (value !== null && value !== undefined && value !== "") {
      sorted[currentKey] = encodeURIComponent(value).replace(/%20/g, "+"); // Thay thế khoảng trắng bằng dấu +
    }
  }

  return sorted;
}
