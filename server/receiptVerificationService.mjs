const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png"]);

export function validateReceiptFile(file) {
  const type = String(file?.type || "").toLowerCase();
  const size = Number(file?.size || 0);
  if (!ACCEPTED_IMAGE_TYPES.has(type)) throw new Error("영수증은 JPG, PNG, WEBP, HEIC 이미지로 올려 주세요.");
  if (!Number.isFinite(size) || size <= 0) throw new Error("비어 있는 영수증 이미지는 사용할 수 없습니다.");
  if (size > MAX_RECEIPT_BYTES) throw new Error("영수증 이미지는 10MB 이하만 사용할 수 있습니다.");
  return { type, size };
}

export function normalizeMerchantName(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^0-9a-z가-힣]/g, "");
}

export function validateOcrReceipt(ocrResult, { placeName, now = new Date() } = {}) {
  const merchantName = String(ocrResult?.merchantName || "").trim();
  const expectedMerchant = normalizeMerchantName(placeName);
  const actualMerchant = normalizeMerchantName(merchantName);
  if (!expectedMerchant || !actualMerchant || (!actualMerchant.includes(expectedMerchant) && !expectedMerchant.includes(actualMerchant))) {
    throw new Error("영수증 상호명과 선택한 업체가 일치하지 않습니다.");
  }

  const paidAt = new Date(ocrResult?.paidAt);
  const referenceTime = new Date(now);
  if (Number.isNaN(paidAt.getTime()) || Number.isNaN(referenceTime.getTime())) throw new Error("영수증 결제일을 확인할 수 없습니다.");
  const ageInMilliseconds = referenceTime.getTime() - paidAt.getTime();
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  const oneDay = 24 * 60 * 60 * 1000;
  if (ageInMilliseconds > thirtyDays || ageInMilliseconds < -oneDay) throw new Error("결제일이 리뷰 작성일 기준 30일 이내여야 합니다.");

  return {
    merchantName,
    paidAt: paidAt.toISOString(),
    approvalNumber: String(ocrResult?.approvalNumber || "").trim() || null,
  };
}

export const RECEIPT_FILE_RULES = Object.freeze({
  acceptedTypes: [...ACCEPTED_IMAGE_TYPES],
  maxBytes: MAX_RECEIPT_BYTES,
});
