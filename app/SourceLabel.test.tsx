// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SourceLabel from "./SourceLabel";

describe("SourceLabel", () => {
  it.each([
    ["youtube", "YouTube"],
    ["instagram", "Instagram"],
    ["twitter", "X"],
    ["naver", "Naver"],
    ["manual", "직접 저장"],
  ])("%s 출처 이름과 아이콘을 표시한다", (source_platform, label) => {
    const { container } = render(
      <SourceLabel item={{ source_platform, original_url: null }} />
    );
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("일반 웹 링크는 도메인 이름을 표시한다", () => {
    render(
      <SourceLabel
        item={{ source_platform: "web", original_url: "https://www.example.com/tips" }}
      />
    );
    expect(screen.getByText("example.com")).toBeInTheDocument();
  });
});
