"use client";

import { useState } from "react";

type Item = {
  id: number;
  title: string;
  originalUrl: string | null;
  sourcePlatform: string;
  categoryMain: string;
  createdAt: string;
};

const MOCK_ITEMS: Item[] = [
  {
    id: 1,
    title: "나중에 보고 싶은 유튜브 영상",
    originalUrl: "https://www.youtube.com/watch?v=example",
    sourcePlatform: "YouTube",
    categoryMain: "영상",
    createdAt: "2026-07-13T09:00:00.000Z",
  },
  {
    id: 2,
    title: "쇼핑할 때 참고할 상품",
    originalUrl: "https://smartstore.naver.com/example",
    sourcePlatform: "Naver",
    categoryMain: "쇼핑",
    createdAt: "2026-07-12T09:00:00.000Z",
  },
];

function isValidUrl(value: string) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function detectSourcePlatform(url: string) {
  const hostname = new URL(url).hostname.toLowerCase();

  if (hostname.includes("youtube.com") || hostname.includes("youtu.be")) {
    return "YouTube";
  }

  if (hostname.includes("instagram.com")) {
    return "Instagram";
  }

  if (hostname.includes("twitter.com") || hostname.includes("x.com")) {
    return "X";
  }

  if (hostname.includes("naver.com")) {
    return "Naver";
  }

  return "Web";
}

export default function Home() {
  const [input, setInput] = useState("");
  const [items, setItems] = useState<Item[]>(MOCK_ITEMS);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSave() {
    const trimmedInput = input.trim();

    if (!trimmedInput) {
      setErrorMessage("저장할 링크나 텍스트를 입력해 주세요.");
      return;
    }

    if (isSaving) {
      return;
    }

    setIsSaving(true);
    setErrorMessage("");

    // 서버 요청을 가정한 mock 지연
    await new Promise((resolve) => setTimeout(resolve, 500));

    const isUrl = isValidUrl(trimmedInput);

    const newItem: Item = {
      id: Date.now(),
      title: isUrl ? trimmedInput : trimmedInput.slice(0, 60),
      originalUrl: isUrl ? trimmedInput : null,
      sourcePlatform: isUrl ? detectSourcePlatform(trimmedInput) : "Text",
      categoryMain: "미분류",
      createdAt: new Date().toISOString(),
    };

    setItems((previousItems) => [newItem, ...previousItems]);
    setInput("");
    setIsSaving(false);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      handleSave();
    }
  }

  return (
    <main className="min-h-screen bg-cream px-5 pb-24 pt-6">
      <div className="mx-auto max-w-md">
        <header className="mb-8 flex items-center justify-between">
          <span className="text-xl font-semibold tracking-tight text-ink">
            later.
          </span>

          <div
            className="h-8 w-8 rounded-full border border-creamDeep bg-white"
            aria-label="프로필"
          />
        </header>

        <section className="mb-8">
          <h1 className="mb-4 text-2xl font-bold leading-snug text-ink">
            무엇을
            <br />
            저장할까요?
          </h1>

          <div className="rounded-xl2 border border-creamDeep bg-white p-4 shadow-sm">
            <textarea
              value={input}
              onChange={(event) => {
                setInput(event.target.value);

                if (errorMessage) {
                  setErrorMessage("");
                }
              }}
              onKeyDown={handleKeyDown}
              placeholder="링크나 텍스트를 붙여넣으세요"
              rows={4}
              className="w-full resize-none bg-transparent text-sm text-ink outline-none placeholder:text-muted"
            />

            <div className="mt-2 flex items-center justify-between">
              <button
                type="button"
                className="rounded-full border border-creamDeep px-3 py-1.5 text-xs text-muted"
                onClick={() =>
                  alert("이미지 업로드는 이후 이슈에서 구현합니다.")
                }
              >
                이미지
              </button>

              <span className="text-xs text-muted">⌘ + Enter로 저장</span>
            </div>
          </div>

          {errorMessage && (
            <p className="mt-2 text-sm text-red-600">{errorMessage}</p>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !input.trim()}
            className="mt-4 w-full rounded-xl2 bg-accent py-3.5 font-medium text-white transition-colors hover:bg-accentDark disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? "저장하는 중..." : "저장"}
          </button>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted">최근 저장</h2>

            <span className="text-xs text-muted">{items.length}개</span>
          </div>

          {items.length === 0 ? (
            <div className="rounded-xl2 border border-dashed border-creamDeep p-6 text-center">
              <p className="text-sm text-muted">아직 저장한 항목이 없습니다.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="rounded-xl2 border border-creamDeep bg-white p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">
                        {item.title}
                      </p>

                      <p className="mt-1 text-xs text-muted">
                        {item.sourcePlatform} ·{" "}
                        {new Date(item.createdAt).toLocaleDateString("ko-KR")}
                      </p>
                    </div>

                    <span className="shrink-0 rounded-full bg-accent/10 px-2 py-1 text-xs text-accentDark">
                      {item.categoryMain}
                    </span>
                  </div>

                  {item.originalUrl && (
                    <p className="mt-2 truncate text-xs text-muted">
                      {item.originalUrl}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 border-t border-creamDeep bg-white">
        <div className="mx-auto flex max-w-md justify-around py-3 text-xs text-muted">
          <span className="font-medium text-accentDark">홈</span>
          <span>카테고리</span>
          <span>아카이브</span>
          <span>설정</span>
        </div>
      </nav>
    </main>
  );
}
