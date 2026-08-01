"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  apiBaseUrl,
  getRequestErrorMessage,
  readApiError,
  type ArchiveItemResponse,
  type Item,
} from "../../lib/items";

const SWIPE_THRESHOLD = 112;
const ACTION_WIDTH = 134;

function displayTitle(item: Item) {
  if (item.title && !/^https?:\/\//i.test(item.title)) return item.title;
  if (item.category_sub) return `${item.category_sub} 관련 콘텐츠`;
  return item.image_url ? "저장한 이미지" : "저장한 콘텐츠";
}

function relativeDate(value: string) {
  const elapsedDays = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000),
  );
  if (elapsedDays === 0) return "오늘";
  if (elapsedDays === 1) return "어제";
  return `${elapsedDays}일 전`;
}

type SwipeCardProps = {
  item: Item;
  onComplete: (id: number) => Promise<void>;
};

function SwipeCard({ item, onComplete }: SwipeCardProps) {
  const [offset, setOffset] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dragStart = useRef<{ x: number; offset: number } | null>(null);

  async function complete() {
    if (pending) return;
    setPending(true);
    setError(null);
    setOffset(ACTION_WIDTH);
    try {
      await onComplete(item.id);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "아카이브에 보관하지 못했습니다.",
      );
      setOffset(0);
      setPending(false);
    }
  }

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (pending || event.button !== 0) return;
    dragStart.current = { x: event.clientX, offset };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    if (!dragStart.current) return;
    const nextOffset = dragStart.current.offset + event.clientX - dragStart.current.x;
    setOffset(Math.max(0, Math.min(ACTION_WIDTH, nextOffset)));
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    if (!dragStart.current) return;
    dragStart.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (offset >= SWIPE_THRESHOLD) void complete();
    else setOffset(offset >= ACTION_WIDTH / 2 ? ACTION_WIDTH : 0);
  }

  return (
    <li>
      <div className="relative h-[100px] overflow-hidden rounded-[18px] border border-[#eee9e2] bg-[#f7a258]">
        <div className="absolute inset-y-0 right-0 flex w-[134px] items-center justify-center">
          <button
            type="button"
            aria-label={`${displayTitle(item)} 완료`}
            onClick={() => void complete()}
            disabled={pending}
            className="flex h-full w-full flex-col items-center justify-center gap-1 text-sm font-semibold text-white disabled:opacity-70"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white text-sm leading-none">
              ✓
            </span>
            {pending ? "보관 중" : "완료"}
          </button>
        </div>

        <div
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          style={{ transform: `translateX(${offset}px)`, touchAction: "pan-y" }}
          className="absolute inset-0 flex cursor-grab select-none items-center gap-4 rounded-[17px] bg-white px-4 transition-transform duration-200 ease-out active:cursor-grabbing"
        >
          {item.image_url ? (
            <img
              src={item.image_url}
              alt=""
              draggable={false}
              className="h-16 w-16 shrink-0 rounded-[14px] object-cover"
            />
          ) : (
            <div aria-hidden="true" className="archive-placeholder h-16 w-16 shrink-0 rounded-[14px]" />
          )}
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-[#252322]">
              {displayTitle(item)}
            </p>
            <p className="mt-1 truncate text-xs text-[#aaa7aa]">
              {item.source_platform ?? "manual"} · {relativeDate(item.created_at)}
            </p>
          </div>
        </div>
      </div>
      {error && <p className="mt-1 px-2 text-xs text-red-600">{error}</p>}
    </li>
  );
}

export default function ArchivePage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchItems() {
      try {
        const response = await fetch(`${apiBaseUrl}/api/items?archived=false`);
        if (!response.ok) {
          throw new Error(await readApiError(response, "콘텐츠를 불러오지 못했습니다."));
        }
        setItems(await response.json());
      } catch (requestError) {
        setError(getRequestErrorMessage(requestError, "콘텐츠를 불러오지 못했습니다."));
      } finally {
        setLoading(false);
      }
    }

    void fetchItems();
  }, []);

  async function archiveItem(id: number) {
    const response = await fetch(`${apiBaseUrl}/api/items/${id}/archive`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: true }),
    });
    if (!response.ok) throw new Error(await readApiError(response));
    const result: ArchiveItemResponse = await response.json();
    setItems((current) => current.filter((item) => item.id !== result.id));
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col bg-[#faf7f2] px-6 pb-[calc(1.75rem+env(safe-area-inset-bottom))] pt-16 text-[#252322]">
      <header>
        <h1 className="text-[26px] font-bold leading-tight tracking-[-0.035em]">
          다 봤으면 스와이프
        </h1>
        <p className="mt-3 text-[14px] text-[#9b9798]">
          본 콘텐츠는 밀어서 아카이브로 정리돼요.
        </p>
      </header>

      <section aria-label="확인할 콘텐츠" className="mt-7">
        {loading && <p className="text-sm text-[#9b9798]">불러오는 중...</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!loading && !error && items.length === 0 && (
          <div className="rounded-[18px] border border-[#eee9e2] bg-white px-5 py-10 text-center">
            <p className="text-sm font-medium">모두 확인했어요.</p>
            <p className="mt-1 text-xs text-[#9b9798]">새로 저장한 콘텐츠가 여기에 나타나요.</p>
          </div>
        )}
        {!loading && !error && items.length > 0 && (
          <ul className="space-y-4">
            {items.map((item) => (
              <SwipeCard key={item.id} item={item} onComplete={archiveItem} />
            ))}
          </ul>
        )}
      </section>

      <p className="mt-auto pt-10 text-center text-xs text-[#b6b2b5]" aria-hidden="true">
        ←&nbsp; 밀어서&nbsp; 완료
      </p>
    </main>
  );
}
