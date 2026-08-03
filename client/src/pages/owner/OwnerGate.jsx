import { useState } from "react";
import styles from "./OwnerGate.module.css";

/* 사장님 대시보드(/, /owner) 앞에 두는 패스코드 잠금.
   배포 주소를 아는 사람이 아무나 대시보드를 보는 걸 막는 용도다 — 멀티 매장 로그인이 아니다.

   실제 검증은 서버(POST /api/owner/verify)에서 OWNER_PASSCODE와 대조한다.
   여기서는 통과 여부만 sessionStorage에 남긴다(탭을 닫으면 풀린다).
   sessionStorage 플래그는 직접 조작할 수 있어 강한 보안은 아니다 — 공개 링크 노출 차단 수준이다. */
const AUTH_KEY = "owner_authed";

export default function OwnerGate({ children }) {
  const [authed, setAuthed] = useState(
    () => sessionStorage.getItem(AUTH_KEY) === "1",
  );
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  function lock() {
    sessionStorage.removeItem(AUTH_KEY);
    setAuthed(false);
    setPasscode("");
  }

  if (authed) {
    return (
      <>
        {children}
        <button type="button" className={styles.lock} onClick={lock}>
          🔒 잠금
        </button>
      </>
    );
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/owner/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      if (res.ok) {
        sessionStorage.setItem(AUTH_KEY, "1");
        setAuthed(true);
      } else if (res.status === 401) {
        setError("패스코드가 맞지 않아요.");
      } else if (res.status === 503) {
        setError("패스코드가 아직 설정되지 않았어요. (서버 OWNER_PASSCODE)");
      } else {
        setError("확인 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.");
      }
    } catch {
      setError("서버에 연결하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <form className={styles.card} onSubmit={submit}>
        <img
          src="/mascot.png"
          alt=""
          aria-hidden="true"
          className={styles.mascot}
        />
        <h1 className={styles.title}>사장님 확인</h1>
        <p className={styles.tagline}>
          대시보드를 열려면 사장님 패스코드를 입력해 주세요.
        </p>

        <input
          type="password"
          className={styles.input}
          value={passcode}
          onChange={(event) => setPasscode(event.target.value)}
          placeholder="패스코드"
          autoComplete="current-password"
          autoFocus
        />

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          className={styles.submit}
          disabled={busy || passcode.length === 0}
        >
          {busy ? "확인 중…" : "확인"}
        </button>
      </form>
    </main>
  );
}
