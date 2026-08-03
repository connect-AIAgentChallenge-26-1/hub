import multer from "multer";

const MAX_RECEIPT_SIZE = 10 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
]);

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    files: 1,
    fileSize: MAX_RECEIPT_SIZE,
  },

  fileFilter(request, file, callback) {
    if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      callback(
        new Error("영수증은 JPG 또는 PNG 이미지만 사용할 수 있습니다.")
      );
      return;
    }

    callback(null, true);
  },
});

export const uploadReceiptImage = upload.single("receipt");
