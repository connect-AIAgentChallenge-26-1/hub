"use client";

import { useState } from "react";
import { CATEGORIES, Category, categoryOf } from "@/lib/constants";

export interface BillDraft {
  id?: number;
  category: Category;
  name: string;
  dueDay: string;
  defaultAmount: string;
  provider: string;
  notifyEnabled: boolean;
  notifyDaysBefore: number;
}

export function emptyDraft(category: Category = "ELECTRIC"): BillDraft {
  const c = categoryOf(category);
  return {
    category,
    name: c.label + "요금",
    dueDay: "",
    defaultAmount: "",
    provider: c.defaultProvider ?? "",
    notifyEnabled: true,
    notifyDaysBefore: 2,
  };
}

export default function BillFormModal({
  draft,
  onClose,
  onSaved,
}: {
  draft: BillDraft;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<BillDraft>(draft);
  const [saving, setSaving] = useState(false);
  const isEdit = !!form.id;

  function set<K extends keyof BillDraft>(k: K, v: BillDraft[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    const url = isEdit ? `/api/bills/${form.id}` : "/api/bills";
    const res = await fetch(url, {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (res.ok) onSaved();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="between" style={{ marginBottom: 16 }}>
          <span className="h2">{isEdit ? "항목 수정" : "공과금 등록"}</span>
          <button className="icon-btn" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>

        <div className="field">
          <label>카테고리</label>
          <div className="cat-picker">
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                type="button"
                className={`cat-opt${form.category === c.key ? " on" : ""}`}
                onClick={() => set("category", c.key)}
              >
                <span style={{ fontSize: 18 }}>{c.icon}</span>
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>이름</label>
          <input className="input" value={form.name} onChange={(e) => set("name", e.target.value)} />
        </div>

        <div className="between" style={{ gap: 12 }}>
          <div className="field" style={{ flex: 1 }}>
            <label>납부일 (매월)</label>
            <input
              className="input"
              type="number"
              min={1}
              max={31}
              placeholder="미정"
              value={form.dueDay}
              onChange={(e) => set("dueDay", e.target.value)}
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>예상 금액 (선택)</label>
            <input
              className="input"
              type="number"
              placeholder="미입력"
              value={form.defaultAmount}
              onChange={(e) => set("defaultAmount", e.target.value)}
            />
          </div>
        </div>

        <div className="field">
          <label>납부처 (선택)</label>
          <input className="input" value={form.provider} onChange={(e) => set("provider", e.target.value)} />
        </div>

        <label className="toggle-row">
          <span>납부일 알림 받기</span>
          <input
            type="checkbox"
            checked={form.notifyEnabled}
            onChange={(e) => set("notifyEnabled", e.target.checked)}
          />
        </label>

        <button className="btn mt3" onClick={save} disabled={saving}>
          {saving ? "저장 중…" : isEdit ? "수정 완료" : "등록하기"}
        </button>
      </div>
    </div>
  );
}
