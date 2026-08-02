"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AppHeader, BottomNav } from "./AppChrome";
import {
  apiBaseUrl,
  getRequestErrorMessage,
  readApiError,
  type Item,
} from "../lib/items";
import { getImageValidationError } from "../lib/image";

export default function Home() {
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [savedItem, setSavedItem] = useState<Item | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!selectedImage) {
      setImagePreviewUrl(null);
      return;
    }
    const previewUrl = URL.createObjectURL(selectedImage);
    setImagePreviewUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [selectedImage]);

  async function handleSave() {
    if (!input.trim() && !selectedImage) return;
    setSaving(true);
    setError(null);
    setSavedItem(null);

    try {
      const response = selectedImage
        ? await fetch(`${apiBaseUrl}/api/items`, {
            method: "POST",
            body: (() => {
              const formData = new FormData();
              formData.append("content", input.trim());
              formData.append("image", selectedImage);
              return formData;
            })(),
          })
        : await fetch(`${apiBaseUrl}/api/items`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: input.trim() }),
          });
      if (!response.ok) throw new Error(await readApiError(response));
      setSavedItem(await response.json());
      setInput("");
      setSelectedImage(null);
      setImageError(null);
      if (imageInputRef.current) imageInputRef.current.value = "";
    } catch (requestError) {
      setError(
        getRequestErrorMessage(requestError, "항목을 저장하지 못했습니다."),
      );
    } finally {
      setSaving(false);
    }
  }

  function selectImage(file: File | undefined) {
    if (!file) return;
    const validationError = getImageValidationError(file);
    if (validationError) {
      setImageError(validationError);
      setSelectedImage(null);
      if (imageInputRef.current) imageInputRef.current.value = "";
      return;
    }
    setImageError(null);
    setSelectedImage(file);
  }

  function removeImage() {
    setSelectedImage(null);
    setImageError(null);
    if (imageInputRef.current) imageInputRef.current.value = "";
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col bg-white px-6 pb-24 pt-8 sm:px-7">
      <AppHeader />

      {/* 저장 입력 영역 */}
      <section className="mb-10">
        <h1 className="mb-6 text-[32px] font-bold leading-[1.12] tracking-[-0.05em] text-ink">
          무엇을
          <br />
          저장할까요?
        </h1>

        <div className="rounded-[22px] border border-creamDeep bg-white p-5 shadow-[0_14px_32px_rgba(20,20,25,0.06)]">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                if (!saving && (input.trim() || selectedImage))
                  void handleSave();
              }
            }}
            placeholder="링크나 텍스트를 붙여넣으세요"
            rows={3}
            className="w-full resize-none bg-transparent text-[15px] leading-6 text-ink outline-none placeholder:text-muted"
          />
          {imagePreviewUrl && selectedImage && (
            <div className="mt-3 rounded-xl border border-creamDeep bg-cream/40 p-2">
              <img
                src={imagePreviewUrl}
                alt="선택한 이미지 미리보기"
              className="max-h-48 w-full rounded-xl object-cover"
              />
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="truncate text-xs text-muted">
                  {selectedImage.name}
                </span>
                <button
                  type="button"
                  onClick={removeImage}
                  className="shrink-0 text-xs text-red-500 hover:text-red-700"
                >
                  이미지 제거
                </button>
              </div>
            </div>
          )}
          {imageError && (
            <p className="mt-2 text-xs text-red-600">{imageError}</p>
          )}
          <div className="flex items-center justify-between mt-2">
            <input
              ref={imageInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(event) => selectImage(event.target.files?.[0])}
            />
            <button
              type="button"
              className="flex items-center gap-1 rounded-full bg-[#f1f1f3] px-3 py-2 text-xs font-medium text-ink"
              onClick={() => imageInputRef.current?.click()}
            >
              📎 {selectedImage ? "이미지 변경" : "이미지"}
            </button>
            <span className="max-w-[8rem] text-right text-xs leading-4 text-muted">스크린샷도 저장돼요</span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving || (!input.trim() && !selectedImage)}
          className="mt-5 w-full rounded-xl2 bg-ink py-4 font-semibold text-white shadow-[0_12px_28px_rgba(20,20,25,0.12)] transition-colors hover:bg-[#303036] disabled:opacity-40"
        >
          {saving ? "저장하는 중..." : "저장"}
        </button>
      </section>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
      {savedItem && (
        <section
          role="status"
          className="mb-4 rounded-xl2 border border-creamDeep bg-[#f7f7f8] px-5 py-4"
        >
          <p className="text-sm font-medium text-ink">
            &lsquo;{savedItem.title ?? "저장한 항목"}&rsquo;을 저장했어요.
          </p>
          <p className="mt-1 text-xs text-muted">
            {savedItem.category_main ?? "미분류"}
            {savedItem.category_sub ? ` · ${savedItem.category_sub}` : ""}
          </p>
          <Link
            href="/categories"
            className="mt-3 inline-block text-sm font-semibold text-ink underline underline-offset-4"
          >
            분류 결과 확인하기 →
          </Link>
        </section>
      )}

      <BottomNav active="home" />
    </main>
  );
}
