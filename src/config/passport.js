import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
// import { Strategy as FacebookStrategy } from 'passport-facebook';
import db from "./db.js"; 


// Google OAuth Strategy
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/api/auth/google/callback"
},
  async (accessToken, refreshToken, profile, done) => {
    const { id: google_id, displayName: username, emails } = profile;
    const email = emails[0].value;

    try {
      // 1. Tìm user bằng Google ID trước
      let userResult = await db.query('SELECT * FROM users WHERE google_id = $1', [google_id]);

      if (userResult.rows.length > 0) {
        return done(null, userResult.rows[0]);
      }

      // 2. Nếu không tìm thấy, Tìm bằng email (để liên kết tài khoản)
      userResult = await db.query('SELECT * FROM users WHERE email = $1', [email]);

      if (userResult.rows.length > 0) {
        // Tìm thấy! User đã đăng ký bằng email/password trước đó
        const updateUserQuery = `UPDATE users SET
        google_id = $1 WHERE email = $2 RETURNING *`;

        const updateUser = await db.query(updateUserQuery, [google_id, email]);
        return done(null, updateUser.rows[0]);
      }

      // 3. Không thấy? Đây là user mới toanh
      const newUserQuery = `INSERT INTO users(username, email, google_id, role)
      VALUES ($1, $2, $3, 'user')
      RETURNING *`;
      const newUser = await db.query(newUserQuery, [username, email, google_id]);

      return done(null, newUser.rows[0]); // Báo thành công, trả về user mới tạo

    } catch (error) {
      return done(error, false); // Báo thất bại, có lỗi DB
    }
  }
));




// Facebook Strategy