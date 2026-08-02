import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type ManifestIcon = {
  src: string;
  sizes: string;
  type: string;
  purpose: string;
};

type WebAppManifest = {
  name: string;
  short_name: string;
  start_url: string;
  display: string;
  background_color: string;
  theme_color: string;
  icons: ManifestIcon[];
};

const workspaceRoot = resolve(__dirname, "..");
const manifest = JSON.parse(
  readFileSync(resolve(workspaceRoot, "public/manifest.json"), "utf8")
) as WebAppManifest;

describe("PWA manifest", () => {
  it("standalone 실행과 Later 테마를 정의한다", () => {
    expect(manifest).toMatchObject({
      name: "later.",
      short_name: "later.",
      start_url: "/",
      display: "standalone",
      background_color: "#FFFFFF",
      theme_color: "#17171B",
    });
  });

  it("설치에 필요한 일반 및 maskable 아이콘 파일을 제공한다", () => {
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sizes: "192x192", purpose: "any" }),
        expect.objectContaining({ sizes: "512x512", purpose: "any" }),
        expect.objectContaining({ sizes: "512x512", purpose: "maskable" }),
      ])
    );

    for (const icon of manifest.icons) {
      expect(existsSync(resolve(workspaceRoot, "public", icon.src.slice(1)))).toBe(true);
    }
    expect(existsSync(resolve(workspaceRoot, "public/icons/apple-touch-icon.png"))).toBe(
      true
    );
  });
});
