import {
  S3Client,
  ListBucketsCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Khởi tạo client S3
export const s3Client = new S3Client({
  region: process.env.S3_REGION || "auto",
  endpoint: process.env.S3_ENDPOINT, // ĐỂ TRỎ VỀ R2
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  },
});

/**
 * Hàm lấy link upload (Presigned URL)
 * @param {string} fileName - Tên file muốn lưu trên S3
 * @param {string} fileType - Loại file (ví dụ: 'application/pdf, image/jpeg')
 * @returns {Promise<string>} - Trả về link upload
 */
export const getUploadUrl = async (fileName, fileType) => {
  const command = new PutObjectCommand({
    Bucket: process.env.S3_BUCKET_NAME,
    Key: fileName,
    ContentType: fileType,
  });

  try {
    // Tạo link upload sống 5 phút
    const uploadUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 300,
    });
    return uploadUrl;
  } catch (error) {
    console.error("Lỗi khi tạo URL upload:", error);
    throw error;
  }
};

export const getReadUrl = async (fileName) => {
  const command = new GetObjectCommand({
    Bucket: process.env.S3_BUCKET_NAME,
    Key: fileName,
  });

  try {
    // Tạo link đọc sống 1 giờ
    const readUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    return readUrl;
  } catch (error) {
    console.error("Lỗi khi tạo URL đọc:", error);
    throw error;
  }
};

export const deleteFileFromS3 = async (fileKey) => {
  if (!fileKey) return;

  const command = new DeleteObjectCommand({
    Bucket: process.env.S3_BUCKET_NAME,
    Key: fileKey,
  });

  try {
    await s3Client.send(command);
  } catch (error) {
    console.error("Lỗi khi xóa file trên S3:", error);
  }
};
