import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Galaxy S9+"] },
    },
  ],
  webServer: {
    // Windows bind mount에서 next dev의 cold compile이 동적 route 전환을 지연시킬 수
    // 있으므로 E2E도 배포와 같은 고정 production standalone bundle로 검증한다.
    command: "npm run serve:e2e",
    url: "http://127.0.0.1:3000",
    // 로컬에서 이미 동일한 Mock 개발 컨테이너를 실행 중일 때만 명시적으로 재사용한다.
    // CI 기본값은 false여서 격리된 서버를 매번 새로 시작한다.
    reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === "true",
    timeout: 300_000,
  },
});
