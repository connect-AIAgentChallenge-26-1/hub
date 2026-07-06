"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function SignupPage() {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname, email, password }),
    });
    setLoading(false);
    if (res.ok) {
      // 신규 가입 → 온보딩으로 (screen-spec S1)
      router.push("/onboarding");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.message || "회원가입에 실패했습니다.");
    }
  }

  return (
    <div className="auth-wrap">
      <div className="brand">
        <div className="logo">🗓️</div>
        <h1>회원가입</h1>
        <p>1분이면 시작할 수 있어요</p>
      </div>

      <form onSubmit={submit}>
        <div className="field">
          <label>닉네임</label>
          <input
            className="input"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="서연"
          />
        </div>
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
            autoComplete="new-password"
          />
        </div>
        {error && <div className="error-text">{error}</div>}
        <button className="btn mt3" disabled={loading}>
          {loading ? "가입 중…" : "가입하고 시작하기"}
        </button>
      </form>

      <p className="caption center mt4">
        이미 계정이 있나요?&nbsp;
        <Link className="link" href="/login">
          로그인
        </Link>
      </p>
    </div>
  );
}
