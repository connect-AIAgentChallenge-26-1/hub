"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ItemCard from "../ItemCard";
import {
  apiBaseUrl,
  getRequestErrorMessage,
  matchesItemSearch,
  readApiError,
  type DeleteItemResponse,
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

  async function deleteItem(id: number) {
    try {
      const response = await fetch(`${apiBaseUrl}/api/items/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error(await readApiError(response));
      const result: DeleteItemResponse = await response.json();
      setItems((currentItems) => currentItems.filter((item) => item.id !== result.id));
    } catch (requestError) {
      throw new Error(getRequestErrorMessage(requestError, "항목을 삭제하지 못했습니다."));
    }
  }

  async function changeArchiveState(id: number, archived: boolean) {
    try {
      const response = await fetch(`${apiBaseUrl}/api/items/${id}/archive`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived }),
      });
      if (!response.ok) throw new Error(await readApiError(response));
      const result: ArchiveItemResponse = await response.json();
      setItems((currentItems) =>
        archived
          ? currentItems.filter((item) => item.id !== result.id)
          : currentItems.map((item) => (item.id === result.id ? result : item))
      );
    } catch (requestError) {
      throw new Error(
        getRequestErrorMessage(requestError, "항목을 보관하지 못했습니다.")
      );
    }
  }

  return (
    <main className="min-h-screen bg-cream flex flex-col max-w-md mx-auto px-5 pt-6 pb-24">
      <header className="flex items-center justify-between mb-8">
        <Link href="/" className="text-xl font-semibold tracking-tight text-ink">
          later.
        </Link>
        <div className="w-8 h-8 rounded-full bg-white border border-creamDeep" />
      </header>

      <section className="mb-7">
        <h1 className="text-2xl font-bold text-ink mb-1">카테고리</h1>
        <p className="text-sm text-muted">저장한 항목을 관심사별로 모아보세요.</p>
      </section>

      {loading && <p className="text-sm text-muted">불러오는 중...</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && !error && (
        <>
          <section className="mb-6">
            <label htmlFor="content-search" className="sr-only">
              저장 콘텐츠 검색
            </label>
            <input
              id="content-search"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="제목, 요약, 원문, 카테고리 검색"
              className="w-full rounded-xl border border-creamDeep bg-white px-4 py-3 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-accent"
            />
          </section>

          <section className="mb-6">
            <h2 className="text-sm font-medium text-muted mb-3">대분류</h2>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => selectMainCategory("전체")}
                className={`text-xs rounded-full px-3 py-2 font-medium transition-colors ${
                  selectedMain === "전체"
                    ? "bg-accent text-white"
                    : "border border-creamDeep bg-white text-muted hover:border-accent hover:text-accentDark"
                }`}
              >
                전체 {items.length}
              </button>
              {mainCategories.map((category) => (
                <button
                  key={category.name}
                  type="button"
                  onClick={() => selectMainCategory(category.name)}
                  className={`text-xs rounded-full px-3 py-2 font-medium transition-colors ${
                    selectedMain === category.name
                      ? "bg-accent text-white"
                      : "border border-creamDeep bg-white text-muted hover:border-accent hover:text-accentDark"
                  }`}
                >
                  {category.name} {category.count}
                </button>
              ))}
            </div>
          </section>

          {selectedMain !== "전체" && subCategories.length > 0 && (
            <section className="mb-6">
              <h2 className="text-sm font-medium text-muted mb-3">소분류</h2>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedSub("전체")}
                  className={`text-xs rounded-full px-3 py-1.5 font-medium border transition-colors ${
                    selectedSub === "전체"
                      ? "border-accent bg-accent text-white"
                      : "border-creamDeep bg-white text-muted hover:border-accent hover:text-accentDark"
                  }`}
                >
                  전체
                </button>
                {subCategories.map((category) => (
                  <button
                    key={category.name}
                    type="button"
                    onClick={() => setSelectedSub(category.name)}
                    className={`text-xs rounded-full px-3 py-1.5 font-medium border transition-colors ${
                      selectedSub === category.name
                        ? "border-accent bg-accent text-white"
                        : "border-creamDeep bg-white text-muted hover:border-accent hover:text-accentDark"
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
              <>
                <ul className="space-y-3">
                  {filteredItems.map((item) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      onDelete={deleteItem}
                      onArchive={changeArchiveState}
                    />
                  ))}
                </ul>
                <p className="mt-4 text-center text-xs text-muted">← 밀어서 완료</p>
              </>
            )}
          </section>
        </>
      )}

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-creamDeep">
        <div className="max-w-md mx-auto flex justify-around pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] text-xs text-muted">
          <Link href="/">홈</Link>
          <Link href="/categories" className="text-accentDark font-medium">
            카테고리
          </Link>
          <Link href="/archive">아카이브</Link>
          <span>설정</span>
        </div>
      </nav>
    </main>
  );
}
