"use client";

import { useState } from "react";
import { formatWon } from "@/lib/date";

export interface PayTarget {
  id: number;
  name: string;
  amount: number | null;
  dueDate: string | null;
}

// 납부 완료 체크 (플로우 C). 실제 납부금액 입력 + 지출 자동 반영 토글.
export default function PayModal({
  target,
  onClose,
  onDone,
}: {
  target: PayTarget;
  onClose: () => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState(target.amount != null ? String(target.amount) : "");
  const [addToExpense, setAddToExpense] = useState(true);
  const [saving, setSaving] = useState(false);

  async function confirm() {
    setSaving(true);
    const res = await fetch(`/api/payments/${target.id}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount, addToExpense }),
    });
    setSaving(false);
    if (res.ok) onDone();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="between" style={{ marginBottom: 8 }}>
          <span className="h2">납부 완료 체크</span>
          <button className="icon-btn" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>
        <p className="caption" style={{ marginBottom: 16 }}>
          <strong className="strong">{target.name}</strong> · 기존 예상 {formatWon(target.amount)}
        </p>

        <div className="field">
          <label>실제 납부 금액</label>
          <input
            className="input"
            type="number"
            value={amount}
            placeholder="금액 입력"
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>

        <label className="toggle-row">
          <span>이번 달 지출에 자동 반영</span>
          <input type="checkbox" checked={addToExpense} onChange={(e) => setAddToExpense(e.target.checked)} />
        </label>

        <button className="btn mt2" onClick={confirm} disabled={saving}>
          {saving ? "처리 중…" : "✓ 납부 완료로 표시"}
        </button>
      </div>
    </div>
  );
}
