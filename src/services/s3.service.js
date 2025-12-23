import { S3Client, ListBucketsCommand, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";


// Khởi tạo client S3
const s3Client = new S3Client({ region: process.env.AWS_REGION, 
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  } 
});

/**
 * Hàm lấy link upload (Presigned URL)
 * @param {string} fileName - Tên file muốn lưu trên S3
 * @param {string} fileType - Loại file (ví dụ: 'application/pdf, image/jpeg')
 * @returns {Promise<string>} - Trả về link upload
 */
export const getUploadUrl = async (fileName, fileType) => {
  const command = new PutObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: fileName,
    ContentType: fileType,
  });

  try {
    // Tạo link upload sống 5 phút
    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });
    return uploadUrl;
  } catch (error) { 
    console.error("Lỗi khi tạo URL upload:", error);
    throw error;
  }
}


export const getReadUrl = async (fileName) => {
  const command = new GetObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: fileName,
  })

  try {
    // Tạo link đọc sống 1 giờ
    const readUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    return readUrl;
  } catch (error) {
    console.error("Lỗi khi tạo URL đọc:", error);
    throw error;
  }
}