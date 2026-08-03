"use client";

import { useEffect, useState } from "react";
import { AppHeader, BottomNav } from "../AppChrome";
import SwipeActionCard from "../SwipeActionCard";
import {
  apiBaseUrl,
  getRequestErrorMessage,
  matchesItemSearch,
  readApiError,
  type DeleteItemResponse,
  type Item,
} from "../../lib/items";

export default function ArchivePage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredItems = items.filter((item) => matchesItemSearch(item, searchQuery));

  useEffect(() => {
    async function fetchArchivedItems() {
      try {
        const response = await fetch(`${apiBaseUrl}/api/items?archived=true`);
        if (!response.ok) {
          throw new Error(await readApiError(response, "아카이브를 불러오지 못했습니다."));
        }
        setItems(await response.json());
      } catch (requestError) {
        setError(getRequestErrorMessage(requestError, "아카이브를 불러오지 못했습니다."));
      } finally {
        setLoading(false);
      }
    }
    void fetchArchivedItems();
  }, []);

  async function deleteItem(id: number) {
    const response = await fetch(`${apiBaseUrl}/api/items/${id}`, { method: "DELETE" });
    if (!response.ok) throw new Error(await readApiError(response));
    const result: DeleteItemResponse = await response.json();
    setItems((current) => current.filter((item) => item.id !== result.id));
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col bg-white px-6 pb-24 pt-8 sm:px-7">
      <AppHeader />

      <section className="mb-8">
        <h1 className="text-[28px] font-bold tracking-[-0.04em] text-ink">아카이브</h1>
        <p className="mt-2 text-sm text-muted">다 본 콘텐츠를 모아두었어요. 밀어서 삭제해요.</p>
      </section>

      {!loading && !error && items.length > 0 && (
        <section className="mb-5">
          <label htmlFor="archive-search" className="sr-only">
            아카이브 콘텐츠 검색
          </label>
          <input
            id="archive-search"
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="제목, 요약, 원문, 카테고리 검색"
            className="w-full rounded-xl2 border border-creamDeep bg-[#f7f7f8] px-4 py-3.5 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-ink"
          />
        </section>
      )}

      <section aria-label="아카이브 콘텐츠">
        {loading && <p className="text-sm text-muted">불러오는 중...</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!loading && !error && items.length === 0 && (
          <div className="rounded-xl bg-white/60 px-4 py-10 text-center">
            <p className="text-sm font-medium">아카이브가 비어 있어요.</p>
            <p className="mt-1 text-xs text-muted">카테고리에서 다 본 콘텐츠를 밀어보세요.</p>
          </div>
        )}
        {!loading && !error && items.length > 0 && filteredItems.length === 0 && (
          <div className="rounded-xl bg-white/60 px-4 py-10 text-center">
            <p className="text-sm font-medium">검색 결과가 없어요.</p>
            <p className="mt-1 text-xs text-muted">다른 검색어로 다시 찾아보세요.</p>
          </div>
        )}
        {!loading && !error && filteredItems.length > 0 && (
          <ul className="space-y-2.5">
            {filteredItems.map((item) => (
              <SwipeActionCard
                key={item.id}
                item={item}
                actionLabel="삭제"
                pendingLabel="삭제 중"
                onAction={deleteItem}
                confirmMessage="이 콘텐츠를 영구 삭제할까요?"
                showDetails
              />
            ))}
          </ul>
        )}
      </section>

      <p className="mt-auto pt-10 text-center text-xs text-muted/60" aria-hidden="true">←&nbsp; 밀어서&nbsp; 삭제</p>

      <BottomNav active="archive" />
    </main>
  );
}
