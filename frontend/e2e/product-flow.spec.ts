import { expect, test } from "@playwright/test";

test("자연어 조건부터 기본·부분 대체 추천, 두 세션 투표와 확정까지 완료한다", async ({ browser, page }) => {
  test.setTimeout(180_000);
  const telemetry: Array<{ name: string; context: Record<string, string> }> = [];
  page.on("request", (request) => {
    if (request.method() !== "POST" || !request.url().endsWith("/events")) return;
    const body = request.postDataJSON() as { name?: unknown; context?: unknown };
    if (typeof body.name === "string" && isStringRecord(body.context)) {
      telemetry.push({ name: body.name, context: body.context });
    }
  });
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
  await expect(page.getByRole("heading", { name: "근거가 연결된 추천 3곳" })).toBeVisible();
  await expect(page.locator('article[aria-labelledby^="product-place-"]')).toHaveCount(3);
  await expect(page.getByText("가격·영업 상태·이동 시간은 추정하지 않습니다.")).toBeVisible();

  let alternativeRequests = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/alternatives")) {
      alternativeRequests += 1;
    }
  });
  await page.getByRole("button", { name: "다른 추천 보기" }).evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await expect(page).toHaveURL(/\/recommendations\/[0-9a-f-]+\/progress\?sourceJobId=/, { timeout: 30_000 });
  await expect(page).toHaveURL(/\/recommendations\/[0-9a-f-]+$/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "근거가 연결된 추천 2곳" })).toBeVisible();
  await expect(page.locator('article[aria-labelledby^="product-place-"]')).toHaveCount(2);
  await expect(page.getByText(/검증 가능한 후보 2곳을 부분 결과/)).toBeVisible();
  await expect(page.getByText("직접 확인 링크 미제공")).toBeVisible();
  await expect(page.getByText("검증 템플릿 이유")).toBeVisible();
  expect(alternativeRequests).toBe(1);
  await expect.poll(() => telemetry.map((event) => event.name)).toContain(
    "alternativeRecommendationRequested",
  );
  await expect.poll(() => telemetry.map((event) => event.name)).toContain(
    "partialRecommendationShown",
  );
  expect(telemetry.every((event) =>
    !Object.keys(event.context).some((key) => /url|message|stack|requestText/i.test(key))))
    .toBe(true);

  await page.getByRole("button", { name: "다른 추천 보기" }).click();
  await expect(page).toHaveURL(/\/recommendations\/[0-9a-f-]+\/progress\?sourceJobId=/, { timeout: 30_000 });
  await expect(page).toHaveURL(/\/recommendations\/[0-9a-f-]+$/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "근거가 연결된 추천 1곳" })).toBeVisible();
  await expect(page.locator('article[aria-labelledby^="product-place-"]')).toHaveCount(1);
  await expect(page.getByText(/검증 가능한 후보 1곳을 부분 결과/)).toBeVisible();
  await expect(page.getByText("검증 템플릿 이유")).toBeVisible();

  await page.getByRole("button", { name: "다른 추천 보기" }).click();
  await expect(page.getByRole("heading", { name: "아직 보여 드리지 않은 후보가 없습니다" })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "기존 추천으로 돌아가기" }).click();
  await expect(page.getByRole("heading", { name: "근거가 연결된 추천 1곳" })).toBeVisible();

  await page.getByRole("button", { name: "다른 추천 보기" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "다른 추천을 모두 확인했습니다" }))
    .toContainText("다른 추천을 모두 확인했습니다");
  await expect(page.locator('article[aria-labelledby^="product-place-"]')).toHaveCount(1);

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
  await expect(page.getByRole("button", { name: /좋아요 1/ }).first())
    .toBeVisible({ timeout: 15_000 });

  await participant.getByRole("button", { name: /아쉬워요 0/ }).first().click();
  await expect(page.getByRole("button", { name: /좋아요 0/ }).first())
    .toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: /아쉬워요 1/ }).first())
    .toBeVisible({ timeout: 15_000 });

  await participant.getByRole("button", { name: /아쉬워요 1/ }).first().click();
  await expect(page.getByRole("button", { name: /아쉬워요 0/ }).first())
    .toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "이 장소로 최종 확정" }).first().click();
  await expect(page).toHaveURL(/\/rooms\/[0-9a-f]+\/result$/, { timeout: 90_000 });
  await expect(page.getByRole("heading", { name: "함께 고른 장소예요" })).toBeVisible();
  await expect(participant).toHaveURL(/\/rooms\/[0-9a-f]+\/result$/, { timeout: 10_000 });
  await expect(participant.getByRole("heading", { name: "함께 고른 장소예요" })).toBeVisible();

  await participantContext.close();
});

test("제품 흐름에서 누락된 필수 조건을 직접 입력해 추천을 시작한다", async ({ page }) => {
  test.setTimeout(90_000);
  const changedFields: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "POST" || !request.url().endsWith("/events")) return;
    const body = request.postDataJSON() as { name?: unknown; context?: unknown };
    if (body.name !== "conditionFieldChanged" || !isStringRecord(body.context)) return;
    const fieldName = body.context.fieldName;
    if (fieldName) changedFields.push(fieldName);
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /조건은 내가 확정하고/ })).toBeVisible();
  await expect(page.getByText("MOCK DEMO")).toBeVisible();
  await page.getByLabel("어떤 장소를 찾고 있나요?").fill("조용한 곳을 찾아 주세요.");
  await expect(page.getByLabel("어떤 장소를 찾고 있나요?")).toHaveValue("조용한 곳을 찾아 주세요.");
  await page.getByRole("button", { name: "AI 조건 초안 확인" }).click();

  await expect(page).toHaveURL(/\/recommendations\/new\/[0-9a-f-]+$/, { timeout: 30_000 });
  await expect(page.getByRole("status").filter({ hasText: "AI 초안을 완성하지 못했습니다." }))
    .toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel("지역")).toHaveValue("");
  await expect(page.getByLabel("장소 유형")).toHaveValue("");

  await page.getByLabel("지역").fill("서울");
  await page.getByLabel("장소 유형").selectOption("CAFE");
  await page.getByRole("button", { name: /조건 확정하고 추천 시작/ }).click();

  await expect(page).toHaveURL(/\/recommendations\/[0-9a-f-]+\/progress$/, {
    timeout: 30_000,
  });
  await expect(page).toHaveURL(/\/recommendations\/[0-9a-f-]+$/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "근거가 연결된 추천 3곳" })).toBeVisible();
  await expect.poll(() => changedFields.sort()).toEqual([
    "locationQuery",
    "placeType",
    "preferences",
  ]);
});

function isStringRecord(value: unknown): value is Record<string, string> {
  return value != null && typeof value === "object" && !Array.isArray(value) &&
    Object.values(value).every((item) => typeof item === "string");
}
