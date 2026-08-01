// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CategoriesPage from "./page";

const items = [
  {
    id: 1,
    title: "AWS 자격증 준비",
    summary: "클라우드 학습 가이드",
    content: "https://velog.io/aws",
    original_url: "https://velog.io/aws",
    image_url: null,
    source_platform: "web",
    category_main: "공부",
    category_sub: "클라우드",
    is_archived: false,
    archived_at: null,
    created_at: "2026-07-23T00:00:00.000Z",
  },
  {
    id: 2,
    title: "제주 여행 코스",
    summary: "여름 휴가 일정",
    content: "제주 맛집과 숙소",
    original_url: null,
    image_url: null,
    source_platform: "manual",
    category_main: "여행",
    category_sub: "국내여행",
    is_archived: false,
    archived_at: null,
    created_at: "2026-07-24T00:00:00.000Z",
  },
];

describe("CategoriesPage search", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("검색어와 카테고리 필터를 함께 적용한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => items })
    );
    render(<CategoriesPage />);

    expect(await screen.findByText("AWS 자격증 준비")).toBeInTheDocument();
    const search = screen.getByRole("searchbox", { name: "저장 콘텐츠 검색" });
    fireEvent.change(search, { target: { value: "여름 휴가" } });

    expect(screen.getByText("제주 여행 코스")).toBeInTheDocument();
    expect(screen.queryByText("AWS 자격증 준비")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "공부 1" }));
    expect(screen.getByText("검색 결과가 없어요.")).toBeInTheDocument();
  });

  it("완료 액션으로 항목을 아카이브에 보관한다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [items[0]] })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...items[0], is_archived: true, archived_at: new Date().toISOString() }),
      });
    vi.stubGlobal("fetch", fetchMock);
    render(<CategoriesPage />);

    expect(await screen.findByText("AWS 자격증 준비")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "AWS 자격증 준비 완료" }));

    await waitFor(() => expect(screen.queryByText("AWS 자격증 준비")).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:4000/api/items/1/archive",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ archived: true }) }),
    );
  });
});
