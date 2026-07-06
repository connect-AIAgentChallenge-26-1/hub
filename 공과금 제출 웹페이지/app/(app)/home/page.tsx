"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { categoryOf } from "@/lib/constants";
import { formatWon, ddayLabel, daysUntil } from "@/lib/date";
import Gauge from "@/components/Gauge";
import PayModal, { PayTarget } from "@/components/PayModal";

interface Payment {
  id: number;
  amount: number | null;
  dueDate: string | null;
  bill: { name: string; category: string; provider: string | null };
}
interface Summary {
  budget: number | null;
  spent: number;
  remaining: number | null;
}
interface Task {
  id: number;
  title: string;
  dueDate: string | null;
  isDone: boolean;
}

export default function HomePage() {
  const now = new Date();
  const [nickname, setNickname] = useState("");
  const [upcoming, setUpcoming] = useState<Payment[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [payTarget, setPayTarget] = useState<PayTarget | null>(null);

  const load = useCallback(async () => {
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    const [me, up, sum, tk] = await Promise.all([
      fetch("/api/auth/me").then((r) => r.json()),
      fetch("/api/payments/upcoming?days=7").then((r) => r.json()),
      fetch(`/api/expenses/summary?year=${y}&month=${m}`).then((r) => r.json()),
      fetch("/api/admin-tasks").then((r) => r.json()),
    ]);
    setNickname(me.user?.nickname ?? "");
    setUpcoming(up.payments ?? []);
    setSummary(sum);
    setTasks((tk.tasks ?? []).filter((t: Task) => !t.isDone).slice(0, 3));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const ratio =
    summary && summary.budget && summary.budget > 0 ? summary.spent / summary.budget : 0;

  return (
    <>
      <div className="greet">
        {nickname ? `${nickname}님, ` : ""}이번 달 납부 예정{" "}
        <span style={{ color: "var(--color-primary)" }}>{upcoming.length}건</span> 이에요
        <small>
          {now.getMonth() + 1}월 {now.getDate()}일 · 오늘도 알뜰하게 💪
        </small>
      </div>

      {/* 예산 게이지 요약 */}
      <div className="card">
        <div className="between" style={{ marginBottom: 4 }}>
          <span className="h2">이번 달 예산</span>
          <Link href="/budget" className="caption">
            자세히 ›
          </Link>
        </div>
        {summary?.budget ? (
          <Gauge
            ratio={ratio}
            centerLabel={formatWon(summary.remaining)}
            subLabel={`잔여 · 사용 ${formatWon(summary.spent)} / ${formatWon(summary.budget)}`}
          />
        ) : (
          <Link href="/budget" className="btn secondary" style={{ marginTop: 8 }}>
            + 이번 달 예산 설정하기
          </Link>
        )}
      </div>

      {/* 다가오는 납부 */}
      <div className="card">
        <div className="h2" style={{ marginBottom: 4 }}>
          다가오는 납부
        </div>
        {upcoming.length === 0 ? (
          <div className="empty">예정된 납부가 없어요 👍</div>
        ) : (
          upcoming.map((p) => {
            const c = categoryOf(p.bill.category);
            const due = p.dueDate ? new Date(p.dueDate) : null;
            const d = due ? daysUntil(due) : 999;
            const urgent = d <= 2;
            return (
              <div className="row" key={p.id}>
                <span
                  className="badge"
                  style={{
                    background: urgent ? "var(--color-accent-weak)" : "var(--color-primary-weak)",
                    color: urgent ? "var(--color-accent)" : "var(--color-primary)",
                  }}
                >
                  {due ? ddayLabel(due) : "미정"}
                </span>
                <span className="grow">
                  <span className="strong">{p.bill.name}</span>
                  <br />
                  <span className="caption">
                    {due ? `${due.getMonth() + 1}월 ${due.getDate()}일` : "날짜 미정"}
                    {p.bill.provider ? ` · ${p.bill.provider}` : ""}
                  </span>
                </span>
                <button
                  className="btn sm"
                  onClick={() =>
                    setPayTarget({ id: p.id, name: p.bill.name, amount: p.amount, dueDate: p.dueDate })
                  }
                >
                  납부
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* 오늘 할 일 (행정 태스크) */}
      {tasks.length > 0 && (
        <div className="card">
          <div className="between" style={{ marginBottom: 4 }}>
            <span className="h2">오늘 할 일</span>
            <Link href="/my" className="caption">
              전체 ›
            </Link>
          </div>
          {tasks.map((t) => (
            <div className="row" key={t.id}>
              <span>☑️</span>
              <span className="grow strong">{t.title}</span>
              {t.dueDate && <span className="caption">{ddayLabel(new Date(t.dueDate))}</span>}
            </div>
          ))}
        </div>
      )}

      {payTarget && (
        <PayModal
          target={payTarget}
          onClose={() => setPayTarget(null)}
          onDone={() => {
            setPayTarget(null);
            load();
          }}
        />
      )}
    </>
  );
}
