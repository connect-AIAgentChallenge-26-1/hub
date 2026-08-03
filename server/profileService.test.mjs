import assert from "node:assert/strict";
import test from "node:test";
import { normalizeDisplayName } from "./profileService.mjs";

test("닉네임 앞뒤 공백을 제거하고 연속 공백을 하나로 합친다", () => {
  assert.equal(normalizeDisplayName("  지금   리뷰  "), "지금 리뷰");
});

test("닉네임은 2자 이상 30자 이하만 허용한다", () => {
  assert.throws(() => normalizeDisplayName("가"), /2자 이상 30자 이하/);
  assert.throws(() => normalizeDisplayName("가".repeat(31)), /2자 이상 30자 이하/);
});

