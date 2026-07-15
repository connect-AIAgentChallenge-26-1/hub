import { expect, test } from "@playwright/test";

test("자연어 입력부터 Draft 확인, trace와 Top 3까지 완료한다", async ({ page }) => {
  await page.goto("/playground");

  await expect(page.getByRole("heading", { name: "추천의 모든 판단을 눈으로 확인하세요." })).toBeVisible();
  await expect(page.getByText("외부 호출 없는 Mock 모드")).toBeVisible();

  const request = page.getByLabel("장소 요청");
  await request.fill("서울 디저트 카페를 찾습니다. 흡연 장소는 제외합니다.");
  await page.getByRole("button", { name: "AI 조건 Draft 만들기" }).click();

  await expect(page.getByRole("heading", { name: "AI가 이해한 조건을 확인해 주세요" })).toBeVisible();
  await expect(page.getByLabel("지역")).toHaveValue("서울");
  await expect(page.getByLabel("장소 유형")).toHaveValue("CAFE");
  await expect(page.getByText("인원 미입력")).toBeVisible();

  await page.getByRole("button", { name: "조건 확정하고 추천 시작" }).click();

  await expect(page.getByRole("heading", { name: "근거가 연결된 Top 3" })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('article[aria-labelledby^="place-"]')).toHaveCount(3);
  await expect(page.getByRole("heading", { name: "추천이 만들어지는 과정" })).toBeVisible();
  await expect(page.getByText("Elice 이유와 근거 관계를 검증했습니다")).toBeVisible();
  await expect(page.getByText("도보 시간", { exact: true })).toHaveCount(0);
});
