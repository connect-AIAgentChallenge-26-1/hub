import { expect, test } from "@playwright/test";

test("자연어 조건부터 Top 3, 두 익명 세션 투표와 주최자 확정까지 완료한다", async ({ browser, page }) => {
  test.setTimeout(180_000);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /조건은 내가 확정하고/ })).toBeVisible();
  await expect(page.getByText("MOCK DEMO")).toBeVisible();

  await page.getByLabel("어떤 장소를 찾고 있나요?").fill(
    "성수에서 2명이 조용히 대화할 수 있는 카페를 찾아줘. 흡연 장소는 제외해줘.",
  );
  await page.getByRole("button", { name: "AI 조건 초안 확인" }).click();

  await expect(page).toHaveURL(/\/recommendations\/new\/[0-9a-f-]+$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "AI가 이해한 조건을 확인해 주세요" })).toBeVisible();
  await expect(page.getByLabel("지역")).toHaveValue("서울 성수");
  await expect(page.getByLabel("장소 유형")).toHaveValue("CAFE");
  await expect(page.getByLabel("선호 1 우선순위")).toHaveValue("5");

  await page.getByRole("button", { name: /조건 확정하고 추천 시작/ }).click();
  await expect(page).toHaveURL(/\/recommendations\/[0-9a-f-]+\/progress$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "근거가 있는 후보를 찾고 있어요" })).toBeVisible();

  await expect(page).toHaveURL(/\/recommendations\/[0-9a-f-]+$/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "근거가 연결된 Top 3" })).toBeVisible();
  await expect(page.locator('article[aria-labelledby^="product-place-"]')).toHaveCount(3);
  await expect(page.getByText("가격·영업 상태·이동 시간은 추정하지 않습니다.")).toBeVisible();

  await page.getByRole("button", { name: "투표방 만들기" }).click();
  await expect(page).toHaveURL(/\/rooms\/[0-9a-f]+$/, { timeout: 30_000 });
  const roomUrl = page.url();
  await expect(page.getByRole("heading", { name: "좋아요와 아쉬워요를 남겨 주세요" })).toBeVisible();

  const participantContext = await browser.newContext();
  const participant = await participantContext.newPage();
  await participant.goto(roomUrl);
  await expect(participant.getByRole("heading", { name: "좋아요와 아쉬워요를 남겨 주세요" })).toBeVisible();
  await expect(participant.getByRole("button", { name: /이 장소로 최종 확정/ })).toHaveCount(0);

  const participantLike = participant.getByRole("button", { name: /좋아요 0/ }).first();
  await participantLike.click();
  await expect(page.getByRole("button", { name: /좋아요 1/ }).first()).toBeVisible();

  await participant.getByRole("button", { name: /아쉬워요 0/ }).first().click();
  await expect(page.getByRole("button", { name: /좋아요 0/ }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /아쉬워요 1/ }).first()).toBeVisible();

  await participant.getByRole("button", { name: /아쉬워요 1/ }).first().click();
  await expect(page.getByRole("button", { name: /아쉬워요 0/ }).first()).toBeVisible();

  await page.getByRole("button", { name: "이 장소로 최종 확정" }).first().click();
  await expect(page).toHaveURL(/\/rooms\/[0-9a-f]+\/result$/, { timeout: 90_000 });
  await expect(page.getByRole("heading", { name: "함께 고른 장소예요" })).toBeVisible();
  await expect(participant).toHaveURL(/\/rooms\/[0-9a-f]+\/result$/, { timeout: 10_000 });
  await expect(participant.getByRole("heading", { name: "함께 고른 장소예요" })).toBeVisible();

  await participantContext.close();
});
