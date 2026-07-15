import { defineConfig, devices } from "@playwright/test";

if (process.env.CI) {
  throw new Error("LIVE_PLAYGROUND_E2E_LOCAL_ONLY");
}

export default defineConfig({
  testDir: "./e2e-live",
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,
  // 조건 추출과 추천 실행은 서로 다른 실제 Provider 구간이다. 각 구간의 120초
  // 계약을 약화하지 않으면서 두 구간이 순차 실행될 수 있도록 전체 상한을 둔다.
  timeout: 360_000,
  expect: {
    timeout: 120_000,
  },
  reporter: [["./e2e-live/safe-live-reporter.ts"]],
  outputDir: "test-results/live-playground",
  preserveOutput: "never",
  use: {
    baseURL: "http://127.0.0.1:3000",
    serviceWorkers: "block",
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [
    {
      name: "live-dev-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
