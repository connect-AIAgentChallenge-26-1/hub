import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AgentStatePanel from "./AgentStatePanel";

describe("AgentStatePanel", () => {
  it("shows internal dimensions and only the selected public action", () => {
    render(
      <AgentStatePanel
        interaction={{
          sequenceNumber: 3,
          response: {
            actionType: "verify_context",
            text: "맥락을 확인할게."
          }
        }}
      />
    );

    expect(
      screen.getByRole("heading", { name: "로봇 내부 상태" })
    ).toBeInTheDocument();
    expect(screen.getByText("예측 오차")).toBeInTheDocument();
    expect(screen.getByText("맥락 확인")).toBeInTheDocument();
    expect(screen.queryByText("stateDelta")).not.toBeInTheDocument();
  });
});
