"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import SwipeActionCard from "../SwipeActionCard";
import {
  apiBaseUrl,
  getRequestErrorMessage,
  readApiError,
  type DeleteItemResponse,
  type Item,
} from "../../lib/items";

export default function ArchivePage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col bg-[#faf7f2] px-6 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-16 text-[#252322]">
      <header>
        <h1 className="text-[26px] font-bold leading-tight tracking-[-0.035em]">다 본 콘텐츠</h1>
        <p className="mt-3 text-[14px] text-[#9b9798]">밀어서 아카이브에서 정리할 수 있어요.</p>
      </header>

      <section aria-label="아카이브 콘텐츠" className="mt-7">
        {loading && <p className="text-sm text-[#9b9798]">불러오는 중...</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!loading && !error && items.length === 0 && (
          <div className="rounded-[18px] border border-[#eee9e2] bg-white px-5 py-10 text-center">
            <p className="text-sm font-medium">아카이브가 비어 있어요.</p>
            <p className="mt-1 text-xs text-[#9b9798]">카테고리에서 다 본 콘텐츠를 밀어보세요.</p>
          </div>
        )}
        {!loading && !error && items.length > 0 && (
          <ul className="space-y-4">
            {items.map((item) => (
              <SwipeActionCard
                key={item.id}
                item={item}
                actionLabel="삭제"
                pendingLabel="삭제 중"
                onAction={deleteItem}
                confirmMessage="이 콘텐츠를 영구 삭제할까요?"
              />
            ))}
          </ul>
        )}
      </section>

      <p className="mt-auto pt-10 text-center text-xs text-[#b6b2b5]" aria-hidden="true">←&nbsp; 밀어서&nbsp; 삭제</p>

      <nav className="fixed bottom-0 left-0 right-0 border-t border-creamDeep bg-white">
        <div className="mx-auto flex max-w-md justify-around pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 text-xs text-muted">
          <Link href="/">홈</Link>
          <Link href="/categories">카테고리</Link>
          <Link href="/archive" className="font-medium text-accentDark">아카이브</Link>
          <span>설정</span>
        </div>
      </nav>
    </main>
  );
}
