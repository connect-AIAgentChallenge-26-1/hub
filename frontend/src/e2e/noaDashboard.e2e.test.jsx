import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "../App";

describe("Noa dashboard", () => {
  it("shows the core, public log, camera control, and no chat room", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Noa" })).toBeInTheDocument();
    expect(
      screen.getByRole("log", { name: "Noa 공개 판단 로그" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "카메라 시작" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();

    fireEvent.keyDown(
      screen.getByRole("button", { name: "Noa 내부 상태 열기" }),
      { key: "Enter" }
    );
    expect(
      screen.getByRole("heading", { name: "Noa의 현재 내부 상태" })
    ).toBeInTheDocument();
  });
});
