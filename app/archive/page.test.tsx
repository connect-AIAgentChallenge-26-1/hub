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
  is_archived: true,
  archived_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
};

const secondItem = {
  ...item,
  id: 2,
  title: "데이터베이스 학습 자료",
  summary: "인덱스와 저장소의 차이를 정리합니다.",
  source_platform: "youtube",
  category_main: "공부",
  category_sub: "프로그래밍",
};

describe("ArchivePage", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("아카이브 항목을 불러와 스와이프 액션으로 삭제한다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [item] })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, id: item.id }),
      });
    vi.stubGlobal("fetch", fetchMock);

    render(<ArchivePage />);

    expect(await screen.findByText("겨울 코트 추천")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://localhost:4000/api/items?archived=true",
    );

    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "겨울 코트 추천 삭제" }));
    await waitFor(() => expect(screen.getByText("아카이브가 비어 있어요.")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:4000/api/items/1",
      expect.objectContaining({
        method: "DELETE",
      }),
    );
  });

  it("아카이브 항목을 누르면 AI 요약과 원본 링크를 표시한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => [item] }),
    );

    render(<ArchivePage />);

    await screen.findByText("겨울 코트 추천");
    const card = screen.getByRole("button", { expanded: false });
    expect(card).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(item.summary)).not.toBeInTheDocument();

    fireEvent.click(card);

    expect(card).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(item.summary)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /원본 링크 열기/ })).toHaveAttribute(
      "href",
      item.original_url,
    );
    expect(screen.getByRole("link", { name: /원본 링크 열기/ })).toHaveAttribute(
      "target",
      "_blank",
    );
  });

  it("빈 목록 안내를 표시한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => [] }),
    );
    render(<ArchivePage />);

    expect(await screen.findByText("아카이브가 비어 있어요.")).toBeInTheDocument();
    expect(screen.getByText("카테고리에서 다 본 콘텐츠를 밀어보세요.")).toBeInTheDocument();
  });

  it("제목·요약·출처·카테고리로 아카이브 항목을 검색한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => [item, secondItem] }),
    );
    render(<ArchivePage />);

    const search = await screen.findByRole("searchbox", { name: "아카이브 콘텐츠 검색" });
    fireEvent.change(search, { target: { value: "프로그래밍" } });
    expect(screen.getByText("데이터베이스 학습 자료")).toBeInTheDocument();
    expect(screen.queryByText("겨울 코트 추천")).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: "없는 검색어" } });
    expect(screen.getByText("검색 결과가 없어요.")).toBeInTheDocument();
  });
});
