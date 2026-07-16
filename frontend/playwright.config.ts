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
    // Docker Desktop의 Windows bind mount에서는 Turbopack의 source map 쓰기가
    // EPERM으로 실패할 수 있다. 브라우저 계약 검증은 동일한 Next 애플리케이션을
    // 안정적인 Webpack 개발 서버로 기동한다.
    command: "npm run dev:e2e",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: false,
    // Windows bind mount의 최초 Webpack 컴파일 시간을 포함한다.
    timeout: 240_000,
    env: {
      NEXT_PUBLIC_PLAYGROUND_API_MODE: "mock",
    },
  },
});
