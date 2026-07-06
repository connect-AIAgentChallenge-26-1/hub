"use client";

import { useEffect, useState, useCallback } from "react";
import { categoryOf } from "@/lib/constants";
import { formatWon, daysUntil } from "@/lib/date";
import BillFormModal, { BillDraft, emptyDraft } from "@/components/BillFormModal";
import PayModal, { PayTarget } from "@/components/PayModal";

interface Payment {
  id: number;
  amount: number | null;
  dueDate: string | null;
  status: string;
  bill: { name: string; category: string; provider: string | null };
}

const WD = ["일", "월", "화", "수", "목", "금", "토"];
const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default function CalendarPage() {
  const today = new Date();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [payments, setPayments] = useState<Payment[]>([]);
  const [selected, setSelected] = useState<string>(fmt(today));
  const [draft, setDraft] = useState<BillDraft | null>(null);
  const [payTarget, setPayTarget] = useState<PayTarget | null>(null);

  const year = cursor.getFullYear();
  const month = cursor.getMonth(); // 0-based

  const load = useCallback(async () => {
    const from = fmt(new Date(year, month, 1));
    const to = fmt(new Date(year, month + 1, 0));
    const res = await fetch(`/api/payments?from=${from}&to=${to}`);
    if (res.ok) setPayments((await res.json()).payments);
  }, [year, month]);

  useEffect(() => {
    load();
  }, [load]);

  // 날짜별 결제 매핑
  const byDay: Record<string, Payment[]> = {};
  for (const p of payments) {
    if (!p.dueDate) continue;
    const key = fmt(new Date(p.dueDate));
    (byDay[key] ||= []).push(p);
  }

  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const selectedPayments = byDay[selected] ?? [];

  return (
    <>
      <div className="cal-head">
        <button className="cal-nav" onClick={() => setCursor(new Date(year, month - 1, 1))}>
          ‹
        </button>
        <strong>
          {year}년 {month + 1}월
        </strong>
        <button className="cal-nav" onClick={() => setCursor(new Date(year, month + 1, 1))}>
          ›
        </button>
      </div>

      <div className="card" style={{ padding: 12 }}>
        <div className="cal-grid">
          {WD.map((w) => (
            <div className="wd" key={w}>
              {w}
            </div>
          ))}
          {cells.map((d, i) => {
            if (d === null) return <div key={`e${i}`} className="cell" />;
            const key = fmt(new Date(year, month, d));
            const isToday = key === fmt(today);
            const isSel = key === selected;
            const dayPays = byDay[key] ?? [];
            return (
              <button
                key={key}
                className={`cell${isToday ? " today" : ""}${isSel ? " selected" : ""}`}
                onClick={() => setSelected(key)}
              >
                {d}
                <span className="dots">
                  {dayPays.slice(0, 4).map((p) => (
                    <span
                      key={p.id}
                      className="dot"
                      style={{
                        background: categoryOf(p.bill.category).color,
                        opacity: p.status === "PAID" ? 0.35 : 1,
                      }}
                    />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="card">
        <div className="label" style={{ color: "var(--text-weak)", marginBottom: 8 }}>
          {selected.replace(/-/g, ". ")}
        </div>
        {selectedPayments.length === 0 ? (
          <div className="empty">이 날짜에는 납부 일정이 없어요</div>
        ) : (
          selectedPayments.map((p) => {
            const c = categoryOf(p.bill.category);
            const paid = p.status === "PAID";
            return (
              <div className="row" key={p.id}>
                <span className="dot" style={{ background: c.color }} />
                <span className="grow">
                  <span className="strong">{p.bill.name}</span>
                  <br />
                  <span className="caption" style={{ color: paid ? "var(--color-success)" : undefined }}>
                    {paid ? "✓ 납부 완료" : "미납부"}
                  </span>
                </span>
                <span className="amt">{formatWon(p.amount)}</span>
                {!paid && (
                  <button
                    className="btn sm"
                    onClick={() =>
                      setPayTarget({ id: p.id, name: p.bill.name, amount: p.amount, dueDate: p.dueDate })
                    }
                  >
                    납부
                  </button>
                )}
              </div>
            );
          })
        )}
        <button className="btn secondary mt3" onClick={() => setDraft(emptyDraft("ELECTRIC"))}>
          + 공과금 항목 추가
        </button>
      </div>

      {draft && (
        <BillFormModal draft={draft} onClose={() => setDraft(null)} onSaved={() => { setDraft(null); load(); }} />
      )}
      {payTarget && (
        <PayModal target={payTarget} onClose={() => setPayTarget(null)} onDone={() => { setPayTarget(null); load(); }} />
      )}
    </>
  );
}
