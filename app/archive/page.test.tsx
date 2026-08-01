// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ArchivePage from "./page";

const archivedItem = {
  id: 1,
  title: "보관한 콘텐츠",
  summary: "보관한 콘텐츠의 요약입니다.",
  content: "https://example.com",
  original_url: "https://example.com",
  image_url: null,
  source_platform: "web",
  category_main: "콘텐츠",
  category_sub: "웹",
  is_archived: true,
  archived_at: "2026-07-26T00:00:00.000Z",
  created_at: "2026-07-23T00:00:00.000Z",
};

const travelItem = {
  ...archivedItem,
  id: 2,
  title: "제주 여행 코스",
  summary: "여름 휴가 일정입니다.",
  content: "제주 맛집과 숙소",
  original_url: null,
  category_main: "여행",
  category_sub: "국내여행",
};

describe("ArchivePage", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("보관 항목을 불러오고 복원하면 목록에서 제거한다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [archivedItem],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...archivedItem, is_archived: false, archived_at: null }),
      });
    vi.stubGlobal("fetch", fetchMock);

    render(<ArchivePage />);

    expect(await screen.findByText("보관한 콘텐츠")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://localhost:4000/api/items?archived=true"
    );

    fireEvent.click(screen.getByRole("button", { name: "복원" }));
    await waitFor(() =>
      expect(screen.getByText("아직 보관한 콘텐츠가 없어요.")).toBeInTheDocument()
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:4000/api/items/1/archive",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ archived: false }),
      })
    );
  });

  it("제목과 요약으로 보관 항목을 검색하고 별도 빈 상태를 표시한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => [archivedItem, travelItem] })
    );
    render(<ArchivePage />);

    expect(await screen.findByText("보관한 콘텐츠")).toBeInTheDocument();
    const search = screen.getByRole("searchbox", { name: "아카이브 검색" });
    fireEvent.change(search, { target: { value: "여름 휴가" } });
    expect(screen.getByText("제주 여행 코스")).toBeInTheDocument();
    expect(screen.queryByText("보관한 콘텐츠")).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: "일치하지 않음" } });
    expect(screen.getByText("검색 결과가 없어요.")).toBeInTheDocument();
    expect(screen.queryByText("아직 보관한 콘텐츠가 없어요.")).not.toBeInTheDocument();
  });
});
