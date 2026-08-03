import test from "node:test";
import assert from "node:assert/strict";
import { extractReceiptData, requestClovaReceiptOcr } from "./clovaOcrService.mjs";

test("CLOVA 영수증 응답에서 상호명, 결제일, 금액, 승인번호를 추출한다", () => {
  const result = extractReceiptData({
    images: [{
      inferResult: "SUCCESS",
      receipt: { result: {
        storeInfo: { name: { text: "메가MGC커피" }, subName: { text: "강남중앙점" } },
        paymentInfo: {
          date: { formatted: { year: "2026", month: "08", day: "01" } },
          time: { formatted: { hour: "14", minute: "32" } },
          confirmNum: { text: "12345678" },
        },
        totalPrice: { price: { text: "5,000원" } },
      } },
    }],
  });

  assert.equal(result.merchantName, "메가MGC커피 강남중앙점");
  assert.equal(result.paidAt, "2026-08-01T14:32:00+09:00");
  assert.equal(result.totalAmount, 5000);
  assert.equal(result.approvalNumber, "12345678");
});

test("CLOVA 호출 시 비밀키와 multipart 요청을 사용한다", async () => {
  let captured;
  const fetchImpl = async (url, options) => {
    captured = { url, options };
    return { ok: true, json: async () => ({ images: [] }) };
  };
  await requestClovaReceiptOcr({
    buffer: Buffer.from("receipt"),
    mimeType: "image/jpeg",
    fileName: "receipt.jpg",
    invokeUrl: "https://example.com/document/receipt",
    secretKey: "secret",
    fetchImpl,
  });

  assert.equal(captured.options.headers["X-OCR-SECRET"], "secret");
  assert.equal(captured.options.method, "POST");
  assert.ok(captured.options.body instanceof FormData);
  assert.equal(captured.options.body.get("file").type, "image/jpeg");
});

test("일반 OCR 응답에서 기대 업체명을 임의로 인증 결과에 넣지 않는다", () => {
  const result = extractReceiptData({ images: [{ inferResult: "SUCCESS", fields: [
    { inferText: "다른카페" },
    { inferText: "2026-08-01 14:32" },
  ] }] }, { expectedMerchantName: "메가MGC커피 강남중앙점" });
  assert.equal(result.merchantName, "다른카페");
});
