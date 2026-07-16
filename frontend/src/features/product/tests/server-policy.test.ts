import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as buildInfo } from "@/app/api/build-info/route";
import { handleProductMock, isProductMockApiEnabled } from "../mock/server";
import { isLivePlaygroundEnabled } from "@/features/live-playground/server-policy";

describe("제품 배포 표면 정책", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("Mock API는 development/test에서만 열리고 production에서는 열 수 없다", () => {
    expect(isProductMockApiEnabled("development")).toBe(true);
    expect(isProductMockApiEnabled("test")).toBe(true);
    expect(isProductMockApiEnabled("production")).toBe(false);
  });

  it("production Mock route는 opt-in이 없으면 실제로 404를 반환한다", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const response = await handleProductMock(
      new NextRequest("https://example.test/mock-api/v1/anonymous-sessions", { method: "POST" }),
      "POST",
      ["anonymous-sessions"],
    );
    expect(response.status).toBe(404);
  });

  it("Engineering Playground는 development 전용이고 production에서는 열 수 없다", () => {
    expect(isLivePlaygroundEnabled("development")).toBe(true);
    expect(isLivePlaygroundEnabled("production")).toBe(false);
  });

  it("build-info는 Vercel SHA를 gitSha로 우선 노출한다", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "A".repeat(40));
    vi.stubEnv("NEXT_PUBLIC_BUILD_SHA", "b".repeat(40));
    const response = buildInfo();
    await expect(response.json()).resolves.toEqual({ gitSha: "a".repeat(40) });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("prebuilt CLI에서는 NEXT_PUBLIC_BUILD_SHA를 사용하고 잘못된 값은 local로 제한한다", async () => {
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    vi.stubEnv("NEXT_PUBLIC_BUILD_SHA", "c".repeat(40));
    await expect(buildInfo().json()).resolves.toEqual({ gitSha: "c".repeat(40) });
    vi.stubEnv("NEXT_PUBLIC_BUILD_SHA", "not-a-sha");
    await expect(buildInfo().json()).resolves.toEqual({ gitSha: "local" });
  });
});
