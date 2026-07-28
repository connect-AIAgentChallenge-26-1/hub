import React from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AgentInputForm from "./AgentInputForm";

describe("AgentInputForm", () => {
  it("submits only the trimmed message text", async () => {
    const onSend = vi.fn().mockResolvedValue(true);
    render(<AgentInputForm onSend={onSend} />);

    fireEvent.change(
      screen.getByLabelText("에이전트에게 전달할 요청"),
      {
        target: { value: "  다음 작업을 계속해줘.  " }
      }
    );
    fireEvent.click(
      screen.getByRole("button", { name: "상호작용 실행" })
    );

    await waitFor(() =>
      expect(onSend).toHaveBeenCalledWith("다음 작업을 계속해줘.")
    );
    expect(screen.getByLabelText("에이전트에게 전달할 요청"))
      .toHaveValue("");
  });

  it("keeps the message when the request is not accepted", async () => {
    const onSend = vi.fn().mockResolvedValue(false);
    render(<AgentInputForm onSend={onSend} />);
    const input = screen.getByLabelText("에이전트에게 전달할 요청");

    fireEvent.change(input, { target: { value: "재시도할 요청" } });
    fireEvent.submit(input.closest("form"));

    await waitFor(() => expect(onSend).toHaveBeenCalledOnce());
    expect(input).toHaveValue("재시도할 요청");
  });
});
