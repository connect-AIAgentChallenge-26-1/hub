import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import NoaCore from "./NoaCore";

describe("NoaCore", () => {
  it("shows Noa at the center and reveals the public state on request", () => {
    render(<NoaCore status="observing" cameraStatus="active" />);

    expect(screen.getByRole("heading", { name: "Noa" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("관찰 중");
    expect(
      screen.queryByRole("heading", { name: "Noa의 현재 내부 상태" })
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "지구본을 눌러 내부 상태 보기" })
    );

    expect(
      screen.getByRole("heading", { name: "Noa의 현재 내부 상태" })
    ).toBeInTheDocument();
    expect(screen.getByText("예측 변화")).toBeInTheDocument();
    expect(screen.getByText("관찰 동기화")).toBeInTheDocument();
  });
});
