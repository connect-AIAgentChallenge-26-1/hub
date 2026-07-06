"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setLoading(false);
    if (res.ok) {
      router.push("/home");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.message || "로그인에 실패했습니다.");
    }
  }

  return (
    <div className="auth-wrap">
      <div className="brand">
        <div className="logo">🗓️</div>
        <h1>자취달력</h1>
        <p>공과금·지출을 한 곳에서, 자취생 생활 캘린더</p>
      </div>

      <form onSubmit={submit}>
        <div className="field">
          <label>이메일</label>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
          />
        </div>
        <div className="field">
          <label>비밀번호</label>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="6자 이상"
            autoComplete="current-password"
          />
        </div>
        {error && <div className="error-text">{error}</div>}
        <button className="btn mt3" disabled={loading}>
          {loading ? "로그인 중…" : "로그인"}
        </button>
      </form>

      <p className="caption center mt4">
        아직 계정이 없나요?&nbsp;
        <Link className="link" href="/signup">
          회원가입
        </Link>
      </p>
    </div>
  );
}
