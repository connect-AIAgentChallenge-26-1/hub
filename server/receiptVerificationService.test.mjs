import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeMerchantName,
  validateOcrReceipt,
  validateReceiptFile,
} from "./receiptVerificationService.mjs";

test("영수증 이미지 형식과 크기를 사전 검증한다", () => {
  assert.deepEqual(validateReceiptFile({ type: "image/jpeg", size: 1024 }), {
    type: "image/jpeg",
    size: 1024,
  });
  assert.throws(() => validateReceiptFile({ type: "application/pdf", size: 1024 }), /이미지/);
  assert.throws(() => validateReceiptFile({ type: "image/png", size: 10 * 1024 * 1024 + 1 }), /10MB/);
});

test("상호명은 비교 전에 공백과 특수문자를 정규화한다", () => {
  assert.equal(normalizeMerchantName(" 네이버 1784(본점) "), "네이버1784본점");
});

test("OCR 결과에서 업체와 30일 이내 결제일을 검증한다", () => {
  const now = new Date("2026-07-29T12:00:00+09:00");
  assert.deepEqual(validateOcrReceipt({
    merchantName: "네이버 1784",
    paidAt: "2026-07-10T13:00:00+09:00",
    approvalNumber: "12345678",
  }, { placeName: "네이버1784", now }), {
    merchantName: "네이버 1784",
    paidAt: "2026-07-10T04:00:00.000Z",
    approvalNumber: "12345678",
  });
  assert.throws(() => validateOcrReceipt({ merchantName: "다른 업체", paidAt: "2026-07-10" }, { placeName: "네이버1784", now }), /상호명/);
  assert.throws(() => validateOcrReceipt({ merchantName: "네이버1784", paidAt: "2026-05-01" }, { placeName: "네이버1784", now }), /30일/);
});
