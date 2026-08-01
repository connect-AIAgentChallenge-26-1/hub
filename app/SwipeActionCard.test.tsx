// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SwipeActionCard from "./SwipeActionCard";

const item = {
  id: 1,
  title: "스와이프할 콘텐츠",
  summary: null,
  content: "내용",
  original_url: null,
  image_url: null,
  source_platform: "manual",
  category_main: "기타",
  category_sub: null,
  is_archived: false,
  archived_at: null,
  created_at: new Date().toISOString(),
};

describe("SwipeActionCard", () => {
  beforeEach(() => vi.stubGlobal("PointerEvent", MouseEvent));
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("카드를 왼쪽으로 충분히 밀면 액션을 실행한다", async () => {
    const onAction = vi.fn().mockResolvedValue(undefined);
    render(
      <ul>
        <SwipeActionCard
          item={item}
          actionLabel="완료"
          pendingLabel="보관 중"
          onAction={onAction}
        />
      </ul>,
    );

    const card = screen.getByText(item.title).closest("div.absolute.inset-0");
    expect(card).not.toBeNull();
    Object.defineProperty(card, "setPointerCapture", { value: vi.fn() });
    Object.defineProperty(card, "hasPointerCapture", { value: vi.fn(() => false) });

    fireEvent.pointerDown(card!, { pointerId: 1, button: 0, clientX: 200 });
    fireEvent.pointerMove(card!, { pointerId: 1, clientX: 80 });
    fireEvent.pointerUp(card!, { pointerId: 1, clientX: 80 });

    await waitFor(() => expect(onAction).toHaveBeenCalledWith(item.id));
  });
});
