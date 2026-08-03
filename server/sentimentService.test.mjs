import test from "node:test";
import assert from "node:assert/strict";
import { analyzeReviewSentiment, normalizeSentimentResult, validateReviewContent } from "./sentimentService.mjs";

test("리뷰 길이를 검증한다", () => {
  assert.throws(() => validateReviewContent("짧음"), /10자/);
  assert.equal(validateReviewContent(" 음식도 맛있고 다시 방문하고 싶어요. "), "음식도 맛있고 다시 방문하고 싶어요.");
});

test("분석 결과를 저장 가능한 형태로 정규화한다", () => {
  assert.deepEqual(normalizeSentimentResult({ bucket: "positive", confidence: 0.87654, keywords: ["맛있음", "친절", "맛있음"] }), {
    bucket: "positive",
    score: 0.5,
    confidence: 0.8765,
    keywords: ["맛있음", "친절"],
  });
});

test("Responses API에 구조화 출력으로 요청한다", async () => {
  let request;
  const client = { responses: { create: async (value) => {
    request = value;
    return { output_text: JSON.stringify({ bucket: "very_positive", confidence: 0.95, keywords: ["재방문"] }) };
  } } };
  const result = await analyzeReviewSentiment("정말 맛있어서 다음에도 꼭 다시 방문하고 싶어요.", { client, apiKey: "test", model: "test-model" });
  assert.equal(request.text.format.type, "json_schema");
  assert.equal(result.bucket, "very_positive");
  assert.equal(result.model, "test-model");
});
