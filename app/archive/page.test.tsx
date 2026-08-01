// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ArchivePage from "./page";

const item = {
  id: 1,
  title: "겨울 코트 추천",
  summary: "따뜻한 겨울 코트",
  content: "https://example.com",
  original_url: "https://example.com",
  image_url: null,
  source_platform: "instagram",
  category_main: "쇼핑",
  category_sub: "패션",
  is_archived: false,
  archived_at: null,
  created_at: new Date().toISOString(),
};

describe("ArchivePage", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("미완료 항목을 불러와 완료하면 아카이브에 보관한다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [item] })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...item, is_archived: true, archived_at: new Date().toISOString() }),
      });
    vi.stubGlobal("fetch", fetchMock);

    render(<ArchivePage />);

    expect(await screen.findByText("겨울 코트 추천")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://localhost:4000/api/items?archived=false",
    );

    fireEvent.click(screen.getByRole("button", { name: "겨울 코트 추천 완료" }));
    await waitFor(() => expect(screen.getByText("모두 확인했어요.")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:4000/api/items/1/archive",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ archived: true }),
      }),
    );
  });

  it("빈 목록 안내를 표시한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => [] }),
    );
    render(<ArchivePage />);

    expect(await screen.findByText("모두 확인했어요.")).toBeInTheDocument();
    expect(screen.getByText("새로 저장한 콘텐츠가 여기에 나타나요.")).toBeInTheDocument();
  });
});
