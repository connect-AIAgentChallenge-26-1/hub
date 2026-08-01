"use client";

import { useRef, useState } from "react";
import type { Item } from "../lib/items";

type ItemCardProps = {
  item: Item;
  onDelete: (id: number) => Promise<void>;
  onArchive?: (id: number, archived: boolean) => Promise<void>;
};

function getDisplayTitle(item: Item) {
  if (item.title && !/^https?:\/\//i.test(item.title)) return item.title;
  if (item.category_sub) return `${item.category_sub} 관련 콘텐츠`;
  if (item.category_main && item.category_main !== "미분류") {
    return `${item.category_main} 관련 콘텐츠`;
  }
  return item.image_url ? "저장한 이미지" : "저장한 웹 콘텐츠";
}

const SWIPE_MAX = 140;
const SWIPE_TAP_TOLERANCE = 8;

export default function ItemCard({ item, onDelete, onArchive }: ItemCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [pendingAction, setPendingAction] = useState<"delete" | "archive" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const cardRef = useRef<HTMLLIElement>(null);
  const dragStartXRef = useRef<number | null>(null);
  const draggedRef = useRef(false);

  const isPending = pendingAction !== null;

  async function deleteItem() {
    if (!window.confirm("이 항목을 삭제할까요? 삭제 후에는 되돌릴 수 없습니다.")) return;

    setPendingAction("delete");
    setActionError(null);
    try {
      await onDelete(item.id);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "항목을 삭제하지 못했습니다.");
      setPendingAction(null);
    }
  }

  async function changeArchiveState() {
    if (!onArchive) return;
    setPendingAction("archive");
    setActionError(null);
    try {
      await onArchive(item.id, !item.is_archived);
      setPendingAction(null);
      setDragX(0);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "아카이브 상태를 변경하지 못했습니다."
      );
      setPendingAction(null);
      setDragX(0);
    }
  }

  function getSwipeThreshold() {
    const width = cardRef.current?.offsetWidth ?? 320;
    return Math.min(160, Math.max(64, width * 0.35));
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!onArchive || isPending) return;
    dragStartXRef.current = event.clientX;
    draggedRef.current = false;
    setIsDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (dragStartXRef.current === null) return;
    const delta = event.clientX - dragStartXRef.current;
    if (Math.abs(delta) > SWIPE_TAP_TOLERANCE) draggedRef.current = true;
    setDragX(Math.max(-SWIPE_MAX, Math.min(0, delta)));
  }

  function handlePointerUp() {
    if (dragStartXRef.current === null) return;
    dragStartXRef.current = null;
    setIsDragging(false);
    if (dragX <= -getSwipeThreshold()) {
      setDragX(-SWIPE_MAX);
      void changeArchiveState();
    } else {
      setDragX(0);
    }
  }

  function handleCardClick() {
    if (draggedRef.current) {
      draggedRef.current = false;
      return;
    }
    setExpanded((current) => !current);
  }

  const summary = item.summary?.trim() || "아직 생성된 요약이 없습니다.";
  const archiveLabel = item.is_archived ? "복원" : "완료";

  return (
    <li ref={cardRef} className="relative overflow-hidden rounded-xl">
      {onArchive && (
        <div
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-end gap-2 rounded-xl bg-accent px-6 text-white"
        >
          <span className="flex flex-col items-center gap-1 text-xs font-medium">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-accentDark">
              ✓
            </span>
            {archiveLabel}
          </span>
        </div>
      )}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={handleCardClick}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setExpanded((current) => !current);
          }
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          transform: `translateX(${dragX}px)`,
          transition: isDragging ? "none" : "transform 200ms ease-out",
        }}
        className="relative touch-pan-y select-none cursor-pointer bg-white/60 px-3 py-3 outline-none transition-colors hover:bg-white/80"
      >
        {item.image_url && (
          <img
            src={item.image_url}
            alt={item.title || "저장된 이미지"}
            className="mb-3 max-h-64 w-full rounded-lg object-cover"
          />
        )}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-ink font-medium break-words">
              {getDisplayTitle(item)}
            </p>
            <p className="text-xs text-muted">
              {item.source_platform ?? "manual"} ·{" "}
              {new Date(item.created_at).toLocaleDateString("ko-KR")}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                void deleteItem();
              }}
              disabled={isPending}
              className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
            >
              {pendingAction === "delete" ? "삭제 중..." : "삭제"}
            </button>
          </div>
        </div>
        {expanded && (
          <div className="mt-4 border-t border-creamDeep pt-3">
            <h3 className="text-xs font-semibold text-muted">AI 요약</h3>
            <p className="mt-2 whitespace-pre-line text-sm leading-6 text-ink">
              {summary}
            </p>
            {item.original_url && (
              <a
                href={item.original_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(event) => event.stopPropagation()}
                className="mt-4 block truncate border-t border-creamDeep pt-3 text-xs text-accentDark underline underline-offset-2"
                title={item.original_url}
              >
                원본 링크 열기 ↗
              </a>
            )}
          </div>
        )}
      </div>
      {actionError && <p className="mt-2 px-3 text-xs text-red-600">{actionError}</p>}
    </li>
  );
}
