import HomeButton from "./HomeButton";

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

// week[i]가 가리키는 날의 요일 라벨. week는 "6일 전 → 오늘" 순서로 오늘이 마지막(index 6)이다.
function weekdayLabelFor(index, weekLength) {
  const daysAgo = weekLength - 1 - index;
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return WEEKDAY_LABELS[date.getDay()];
}

// T26: "대시보드 대신 숫자 하나" (docs/prototype/design-board.html 07번 프레임).
// daysCompleted: 이번 주(최근 7일) 완료한 날 수. week: 오래된 날 → 오늘 순서의 boolean 7개.
export default function StatsScreen({ daysCompleted, week, isLoading, error, onGoHome }) {
  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: "24px",
        gap: "16px",
        textAlign: "center",
      }}
    >
      {isLoading && <p style={{ color: "var(--ink-soft)" }}>불러오는 중...</p>}
      {error && <p style={{ color: "var(--rose-ink)" }}>{error}</p>}
      {!isLoading && !error && (
        <>
          <div style={{ fontFamily: "var(--font-title)", fontSize: "64px", color: "var(--ink)" }}>
            {daysCompleted}
          </div>
          <p style={{ fontSize: "12px", color: "var(--ink-soft)" }}>
            이번 주, 7일 중 {daysCompleted}일 완료했어요
          </p>
          <div style={{ display: "flex", gap: "10px" }}>
            {week.map((done, i) => {
              const label = weekdayLabelFor(i, week.length);
              return (
                <span
                  key={i}
                  role="img"
                  aria-label={`${label}요일 ${done ? "완료" : "미완료"}`}
                  title={`${label}요일 ${done ? "완료" : "미완료"}`}
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background: done ? "var(--rose-ink)" : "var(--cream-line)",
                  }}
                />
              );
            })}
          </div>
        </>
      )}
      {onGoHome && <HomeButton onClick={onGoHome} />}
    </main>
  );
}
