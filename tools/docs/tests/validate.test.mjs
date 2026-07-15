import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { globMatches, validateRepository } from "../validate.mjs";

const toolsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = (name) => path.join(toolsRoot, "test-fixtures", name);

const negativeCases = [
  ["invalid-frontmatter", "FRONTMATTER_REQUIRED"],
  ["duplicate-id", "DUPLICATE_ID"],
  ["broken-link", "BROKEN_LINK"],
  ["placeholder", "PLACEHOLDER"],
  ["secret", "SECRET_PATTERN"],
];

for (const [fixture, expectedCode] of negativeCases) {
  test(`${fixture} fixture가 ${expectedCode}로 실패한다`, () => {
    const errors = validateRepository({ root: fixtureRoot(fixture), changedFiles: [] });
    assert.ok(errors.some((error) => error.startsWith(expectedCode)), errors.join("\n"));
  });
}

test("경로 glob이 루트와 중첩 경로를 정확히 매칭한다", () => {
  assert.equal(globMatches("docs/README.md", "docs/**"), true);
  assert.equal(globMatches("docs/adr/ADR-0001-x.md", "docs/**"), true);
  assert.equal(globMatches("docker-compose.observability.yml", "docker-compose*.yml"), true);
  assert.equal(globMatches("src/file.js", "backend/**"), false);
});
