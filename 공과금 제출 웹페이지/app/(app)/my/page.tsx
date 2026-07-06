"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { categoryOf } from "@/lib/constants";
import { formatWon, ddayLabel } from "@/lib/date";
import BillFormModal, { BillDraft, emptyDraft } from "@/components/BillFormModal";

interface Bill {
  id: number;
  category: string;
  name: string;
  dueDay: number | null;
  defaultAmount: number | null;
  provider: string | null;
  notifyEnabled: boolean;
  notifyDaysBefore: number;
}
interface Task {
  id: number;
  title: string;
  dueDate: string | null;
  isDone: boolean;
}

// 자취 행정 타임라인 프리셋 (F3)
const ADMIN_PRESETS = ["전입신고 (14일 이내)", "전기 명의 변경", "도시가스 전입 신청", "인터넷 설치 예약", "쓰레기 종량제봉투 확인"];

export default function MyPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ nickname: string; email: string } | null>(null);
  const [bills, setBills] = useState<Bill[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [draft, setDraft] = useState<BillDraft | null>(null);
  const [newTask, setNewTask] = useState("");

  const load = useCallback(async () => {
    const [me, b, t] = await Promise.all([
      fetch("/api/auth/me").then((r) => r.json()),
      fetch("/api/bills").then((r) => r.json()),
      fetch("/api/admin-tasks").then((r) => r.json()),
    ]);
    setUser(me.user);
    setBills(b.bills ?? []);
    setTasks(t.tasks ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleTask(t: Task) {
    await fetch(`/api/admin-tasks/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDone: !t.isDone }),
    });
    load();
  }
  async function addTask(title: string) {
    if (!title.trim()) return;
    await fetch("/api/admin-tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    setNewTask("");
    load();
  }
  async function deleteTask(id: number) {
    await fetch(`/api/admin-tasks/${id}`, { method: "DELETE" });
    load();
  }
  async function deleteBill(id: number) {
    if (!confirm("이 항목과 미납부 예정을 삭제할까요?")) return;
    await fetch(`/api/bills/${id}`, { method: "DELETE" });
    load();
  }
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const editDraft = (b: Bill): BillDraft => ({
    id: b.id,
    category: b.category as BillDraft["category"],
    name: b.name,
    dueDay: b.dueDay != null ? String(b.dueDay) : "",
    defaultAmount: b.defaultAmount != null ? String(b.defaultAmount) : "",
    provider: b.provider ?? "",
    notifyEnabled: b.notifyEnabled,
    notifyDaysBefore: b.notifyDaysBefore,
  });

  const presetsLeft = ADMIN_PRESETS.filter((p) => !tasks.some((t) => t.title === p));

  return (
    <>
      <div className="greet">마이페이지</div>

      {/* 계정 */}
      <div className="card">
        <div className="between">
          <div>
            <div className="strong" style={{ fontSize: 16 }}>{user?.nickname ?? "…"}</div>
            <div className="caption">{user?.email ?? ""}</div>
          </div>
          <button className="btn sm secondary" onClick={logout}>로그아웃</button>
        </div>
      </div>

      {/* 공과금 항목 관리 */}
      <div className="card">
        <div className="between" style={{ marginBottom: 4 }}>
          <span className="h2">공과금 항목 관리</span>
          <button className="icon-btn caption" style={{ width: "auto" }} onClick={() => setDraft(emptyDraft("ELECTRIC"))}>
            + 추가
          </button>
        </div>
        {bills.length === 0 ? (
          <div className="empty">등록된 항목이 없어요</div>
        ) : (
          bills.map((b) => {
            const c = categoryOf(b.category);
            return (
              <div className="row" key={b.id}>
                <span className="dot" style={{ background: c.color }} />
                <span className="grow" onClick={() => setDraft(editDraft(b))} style={{ cursor: "pointer" }}>
                  <span className="strong">{b.name}</span>
                  <br />
                  <span className="caption">
                    {b.dueDay ? `매월 ${b.dueDay}일` : "납부일 미정"} · {formatWon(b.defaultAmount)}
                    {b.notifyEnabled ? " · 🔔" : ""}
                  </span>
                </span>
                <button className="icon-btn" onClick={() => deleteBill(b.id)} aria-label="삭제">🗑️</button>
              </div>
            );
          })
        )}
      </div>

      {/* 자취 행정 타임라인 (F3) */}
      <div className="card">
        <div className="h2" style={{ marginBottom: 8 }}>자취 행정 타임라인</div>

        {tasks.map((t) => (
          <div className="row" key={t.id}>
            <input
              type="checkbox"
              checked={t.isDone}
              onChange={() => toggleTask(t)}
              style={{ width: 20, height: 20, accentColor: "var(--color-success)" }}
            />
            <span
              className="grow strong"
              style={{ textDecoration: t.isDone ? "line-through" : "none", color: t.isDone ? "var(--text-weak)" : undefined }}
            >
              {t.title}
            </span>
            {t.dueDate && <span className="caption">{ddayLabel(new Date(t.dueDate))}</span>}
            <button className="icon-btn" onClick={() => deleteTask(t.id)} aria-label="삭제">✕</button>
          </div>
        ))}

        {/* 프리셋 빠른 추가 */}
        {presetsLeft.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "10px 0" }}>
            {presetsLeft.map((p) => (
              <button
                key={p}
                className="chip"
                style={{ background: "var(--color-primary-weak)", color: "var(--color-primary)" }}
                onClick={() => addTask(p)}
              >
                + {p}
              </button>
            ))}
          </div>
        )}

        <div className="between" style={{ gap: 8, marginTop: 8 }}>
          <input
            className="input"
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            placeholder="직접 할 일 추가"
            onKeyDown={(e) => e.key === "Enter" && addTask(newTask)}
          />
          <button className="btn sm" onClick={() => addTask(newTask)}>추가</button>
        </div>
      </div>

      {draft && (
        <BillFormModal draft={draft} onClose={() => setDraft(null)} onSaved={() => { setDraft(null); load(); }} />
      )}
    </>
  );
}
