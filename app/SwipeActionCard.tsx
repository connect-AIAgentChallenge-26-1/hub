"use client";

import { useRef, useState, type PointerEvent } from "react";
import type { Item } from "../lib/items";

const ACTION_WIDTH = 132;
const SWIPE_THRESHOLD = 104;

function displayTitle(item: Item) {
  if (item.title && !/^https?:\/\//i.test(item.title)) return item.title;
  if (item.category_sub) return `${item.category_sub} 관련 콘텐츠`;
  return item.image_url ? "저장한 이미지" : "저장한 콘텐츠";
}

function relativeDate(value: string) {
  const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000));
  if (days === 0) return "오늘";
  if (days === 1) return "어제";
  return `${days}일 전`;
}

type SwipeActionCardProps = {
  item: Item;
  actionLabel: "완료" | "삭제";
  pendingLabel: string;
  onAction: (id: number) => Promise<void>;
  confirmMessage?: string;
  showDetails?: boolean;
};

export default function SwipeActionCard({
  item,
  actionLabel,
  pendingLabel,
  onAction,
  confirmMessage,
  showDetails = false,
}: SwipeActionCardProps) {
  const [offset, setOffset] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const drag = useRef<{ startX: number; startOffset: number; currentOffset: number } | null>(null);
  const didDrag = useRef(false);

  async function runAction() {
    if (pending) return;
    if (confirmMessage && !window.confirm(confirmMessage)) {
      setOffset(0);
      return;
    }
    setPending(true);
    setError(null);
    setOffset(ACTION_WIDTH);
    try {
      await onAction(item.id);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "요청을 처리하지 못했습니다.");
      setOffset(0);
      setPending(false);
    }
  }

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (pending || event.button !== 0) return;
    didDrag.current = false;
    drag.current = { startX: event.clientX, startOffset: offset, currentOffset: offset };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    const next = Math.max(
      0,
      Math.min(ACTION_WIDTH, drag.current.startOffset + drag.current.startX - event.clientX),
    );
    drag.current.currentOffset = next;
    if (Math.abs(event.clientX - drag.current.startX) > 5) didDrag.current = true;
    setOffset(next);
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    const finalOffset = drag.current.currentOffset;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (finalOffset >= SWIPE_THRESHOLD) void runAction();
    else setOffset(finalOffset >= ACTION_WIDTH / 2 ? ACTION_WIDTH : 0);
  }

  const title = displayTitle(item);

  return (
    <li>
      <div className="relative overflow-hidden rounded-xl2 bg-accent">
        <div className="absolute inset-y-0 right-0 w-[132px]">
          <button
            type="button"
            aria-label={`${title} ${actionLabel}`}
            disabled={pending}
            onClick={() => void runAction()}
            className="flex h-full w-full flex-col items-center justify-center gap-1 text-sm font-semibold text-white disabled:opacity-70"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white text-sm leading-none">
              {actionLabel === "완료" ? "✓" : "×"}
            </span>
            {pending ? pendingLabel : actionLabel}
          </button>
        </div>
        <div
          data-testid={`swipe-card-${item.id}`}
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onClick={() => {
            if (didDrag.current) {
              didDrag.current = false;
              return;
            }
            if (showDetails) setExpanded((current) => !current);
          }}
          role={showDetails ? "button" : undefined}
          tabIndex={showDetails ? 0 : undefined}
          aria-expanded={showDetails ? expanded : undefined}
          onKeyDown={(event) => {
            if (showDetails && (event.key === "Enter" || event.key === " ")) {
              event.preventDefault();
              setExpanded((current) => !current);
            }
          }}
          style={{ transform: `translateX(-${offset}px)`, touchAction: "pan-y" }}
          className="relative min-h-[72px] cursor-grab select-none rounded-xl2 border border-creamDeep bg-white px-5 py-3.5 transition-transform duration-200 ease-out active:cursor-grabbing"
        >
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-ink">{title}</p>
            <p className="mt-1 truncate text-xs text-muted">
              {item.source_platform ?? "manual"} · {relativeDate(item.created_at)}
            </p>
            {showDetails && expanded && (
              <div className="mt-5 border-t border-creamDeep pt-4">
                <p className="text-xs font-semibold text-muted">AI 요약</p>
                <p className="mt-2 whitespace-pre-line text-sm leading-6 text-ink">
                  {item.summary?.trim() || "아직 생성된 요약이 없습니다."}
                </p>
                {item.original_url && (
                  <a
                    href={item.original_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(event) => event.stopPropagation()}
                    className="mt-4 block border-t border-creamDeep pt-4 text-sm font-medium text-ink underline underline-offset-4"
                  >
                    원본 링크 열기 ↗
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      {error && <p className="mt-1 px-2 text-xs text-red-600">{error}</p>}
    </li>
  );
}
