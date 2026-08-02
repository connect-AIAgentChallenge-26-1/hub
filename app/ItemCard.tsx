"use client";

import { useState } from "react";
import type { Item } from "../lib/items";
import SourceLabel from "./SourceLabel";

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

export default function ItemCard({ item, onDelete, onArchive }: ItemCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [pendingAction, setPendingAction] = useState<"delete" | "archive" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "아카이브 상태를 변경하지 못했습니다."
      );
      setPendingAction(null);
    }
  }

  const isPending = pendingAction !== null;
  const summary = item.summary?.trim() || "아직 생성된 요약이 없습니다.";

  return (
    <li className="bg-white/60 rounded-xl px-3 py-3 transition-colors hover:bg-white/80">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setExpanded((current) => !current);
          }
        }}
        className="cursor-pointer outline-none"
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
            <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted">
              <SourceLabel item={item} />
              <span aria-hidden="true">·</span>
              <span className="shrink-0">{new Date(item.created_at).toLocaleDateString("ko-KR")}</span>
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <div className="flex gap-2">
              {onArchive && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    void changeArchiveState();
                  }}
                  disabled={isPending}
                  className="text-xs text-accentDark hover:text-accent disabled:opacity-50"
                >
                  {pendingAction === "archive"
                    ? item.is_archived
                      ? "복원 중..."
                      : "보관 중..."
                    : item.is_archived
                      ? "복원"
                      : "보관"}
                </button>
              )}
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
      {actionError && <p className="mt-2 text-xs text-red-600">{actionError}</p>}
    </li>
  );
}
