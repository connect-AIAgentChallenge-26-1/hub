import { randomUUID } from "node:crypto";

function textOf(value) {
  return String(value?.formatted?.value ?? value?.text ?? value ?? "").trim();
}

function twoDigits(value, fallback = "00") {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits ? digits.padStart(2, "0") : fallback;
}

function parseAmount(value) {
  const number = Number(String(value || "").replace(/[^0-9]/g, ""));
  return Number.isFinite(number) ? number : null;
}

function parseStructuredReceipt(result) {
  const storeName = textOf(result?.storeInfo?.name);
  const branchName = textOf(result?.storeInfo?.subName);
  const date = result?.paymentInfo?.date;
  const time = result?.paymentInfo?.time;
  const year = String(date?.formatted?.year || "").replace(/\D/g, "");
  const month = twoDigits(date?.formatted?.month);
  const day = twoDigits(date?.formatted?.day);
  const hour = twoDigits(time?.formatted?.hour);
  const minute = twoDigits(time?.formatted?.minute);
  const paidAt = year ? `${year}-${month}-${day}T${hour}:${minute}:00+09:00` : "";

  return {
    merchantName: [storeName, branchName].filter(Boolean).join(" "),
    paidAt,
    totalAmount: parseAmount(textOf(result?.totalPrice?.price)),
    approvalNumber: textOf(result?.paymentInfo?.confirmNum).replace(/\s/g, ""),
  };
}

function parseGeneralReceipt(image, expectedMerchantName) {
  const lines = (image?.fields || []).map((field) => String(field?.inferText || "").trim()).filter(Boolean);
  const text = lines.join(" ");
  const normalize = (value) => String(value || "").normalize("NFKC").toLowerCase().replace(/[^0-9a-z가-힣]/g, "");
  const expected = normalize(expectedMerchantName);
  const merchantLine = lines.find((line) => {
    const actual = normalize(line);
    return expected && actual && (actual.includes(expected) || expected.includes(actual));
  });
  const date = text.match(/(20\d{2})[.\/-]\s*(\d{1,2})[.\/-]\s*(\d{1,2})/);
  const time = text.match(/(?:오전|오후)?\s*(\d{1,2}):(\d{2})/);
  let hour = Number(time?.[1] || 0);
  if (/오후/.test(time?.[0] || "") && hour < 12) hour += 12;
  const paidAt = date
    ? `${date[1]}-${twoDigits(date[2])}-${twoDigits(date[3])}T${twoDigits(hour)}:${twoDigits(time?.[2])}:00+09:00`
    : "";
  const approval = text.match(/(?:승인번호|승인No\.?|approval)\s*[:：]?\s*([0-9-]{4,})/i);
  const amount = text.match(/(?:총\s*결제금액|결제금액|합계|총액)\s*[:：]?\s*([0-9,]+)\s*원?/i);

  return {
    merchantName: String(merchantLine || lines[0] || "").trim(),
    paidAt,
    totalAmount: parseAmount(amount?.[1]),
    approvalNumber: String(approval?.[1] || "").replace(/-/g, ""),
  };
}

export function extractReceiptData(payload, { expectedMerchantName = "" } = {}) {
  const image = payload?.images?.[0];
  if (!image || (image.inferResult && image.inferResult !== "SUCCESS")) {
    throw new Error("영수증 글자를 인식하지 못했습니다. 선명한 사진으로 다시 시도해 주세요.");
  }
  const result = image?.receipt?.result
    ? parseStructuredReceipt(image.receipt.result)
    : parseGeneralReceipt(image, expectedMerchantName);
  if (!result.merchantName || !result.paidAt) {
    throw new Error("영수증의 상호명 또는 결제일을 찾지 못했습니다.");
  }
  return result;
}

export async function requestClovaReceiptOcr({
  buffer,
  mimeType,
  fileName,
  invokeUrl = process.env.CLOVA_OCR_INVOKE_URL,
  secretKey = process.env.CLOVA_OCR_SECRET_KEY,
  fetchImpl = fetch,
}) {
  if (!invokeUrl || !secretKey) throw new Error("CLOVA OCR 환경변수가 설정되지 않았습니다.");
  const requestId = randomUUID();
  const format = mimeType === "image/png" ? "png" : "jpg";
  const form = new FormData();
  form.append("message", JSON.stringify({
    version: "V2",
    requestId,
    timestamp: Date.now(),
    images: [{ format, name: "receipt" }],
  }));
  form.append("file", new Blob([buffer], { type: mimeType }), fileName || `receipt.${format}`);
  const response = await fetchImpl(invokeUrl, {
    method: "POST",
    headers: { "X-OCR-SECRET": secretKey },
    body: form,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error("CLOVA OCR 요청에 실패했습니다.");
    error.status = response.status;
    throw error;
  }
  return { requestId, payload };
}
