"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CATEGORIES, categoryOf } from "@/lib/constants";
import { formatWon } from "@/lib/date";
import BillFormModal, { BillDraft, emptyDraft } from "@/components/BillFormModal";

interface Bill {
  id: number;
  category: string;
  name: string;
  dueDay: number | null;
  defaultAmount: number | null;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [bills, setBills] = useState<Bill[]>([]);
  const [draft, setDraft] = useState<BillDraft | null>(null);

  async function load() {
    const res = await fetch("/api/bills");
    if (res.ok) setBills((await res.json()).bills);
  }
  useEffect(() => {
    load();
  }, []);

  return (
    <div className="app-shell">
      <main className="app-main" style={{ paddingBottom: 24 }}>
        <div className="greet">
          어떤 공과금을 내고 있나요?
          <small>자주 내는 항목부터 골라 등록해요 · 건너뛰기 가능</small>
        </div>

        <div className="preset-grid">
          {CATEGORIES.slice(0, 4).map((c) => (
            <button key={c.key} className="preset" onClick={() => setDraft(emptyDraft(c.key))}>
              <span className="ic">{c.icon}</span>
              {c.label}
            </button>
          ))}
        </div>
        <button className="btn secondary" onClick={() => setDraft(emptyDraft("ETC"))}>
          + 직접 추가
        </button>

        <div className="card mt4">
          <div className="label" style={{ color: "var(--text-weak)", marginBottom: 6 }}>
            등록된 항목 · {bills.length}
          </div>
          {bills.length === 0 ? (
            <div className="empty">아직 등록된 항목이 없어요</div>
          ) : (
            bills.map((b) => {
              const c = categoryOf(b.category);
              return (
                <div className="row" key={b.id}>
                  <span className="dot" style={{ background: c.color }} />
                  <span className="grow strong">{b.name}</span>
                  <span className="caption">
                    {b.dueDay ? `매월 ${b.dueDay}일` : "납부일 미정"} · {formatWon(b.defaultAmount)}
                  </span>
                </div>
              );
            })
          )}
        </div>

        <button
          className="btn mt3"
          onClick={() => {
            router.push("/home");
            router.refresh();
          }}
        >
          {bills.length > 0 ? "등록 완료" : "건너뛰고 시작하기"}
        </button>
        {bills.length > 0 && (
          <button
            className="btn ghost"
            onClick={() => {
              router.push("/home");
              router.refresh();
            }}
          >
            나중에 할게요
          </button>
        )}
      </main>

      {draft && (
        <BillFormModal
          draft={draft}
          onClose={() => setDraft(null)}
          onSaved={() => {
            setDraft(null);
            load();
          }}
        />
      )}
    </div>
  );
}
