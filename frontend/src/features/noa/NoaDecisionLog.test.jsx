import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import NoaDecisionLog from "./NoaDecisionLog";

describe("NoaDecisionLog", () => {
  it("exposes observations and decisions as an accessible public log", () => {
    render(
      <NoaDecisionLog
        entries={[
          {
            id: "log-1",
            kind: "observation",
            title: "장면이 안정적입니다.",
            detail: "현재 상태를 유지합니다.",
            createdAt: "2026-07-28T12:00:00.000Z"
          }
        ]}
      />
    );

    const log = screen.getByRole("log", { name: "Noa 공개 판단 로그" });
    expect(log).toHaveAttribute("aria-live", "polite");
    expect(screen.getByText("장면이 안정적입니다.")).toBeInTheDocument();
    expect(screen.getByText("현재 상태를 유지합니다.")).toBeInTheDocument();
  });
});
