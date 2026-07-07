"use client";

import { useState } from "react";

type RecentItem = {
  id: string;
  title: string;
  source: string;
  savedAt: string;
  category: string;
};

const MOCK_RECENT: RecentItem[] = [
  {
    id: "1",
    title: "가벼운 러닝화 추천 TOP5",
    source: "youtube · 오늘",
    savedAt: "오늘",
    category: "영상",
  },
  {
    id: "2",
    title: "데일리 쿠션 파운데이션",
    source: "naver · 오늘",
    savedAt: "오늘",
    category: "뷰티",
  },
];

export default function Home() {
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!input.trim()) return;
    setSaving(true);

    // TODO: Supabase에 저장 + 자동분류 로직 연결
    // const { data, error } = await supabase.from("items").insert({ raw_input: input });

    await new Promise((r) => setTimeout(r, 500));
    setInput("");
    setSaving(false);
  }

  return (
    <main className="min-h-screen bg-cream flex flex-col max-w-md mx-auto px-5 pt-6 pb-24">
      {/* 헤더 */}
      <header className="flex items-center justify-between mb-8">
        <span className="text-xl font-semibold tracking-tight text-ink">
          later.
        </span>
        <div className="w-8 h-8 rounded-full bg-white border border-creamDeep" />
      </header>

      {/* 저장 입력 영역 */}
      <section className="mb-8">
        <h1 className="text-2xl font-bold leading-snug text-ink mb-4">
          무엇을
          <br />
          저장할까요?
        </h1>

        <div className="bg-white rounded-xl2 p-4 shadow-sm border border-creamDeep">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="링크나 텍스트를 붙여넣으세요"
            rows={3}
            className="w-full resize-none outline-none text-sm text-ink placeholder:text-muted bg-transparent"
          />
          <div className="flex items-center justify-between mt-2">
            <button
              type="button"
              className="flex items-center gap-1 text-xs text-muted border border-creamDeep rounded-full px-3 py-1.5"
              onClick={() => alert("이미지 업로드는 곧 연결될 예정이에요")}
            >
              📎 이미지
            </button>
            <span className="text-xs text-muted">스크린샷도 저장돼요</span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !input.trim()}
          className="w-full mt-4 bg-accent hover:bg-accentDark disabled:opacity-50 text-white font-medium rounded-xl2 py-3.5 transition-colors"
        >
          {saving ? "저장하는 중..." : "저장"}
        </button>
      </section>

      {/* 최근 저장 */}
      <section>
        <h2 className="text-sm font-medium text-muted mb-3">최근 저장</h2>
        <ul className="space-y-3">
          {MOCK_RECENT.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between bg-white/60 rounded-xl px-3 py-3"
            >
              <div>
                <p className="text-sm text-ink font-medium">{item.title}</p>
                <p className="text-xs text-muted">{item.source}</p>
              </div>
              <span className="text-xs text-accentDark bg-accent/10 rounded-full px-2 py-1">
                {item.category}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* 하단 네비게이션 */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-creamDeep">
        <div className="max-w-md mx-auto flex justify-around py-3 text-xs text-muted">
          <span className="text-accentDark font-medium">홈</span>
          <span>카테고리</span>
          <span>아카이브</span>
          <span>설정</span>
        </div>
      </nav>
    </main>
  );
}
