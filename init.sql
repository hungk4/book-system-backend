-- Xóa các bảng cũ theo thứ tự ngược lại của sự phụ thuộc
DROP TABLE IF EXISTS "system_settings" CASCADE;
DROP TABLE IF EXISTS "reviews" CASCADE;
DROP TABLE IF EXISTS "bookmarks" CASCADE;
DROP TABLE IF EXISTS "annotations" CASCADE;
DROP TABLE IF EXISTS "payments" CASCADE;
DROP TABLE IF EXISTS "subscriptions" CASCADE;
DROP TABLE IF EXISTS "books" CASCADE;
DROP TABLE IF EXISTS "users" CASCADE;
DROP TABLE IF EXISTS "categories" CASCADE;
DROP TABLE IF EXISTS "authors" CASCADE;

-- Bảng CATEGORIES (Thể loại)
CREATE TABLE "categories" (
    "id" SERIAL PRIMARY KEY,
    "name" VARCHAR(255) NOT NULL UNIQUE
);

-- Bảng AUTHORS (Tác giả)
CREATE TABLE "authors" (
    "id" SERIAL PRIMARY KEY,
    "name" VARCHAR(255) NOT NULL UNIQUE,
    "bio" TEXT NULL
);

-- Bảng USERS (Người dùng)
-- (Đã cập nhật để hỗ trợ Google/Facebook)
CREATE TABLE "users" (
    "id" SERIAL PRIMARY KEY,
    "email" VARCHAR(255) NOT NULL UNIQUE,
    "username" VARCHAR(255) NOT NULL,
    
    -- SỬA ĐỔI 1: Cho phép "password_hash" được rỗng (NULL)
    -- Lý do: User đăng nhập bằng Google/Facebook sẽ không có mật khẩu
    "password_hash" VARCHAR(255) NULL, 
    
    "role" VARCHAR(50) NOT NULL DEFAULT 'user',
    "created_at" TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),

    -- THÊM MỚI 1: Cột để lưu Google ID (phải là UNIQUE)
    "google_id" VARCHAR(255) NULL UNIQUE,

    -- THÊM MỚI 2: Cột để lưu Facebook ID (phải là UNIQUE)
    -- "facebook_id" VARCHAR(255) NULL UNIQUE,

    -- THÊM MỚI 3: Hệ thống Điểm danh (Gamification)
    "points" INTEGER DEFAULT 0,
    "streak_count" INTEGER DEFAULT 0,
    "last_checkin_date" DATE NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',

    CONSTRAINT "users_role_check" CHECK ("role" IN ('user', 'admin'))
);

-- Bảng BOOKS (Sách)
CREATE TABLE "books" (
    "id" SERIAL PRIMARY KEY,
    "title" VARCHAR(255) NOT NULL,
    "author_id" INTEGER NULL,
    "description" TEXT NULL,
    "cover_image_key" VARCHAR(255) NULL,
    "book_file_key" VARCHAR(255) NOT NULL,
    "is_premium" BOOLEAN NOT NULL DEFAULT false,
    "category_id" INTEGER NULL,
    "created_at" TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    
    CONSTRAINT "books_category_id_foreign"
        FOREIGN KEY ("category_id")
        REFERENCES "categories"("id")
        ON DELETE SET NULL,
    CONSTRAINT "books_author_id_foreign"
        FOREIGN KEY ("author_id")
        REFERENCES "authors"("id")
        ON DELETE SET NULL
);

ALTER TABLE "books" ADD COLUMN "total_pages" INTEGER DEFAULT 0;

-- Bảng SUBSCRIPTIONS (Trạng thái Hội viên)
CREATE TABLE "subscriptions" (
    "id" SERIAL PRIMARY KEY,
    "user_id" INTEGER NOT NULL,
    "start_date" TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    "expiry_date" TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'active',
    
    CONSTRAINT "subscriptions_user_id_foreign"
        FOREIGN KEY ("user_id")
        REFERENCES "users"("id")
        ON DELETE CASCADE,
    CONSTRAINT "subscriptions_status_check" CHECK ("status" IN ('active', 'expired', 'cancelled'))
);

-- Bảng PAYMENTS (Lịch sử Giao dịch)
CREATE TABLE "payments" (
    "id" SERIAL PRIMARY KEY,
    "payment_id" VARCHAR(255) NOT NULL UNIQUE, 
    "user_id" INTEGER NOT NULL,
    "subscription_id" INTEGER NOT NULL,
    "amount" DECIMAL(10, 2) NOT NULL,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'VND',
    "status" VARCHAR(50) NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    
    CONSTRAINT "payments_user_id_foreign"
        FOREIGN KEY ("user_id")
        REFERENCES "users"("id")
        ON DELETE RESTRICT,
    CONSTRAINT "payments_subscription_id_foreign"
        FOREIGN KEY ("subscription_id")
        REFERENCES "subscriptions"("id")
        ON DELETE RESTRICT,
    CONSTRAINT "payments_status_check" CHECK ("status" IN ('succeeded', 'failed', 'pending'))
);

-- Bảng BOOKMARKS (Đánh dấu trang)
CREATE TABLE "bookmarks" (
    "id" SERIAL PRIMARY KEY,
    "user_id" INTEGER NOT NULL,
    "book_id" INTEGER NOT NULL,
    "last_page" INTEGER DEFAULT 1,
    "updated_at" TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT "bookmarks_user_id_foreign" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
    CONSTRAINT "bookmarks_book_id_foreign" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE,
    UNIQUE("user_id", "book_id") -- Mỗi user chỉ có 1 bookmark mỗi cuốn sách
);
ALTER TABLE "bookmarks" ADD COLUMN "is_favorite" BOOLEAN DEFAULT FALSE;

-- Bảng ANNOTATIONS (Lưu Highlight và Ghi chú)
CREATE TABLE "annotations" (
    "id" SERIAL PRIMARY KEY,
    "user_id" INTEGER NOT NULL,
    "book_id" INTEGER NOT NULL,
    "page_index" INTEGER NOT NULL, -- Trang chứa highlight (bắt đầu từ 0)
    "content" TEXT,                -- Nội dung ghi chú người dùng nhập
    "selectionRegion" JSONB NOT NULL,     -- Tọa độ vùng bôi đen (lưu dưới dạng JSON)
    "created_at" TIMESTAMP(0) WITHOUT TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT "annotations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
    CONSTRAINT "annotations_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE
);

-- ví dụ dữ liệu  selectionRegion
-- {
--   "pageIndex": 0,
--   "left": 10.5,       // Vị trí bắt đầu từ lề trái (%)
--   "top": 15.2,        // Vị trí bắt đầu từ lề trên (%)
--   "width": 85.0,      // Độ rộng vùng bôi đen (%)
--   "height": 5.8,       // Độ cao vùng bôi đen (%)
--   "rects": [          // Danh sách các dòng chữ được chọn
--     { "top": 15.2, "left": 10.5, "width": 85.0, "height": 2.5 },
--     { "top": 18.5, "left": 10.5, "width": 45.2, "height": 2.5 }
--   ]
-- }

-- THÊM MỚI 5: Bảng REVIEWS (Đánh giá sách)
CREATE TABLE "reviews" (
    "id" SERIAL PRIMARY KEY,
    "user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "book_id" INTEGER NOT NULL REFERENCES "books"("id") ON DELETE CASCADE,
    
    "rating" INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5), -- Chấm điểm 1 đến 5 sao
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- RÀNG BUỘC CỰC KỲ QUAN TRỌNG: 1 User chỉ được review 1 Cuốn sách 1 lần duy nhất
    UNIQUE("user_id", "book_id") 
);

-- THÊM MỚI 6: Bảng SYSTEM_SETTINGS (Cấu hình hệ thống động)
CREATE TABLE "system_settings" (
    "key" VARCHAR(255) PRIMARY KEY,
    "value" JSONB NOT NULL,
    "description" TEXT NULL,
    "updated_at" TIMESTAMP DEFAULT NOW()
);

-- Khởi tạo cấu hình mặc định ban đầu
-- reward_points: Lưu trữ số điểm check-in và viết đánh giá.
INSERT INTO "system_settings" ("key", "value", "description") VALUES
('reward_points', '{"checkin": 5, "review": 20}', 'Cấu hình điểm thưởng nhận được khi check-in và viết review')
ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value";

-- streak_milestones: Mảng danh sách các mốc ngày streak và điểm thưởng.
INSERT INTO "system_settings" ("key", "value", "description") VALUES
('streak_milestones', '[{"days": 7, "bonus": 30}, {"days": 30, "bonus": 100}]', 'Số ngày streak mốc thưởng và điểm thưởng tương ứng')
ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value";

-- reward_shop: Tỉ lệ đổi điểm sang Premium và danh sách các phần quà đổi điểm.
INSERT INTO "system_settings" ("key", "value", "description") VALUES
('reward_shop', '{"prizes": [{"id": "pkg_premium_3d", "days": 3, "name": "Gói Premium 3 Ngày", "points": 80}, {"id": "pkg_premium_7d", "days": 7, "name": "Gói Premium 7 Ngày", "points": 150}, {"id": "pkg_premium_30d", "days": 30, "name": "Gói Premium 30 Ngày", "points": 500}]}', 'Cấu hình đổi quà: danh sách các gói ngày Premium')
ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value";

-- premium_packages: Danh sách các gói Premium
INSERT INTO "system_settings" ("key", "value", "description") VALUES
('premium_packages', '[{"id": "prem_1m", "name": "Gói 1 Tháng", "price": 50000, "description": "Xem đầy đủ kho sách trong 30 ngày.", "duration_months": 1}, {"id": "prem_3m", "name": "Gói 3 Tháng", "price": 120000, "description": "Tiết kiệm 20%.", "duration_months": 3}, {"id": "prem_1y", "name": "Gói 1 Năm", "price": 400000, "description": "Tiết kiệm hơn 30%.", "duration_months": 12}]', 'Danh sách các gói Premium để người dùng mua bằng tiền mặt')
ON CONFLICT ("key") DO NOTHING;

-- moderation: Cấu hình kiểm duyệt.
INSERT INTO "system_settings" ("key", "value", "description") VALUES
('moderation', '{"review_max_length": 500, "review_min_length": 10}', 'Cấu hình kiểm duyệt: độ dài tối thiểu/tối đa của một nhận xét')
ON CONFLICT ("key") DO NOTHING;

--  Bổ sung các trường phục vụ tính năng tặng điểm khi đọc sách
ALTER TABLE "bookmarks" ADD COLUMN IF NOT EXISTS "pages_read_time" JSONB DEFAULT '{}'::jsonb;
ALTER TABLE "bookmarks" ADD COLUMN IF NOT EXISTS "is_completed" BOOLEAN DEFAULT FALSE;
ALTER TABLE "bookmarks" ADD COLUMN IF NOT EXISTS "completed_at" TIMESTAMP NULL;

-- INSERT cấu hình mặc định cho phần thưởng đọc sách
INSERT INTO "system_settings" ("key", "value", "description") VALUES
('reading_rewards', '{"completion_points": 50, "required_percent": 80, "page_read_seconds": 30}', 'Cấu hình điểm thưởng nhận được khi hoàn thành sách, tỷ lệ hoàn thành yêu cầu và số giây tối thiểu đọc mỗi trang')
ON CONFLICT ("key") DO NOTHING;

