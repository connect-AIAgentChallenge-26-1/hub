import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ServiceHeader from "./ServiceHeader";

describe("ServiceHeader", () => {
  it("renders internal state labels and live agent status", () => {
    render(<ServiceHeader status="thinking" />);

    expect(
      screen.getByRole("heading", { name: "내부 상태 에이전트" })
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("상태 갱신 중");
    expect(screen.getByText("예측 오차")).toBeInTheDocument();
    expect(screen.getByText("연속성")).toBeInTheDocument();
    expect(screen.getByText("동기화")).toBeInTheDocument();
    expect(screen.getByText("탐색 동력")).toBeInTheDocument();
  });
});
