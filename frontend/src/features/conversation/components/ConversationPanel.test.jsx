import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ConversationPanel from "./ConversationPanel";

describe("ConversationPanel", () => {
  it("announces newly added messages as a polite conversation log", () => {
    render(
      <ConversationPanel
        messages={[
          { id: "message-1", role: "ai", content: "천천히 이야기해도 괜찮아." }
        ]}
      />
    );

    const conversationLog = screen.getByRole("log", {
      name: "에이전트 상호작용 기록"
    });

    expect(conversationLog).toHaveAttribute("aria-live", "polite");
    expect(conversationLog).toHaveAttribute("aria-relevant", "additions text");
  });
});
