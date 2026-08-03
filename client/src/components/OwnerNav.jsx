import styles from "./OwnerNav.module.css";

/* 사장님 화면 좌측 네비게이션.

   확장 항목은 docs/plan.md의 "12. 확장 로드맵"을 그대로 옮긴 것이다. 여기서 지어내지 않는다.
   전부 disabled — 눌리지 않아야 "만들다 만 것"이 아니라 "의도적으로 남긴 자리"로 읽힌다.
   MVP 범위는 방치 자동 대응 하나뿐이다 (CLAUDE.md MVP Scope).

   화면에 "Phase 2/3"이라고 쓰지 않는다. 그건 우리 기획 문서의 언어지 사장님의 언어가 아니다.
   순서만 로드맵을 따르고, 기본은 접어둔다 — 사장님이 매일 볼 것은 대시보드 하나다. */

const NOW = [
  { icon: "📊", label: "대시보드", active: true },
  { icon: "🗂", label: "승인 대기함", note: "준비 중" }, // T-20 — UI 자리만, 기능 구현 금지
];

const LATER = [
  { icon: "🔧", label: "고장 감지" }, // Phase 2
  { icon: "📈", label: "운영 리포트" }, // Phase 2
  { icon: "📇", label: "연락처 자동 확보" }, // Phase 2
  { icon: "📦", label: "재고 관리" }, // Phase 3
  { icon: "🧾", label: "자동 발주" }, // Phase 3
  { icon: "💳", label: "환불 처리" }, // Phase 3
  { icon: "💹", label: "매출 분석" }, // Phase 3
];

export default function OwnerNav() {
  return (
    <aside className={styles.nav}>
      <div className={styles.brand}>
        <p className={styles.brandName}>
          <img src="/mascot.png" alt="" aria-hidden="true" className={styles.mascot} /> 빨래집사
        </p>
        <p className={styles.store}>워시엔조이 혁신점</p>
      </div>

      <nav className={styles.group}>
        {NOW.map(({ icon, label, active, note }) => (
          <button
            key={label}
            type="button"
            className={`${styles.item} ${active ? styles.active : ""}`}
            disabled={!active}
            aria-current={active ? "page" : undefined}
          >
            <span className={styles.icon}>{icon}</span>
            {label}
            {note && <span className={styles.note}>{note}</span>}
          </button>
        ))}
      </nav>

      <details className={styles.later}>
        <summary className={styles.laterSummary}>
          추후 확장
          <span className={styles.count}>{LATER.length}</span>
        </summary>
        <div className={styles.group}>
          {LATER.map(({ icon, label }) => (
            <button key={label} type="button" className={styles.item} disabled>
              <span className={styles.icon}>{icon}</span>
              {label}
            </button>
          ))}
        </div>
        <p className={styles.footnote}>
          이번 MVP는 <b>방치 자동 대응</b> 하나에 집중합니다. 나머지는 자리만 잡아둔 상태예요.
        </p>
      </details>
    </aside>
  );
}
