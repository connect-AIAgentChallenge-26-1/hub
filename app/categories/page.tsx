"use client";

import { useEffect, useMemo, useState } from "react";
import { AppHeader, BottomNav } from "../AppChrome";
import SwipeActionCard from "../SwipeActionCard";
import {
  apiBaseUrl,
  getRequestErrorMessage,
  matchesItemSearch,
  readApiError,
  type ArchiveItemResponse,
  type Item,
} from "../../lib/items";

type CategoryCount = {
  name: string;
  count: number;
};

function getMainCategory(item: Item) {
  return item.category_main === "개발" ? "공부" : item.category_main ?? "미분류";
}

function getSubCategory(item: Item) {
  return item.category_sub ?? "기타";
}

function categoryPillClass(name: string) {
  if (/쇼핑|패션/.test(name)) return "bg-[#f4e8df] text-[#a86d48]";
  if (/뷰티/.test(name)) return "bg-[#f7dfec] text-[#bf2874]";
  if (/영상|콘텐츠/.test(name)) return "bg-[#e9def3] text-[#7042b4]";
  if (/여행|뉴스/.test(name)) return "bg-[#dff0f7] text-[#2c7898]";
  if (/공부|개발|취업/.test(name)) return "bg-[#e1f1e3] text-[#367a4b]";
  return "bg-[#f1f1f3] text-[#66656b]";
}

export default function CategoriesPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [selectedMain, setSelectedMain] = useState("전체");
  const [selectedSub, setSelectedSub] = useState("전체");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchItems() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${apiBaseUrl}/api/items`);
        if (!response.ok) {
          throw new Error(await readApiError(response, "카테고리 목록을 불러오지 못했습니다."));
        }
        setItems(await response.json());
      } catch (requestError) {
        setError(getRequestErrorMessage(requestError, "카테고리 목록을 불러오지 못했습니다."));
      } finally {
        setLoading(false);
      }
    }

    void fetchItems();
  }, []);

  const mainCategories = useMemo<CategoryCount[]>(() => {
    const counts = new Map<string, number>();
    items.forEach((item) => {
      const category = getMainCategory(item);
      counts.set(category, (counts.get(category) ?? 0) + 1);
    });
    return Array.from(counts, ([name, count]) => ({ name, count })).sort((a, b) =>
      a.name.localeCompare(b.name, "ko")
    );
  }, [items]);

  const subCategories = useMemo<CategoryCount[]>(() => {
    if (selectedMain === "전체") return [];
    const counts = new Map<string, number>();
    items
      .filter((item) => getMainCategory(item) === selectedMain)
      .forEach((item) => {
        const category = getSubCategory(item);
        counts.set(category, (counts.get(category) ?? 0) + 1);
      });
    return Array.from(counts, ([name, count]) => ({ name, count })).sort((a, b) =>
      a.name.localeCompare(b.name, "ko")
    );
  }, [items, selectedMain]);

  const filteredItems = useMemo(
    () =>
      items.filter((item) => {
        const matchesMain =
          selectedMain === "전체" || getMainCategory(item) === selectedMain;
        const matchesSub = selectedSub === "전체" || getSubCategory(item) === selectedSub;
        return matchesMain && matchesSub && matchesItemSearch(item, searchQuery);
      }),
    [items, searchQuery, selectedMain, selectedSub]
  );

  function selectMainCategory(category: string) {
    setSelectedMain(category);
    setSelectedSub("전체");
  }

  async function archiveItem(id: number) {
    try {
      const response = await fetch(`${apiBaseUrl}/api/items/${id}/archive`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: true }),
      });
      if (!response.ok) throw new Error(await readApiError(response));
      const result: ArchiveItemResponse = await response.json();
      setItems((currentItems) => currentItems.filter((item) => item.id !== result.id));
    } catch (requestError) {
      throw new Error(
        getRequestErrorMessage(requestError, "항목을 보관하지 못했습니다.")
      );
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col bg-white px-6 pb-24 pt-8 sm:px-7">
      <AppHeader />

      <section className="mb-8">
        <h1 className="text-[28px] font-bold tracking-[-0.04em] text-ink">카테고리</h1>
        <p className="mt-2 text-sm text-muted">저장한 항목을 관심사별로 모아보세요.</p>
      </section>

      {loading && <p className="text-sm text-muted">불러오는 중...</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && !error && (
        <>
          <section className="mb-5">
            <label htmlFor="content-search" className="sr-only">
              저장 콘텐츠 검색
            </label>
            <input
              id="content-search"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="제목, 요약, 원문, 카테고리 검색"
            className="w-full rounded-xl2 border border-creamDeep bg-[#f7f7f8] px-4 py-3.5 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-ink"
            />
          </section>

          <section className="mb-6">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => selectMainCategory("전체")}
                className={`rounded-full px-3.5 py-2 text-xs font-semibold transition-colors ${
                  selectedMain === "전체"
                    ? "bg-ink text-white"
                    : "bg-[#f1f1f3] text-[#66656b]"
                }`}
              >
                전체 {items.length}
              </button>
              {mainCategories.map((category) => (
                <button
                  key={category.name}
                  type="button"
                  onClick={() => selectMainCategory(category.name)}
                  className={`rounded-full px-3.5 py-2 text-xs font-semibold transition-colors ${
                    selectedMain === category.name
                      ? "bg-ink text-white"
                      : categoryPillClass(category.name)
                  }`}
                >
                  {category.name} {category.count}
                </button>
              ))}
            </div>
          </section>

          {selectedMain !== "전체" && subCategories.length > 0 && (
            <section className="mb-6">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedSub("전체")}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    selectedSub === "전체"
                      ? "bg-ink text-white"
                      : "bg-[#f1f1f3] text-[#66656b]"
                  }`}
                >
                  전체
                </button>
                {subCategories.map((category) => (
                  <button
                    key={category.name}
                    type="button"
                    onClick={() => setSelectedSub(category.name)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                      selectedSub === category.name
                        ? "bg-ink text-white"
                        : categoryPillClass(category.name)
                    }`}
                  >
                    {category.name} {category.count}
                  </button>
                ))}
              </div>
            </section>
          )}

          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-muted">
                {selectedSub !== "전체" ? selectedSub : selectedMain}
              </h2>
              <span className="text-xs text-muted">{filteredItems.length}개</span>
            </div>

            {filteredItems.length === 0 ? (
              <div className="bg-white/60 rounded-xl px-4 py-10 text-center">
                <p className="text-sm text-muted">
                  {searchQuery.trim()
                    ? "검색 결과가 없어요."
                    : "해당 카테고리에 저장된 항목이 없어요."}
                </p>
              </div>
            ) : (
              <ul className="space-y-3">
                {filteredItems.map((item) => (
                  <SwipeActionCard
                    key={item.id}
                    item={item}
                    actionLabel="완료"
                    pendingLabel="보관 중"
                    onAction={archiveItem}
                    showDetails
                  />
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <BottomNav active="categories" />
    </main>
  );
}
