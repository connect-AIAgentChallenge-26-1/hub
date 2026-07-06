"use client";

import { useEffect, useState, useCallback } from "react";
import { EXPENSE_CATEGORIES } from "@/lib/constants";
import { formatWon } from "@/lib/date";
import Gauge from "@/components/Gauge";

interface Summary {
  budget: number | null;
  spent: number;
  remaining: number | null;
  byCategory: { label: string; amount: number }[];
}
interface Expense {
  id: number;
  categoryLabel: string;
  amount: number;
  spentAt: string;
  memo: string | null;
}

const CAT_COLORS: Record<string, string> = {
  공과금: "var(--color-primary)",
  식비: "var(--bill-electric)",
  생활용품: "var(--bill-water)",
  교통: "var(--bill-maint)",
  여가: "var(--color-accent)",
  기타: "var(--text-weak)",
};

export default function BudgetPage() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;

  const [summary, setSummary] = useState<Summary | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [showExpense, setShowExpense] = useState(false);
  const [showBudget, setShowBudget] = useState(false);

  const load = useCallback(async () => {
    const [s, e] = await Promise.all([
      fetch(`/api/expenses/summary?year=${y}&month=${m}`).then((r) => r.json()),
      fetch(`/api/expenses?year=${y}&month=${m}`).then((r) => r.json()),
    ]);
    setSummary(s);
    setExpenses(e.expenses ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const ratio = summary?.budget ? summary.spent / summary.budget : 0;
  const over = summary?.budget != null && summary.spent > summary.budget;

  return (
    <>
      <div className="card">
        <div className="between" style={{ marginBottom: 4 }}>
          <span className="h2">
            {m}월 예산
          </span>
          <button className="icon-btn caption" style={{ width: "auto" }} onClick={() => setShowBudget(true)}>
            예산 편집 ›
          </button>
        </div>
        {summary?.budget ? (
          <>
            <Gauge
              ratio={ratio}
              centerLabel={formatWon(summary.remaining)}
              subLabel={`잔여 · 사용 ${formatWon(summary.spent)} / ${formatWon(summary.budget)}`}
            />
            {over && (
              <div className="center" style={{ color: "var(--color-danger)", fontWeight: 700, fontSize: 14 }}>
                ⚠ 예산 초과 +{formatWon(summary.spent - (summary.budget ?? 0))}
              </div>
            )}
          </>
        ) : (
          <button className="btn secondary" style={{ marginTop: 8 }} onClick={() => setShowBudget(true)}>
            + 이번 달 예산 설정하기
          </button>
        )}
      </div>

      {/* 카테고리별 지출 */}
      {summary && summary.byCategory.length > 0 && (
        <div className="card">
          <div className="h2" style={{ marginBottom: 12 }}>
            카테고리별 지출
          </div>
          {summary.byCategory.map((c) => {
            const pct = summary.spent > 0 ? Math.round((c.amount / summary.spent) * 100) : 0;
            return (
              <div className="bar-row" key={c.label}>
                <div className="bar-top">
                  <span>{c.label}</span>
                  <span>{formatWon(c.amount)}</span>
                </div>
                <div className="bar">
                  <span style={{ width: `${pct}%`, background: CAT_COLORS[c.label] ?? "var(--text-weak)" }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 지출 목록 */}
      <div className="card">
        <div className="h2" style={{ marginBottom: 4 }}>
          이번 달 지출
        </div>
        {expenses.length === 0 ? (
          <div className="empty">아직 기록한 지출이 없어요</div>
        ) : (
          expenses.map((e) => (
            <div className="row" key={e.id}>
              <span
                className="dot"
                style={{ background: CAT_COLORS[e.categoryLabel] ?? "var(--text-weak)" }}
              />
              <span className="grow">
                <span className="strong">{e.memo || e.categoryLabel}</span>
                <br />
                <span className="caption">
                  {e.categoryLabel} · {new Date(e.spentAt).getMonth() + 1}/{new Date(e.spentAt).getDate()}
                </span>
              </span>
              <span className="amt">{formatWon(e.amount)}</span>
            </div>
          ))
        )}
      </div>

      <button className="fab" onClick={() => setShowExpense(true)} aria-label="지출 추가">
        ＋
      </button>

      {showExpense && (
        <ExpenseModal onClose={() => setShowExpense(false)} onSaved={() => { setShowExpense(false); load(); }} />
      )}
      {showBudget && (
        <BudgetModal
          year={y}
          month={m}
          current={summary?.budget ?? null}
          onClose={() => setShowBudget(false)}
          onSaved={() => { setShowBudget(false); load(); }}
        />
      )}
    </>
  );
}

function ExpenseModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [categoryLabel, setCategory] = useState(EXPENSE_CATEGORIES[1]);
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!amount || Number(amount) <= 0) return;
    setSaving(true);
    const res = await fetch("/api/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryLabel, amount, memo }),
    });
    setSaving(false);
    if (res.ok) onSaved();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="between" style={{ marginBottom: 16 }}>
          <span className="h2">지출 입력</span>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="field">
          <label>카테고리</label>
          <select className="input" value={categoryLabel} onChange={(e) => setCategory(e.target.value)}>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>금액</label>
          <input className="input" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
        </div>
        <div className="field">
          <label>메모 (선택)</label>
          <input className="input" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="편의점, 배달 등" />
        </div>
        <button className="btn mt2" onClick={save} disabled={saving}>
          {saving ? "저장 중…" : "지출 기록하기"}
        </button>
      </div>
    </div>
  );
}

function BudgetModal({
  year, month, current, onClose, onSaved,
}: {
  year: number; month: number; current: number | null; onClose: () => void; onSaved: () => void;
}) {
  const [amount, setAmount] = useState(current != null ? String(current) : "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (amount === "" || Number(amount) < 0) return;
    setSaving(true);
    const res = await fetch(`/api/budgets/${year}/${month}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: Number(amount) }),
    });
    setSaving(false);
    if (res.ok) onSaved();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="between" style={{ marginBottom: 16 }}>
          <span className="h2">{month}월 예산 설정</span>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="field">
          <label>이번 달 목표 예산</label>
          <input className="input" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="400000" />
        </div>
        <button className="btn mt2" onClick={save} disabled={saving}>
          {saving ? "저장 중…" : "저장"}
        </button>
      </div>
    </div>
  );
}
