import { expect, type Page, test } from "@playwright/test";

const SYNTHETIC_REQUEST = "서울 음식점을 찾습니다.";

test("실제 Provider Playground 사용자 흐름을 화면에서 검증한다", async ({ page }) => {
  await page.goto("/playground", { waitUntil: "domcontentloaded" });

  await assertVisibleText(page, "LIVE_DEV_MODE", "로컬 실제 Provider 모드");
  await assertVisibleText(page, "INPUT_STEP", "어떤 장소를 찾고 있나요?");
  await expect(page.locator('main[data-interactive="true"]')).toBeVisible({ timeout: 30_000 });
  mark("INPUT_READY");

  await page.locator("#request-text").fill(SYNTHETIC_REQUEST);
  mark("INPUT_FILLED");
  await page.getByRole("button", { name: "AI 조건 Draft 만들기" }).click();
  mark("DRAFT_REQUESTED");

  await assertVisibleText(page, "EXTRACTED_DRAFT", "AI가 이해한 조건을 확인해 주세요");
  await assertConditionDraft(page);
  mark("DRAFT_VERIFIED");
  // 실제 LLM 초안은 사용자가 확인·수정한 뒤에만 추천 Core로 전달한다. 고정 합성
  // 입력의 확정 위치를 명시적으로 적용해 자동 확정을 테스트하지 않는다.
  await page.locator("#location-query").fill("서울");
  mark("CONDITION_CORRECTED");
  await page.getByRole("button", { name: "조건 확정하고 추천 시작" }).click();

  await assertVisibleText(page, "CONFIRMED_CONDITION", "사용자가 조건을 확인했습니다");
  mark("CONDITION_CONFIRMED");
  await assertVisibleText(page, "NAVER_LOCAL", "Naver Local 후보를 수신했습니다");
  await assertVisibleText(page, "NAVER_NORMALIZATION", "후보를 정규화하고 필터링했습니다");
  await assertVisibleText(page, "NAVER_BLOG", "Naver Blog");
  mark("NAVER_EVIDENCE_VERIFIED");
  await assertVisibleText(page, "SERVER_RANKING", "서버가 결정론적 Top 3를 확정했습니다");
  await assertVisibleText(page, "ELICE_CONTEXT", "Elice에 근거 기반 이유 생성을 요청했습니다");
  await assertVisibleText(page, "ELICE_EVIDENCE_VALIDATION", "Elice 이유와 근거 관계를 검증했습니다");
  await assertVisibleText(page, "TOP_THREE", "근거가 연결된 Top 3");

  await assertVerifiedResultStructure(page);
  mark("TOP_THREE_VERIFIED");
  await page.getByRole("button", { name: "결과를 삭제하고 새 조건으로 찾기" }).click();
  await assertVisibleText(page, "DATA_DELETED", "어떤 장소를 찾고 있나요?");
  mark("DATA_DELETED");
});

function mark(stage: string): void {
  process.stdout.write(`LIVE_PLAYGROUND_E2E stage=${stage} status=passed\n`);
}

async function assertConditionDraft(page: Page): Promise<void> {
  await expect.poll(
    () => page.evaluate(() => {
      const location = document.querySelector<HTMLInputElement>("#location-query");
      const placeType = document.querySelector<HTMLSelectElement>("#place-type");
      return Boolean(location?.value.trim()) && placeType?.value === "RESTAURANT";
    }),
    {
      message: "LIVE_UI_CONTRACT:EXTRACTED_DRAFT_FIELDS",
      timeout: 120_000,
    },
  ).toBe(true);
}

async function assertVerifiedResultStructure(page: Page): Promise<void> {
  await expect.poll(
    () => page.evaluate(() => {
      const cards = [...document.querySelectorAll<HTMLElement>('article[aria-labelledby^="place-"]')];
      if (cards.length !== 3) return false;

      const summary = [...document.querySelectorAll<HTMLElement>("div")];
      const hasSummary = (label: string, value: string) => summary.some((item) => {
        const values = [...item.querySelectorAll(":scope > p")].map((node) => node.textContent?.trim());
        return values.length === 2 && values[0] === label && values[1] === value;
      });
      if (!hasSummary("후보", "3") || !hasSummary("저하", "없음") || !hasSummary("대체", "없음")) {
        return false;
      }

      return cards.every((card) => {
        const scoreIsVisible = /\d+\/80/.test(card.textContent ?? "");
        const hasReasonHeading = [...card.querySelectorAll("h4")]
          .some((heading) => heading.textContent?.trim() === "검증된 추천 이유");
        const evidenceReferences = [...card.querySelectorAll("li span")]
          .filter((node) => node.textContent?.trim().startsWith("근거 "));
        return scoreIsVisible && hasReasonHeading && evidenceReferences.length > 0;
      });
    }),
    {
      message: "LIVE_UI_CONTRACT:TOP_THREE_SCORE_REASON_EVIDENCE",
      timeout: 120_000,
    },
  ).toBe(true);
}

async function assertVisibleText(page: Page, contract: string, text: string): Promise<void> {
  await expect.poll(
    () => page.evaluate((expected) => {
      const candidates = document.querySelectorAll<HTMLElement>("h1, h2, h3, h4, p, span");
      return [...candidates].some((element) => {
        if (!element.textContent?.includes(expected)) return false;
        const style = window.getComputedStyle(element);
        return style.visibility !== "hidden" && style.display !== "none";
      });
    }, text),
    {
      message: `LIVE_UI_CONTRACT:${contract}`,
      timeout: 120_000,
    },
  ).toBe(true);
}
