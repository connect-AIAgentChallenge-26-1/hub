import { useEffect, useState } from "react";
import StatusBadge from "../../components/StatusBadge.jsx";
import { getMachineAvailability } from "../../utils/availability.js";
import { formatRange } from "../../utils/time.js";
import styles from "./StoreStatusPage.module.css";

/* T-27 — 고객용 매장 현황. QR 없이도 "지금 갈 만한가"를 확인할 수 있는 화면이다.
   (docs/backlog.md: QR이 입구인 지금은 "가기 전에 확인"이 구조적으로 불가능해 P2로 미뤄뒀던 화면 —
   구조가 바뀌면 이 화면이 그 입구가 된다)

   서버 작업 0 — GET /api/machines(T-13)를 그대로 재사용한다. mock이 아니라 fetch로 바로 만든다 —
   T-17에서 이미 이 API가 실제로 응답하는 걸 다른 두 화면(LandingPage·OwnerDashboard)이 증명했다.

   지켜야 할 것 (CLAUDE.md UI Rule · 빨래집사 Design Skill):
   - 빨강 금지 (방치 포함). ABANDONED도 방치색(#F08C00)까지만
   - "방치"라는 단어를 고객에게 쓰지 않는다 — "찾아가지 않은 세탁물"
   - 정렬은 기계 번호순 (급한 순으로 보는 사장님 화면과 다르다 — 고객은 "내가 찾는 번호"가 먼저다)
   - 남은 시간은 점이 아니라 범위(formatRange)
   - 판정은 getMachineAvailability(client/src/utils/availability.js, TDD 완료)를 그대로 쓴다. 손대지 않는다 */

const POLL_INTERVAL_MS = 5000;

/* 기계 번호순 — "세탁기 2" vs "세탁기 10"이 문자열 정렬로 뒤집히지 않게 numeric 옵션을 쓴다 */
function byMachineNo(a, b) {
  return (a.name ?? a.id).localeCompare(b.name ?? b.id, "ko", { numeric: true });
}

export default function StoreStatusPage() {
  const [machines, setMachines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadMachines() {
      try {
        const res = await fetch("/api/machines");
        if (cancelled) return;
        if (!res.ok) throw new Error(`서버 응답 오류 (HTTP ${res.status})`);
        const data = await res.json();
        if (cancelled) return;
        setMachines(data);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        console.error("[StoreStatusPage] /api/machines 조회 실패", err);
        setError("매장 현황을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadMachines();
    const interval = setInterval(loadMachines, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (loading && machines.length === 0) {
    return (
      <Shell>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>불러오는 중이에요</h2>
          <p className={styles.sub}>매장 세탁기 현황을 확인하고 있어요. 잠시만 기다려 주세요.</p>
        </div>
      </Shell>
    );
  }

  if (error && machines.length === 0) {
    return (
      <Shell>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>연결이 불안정해요</h2>
          <p className={styles.sub}>{error}</p>
          <button type="button" className={styles.button} onClick={() => window.location.reload()}>
            다시 시도
          </button>
        </div>
      </Shell>
    );
  }

  const sorted = [...machines].sort(byMachineNo);
  const availableCount = sorted.filter((machine) => getMachineAvailability(machine).available).length;

  return (
    <Shell>
      {/* 이미 받아온 목록이 있는데 폴링만 실패한 경우 — 화면을 비우지 않고 조용히 알린다 */}
      {error && <p className={styles.staleNote}>{error} · 마지막으로 확인한 정보를 보여드리고 있어요.</p>}

      {/* 이 화면이 답하는 질문은 하나다 — "지금 몇 대가 비어 있나". 그래서 이게 가장 크게 보인다 */}
      <section className={styles.hero}>
        <p className={styles.heroLabel}>지금 바로 쓸 수 있는 세탁기</p>
        <p className={styles.heroCount}>
          {availableCount}
          <span className={styles.heroUnit}>대</span>
        </p>
        <p className={styles.heroSub}>전체 {sorted.length}대 중</p>
      </section>

      {sorted.length === 0 ? (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>표시할 세탁기가 없어요</h2>
          <p className={styles.sub}>잠시 후 다시 확인해 주세요.</p>
        </div>
      ) : (
        <ul className={styles.list}>
          {sorted.map((machine) => (
            <MachineRow key={machine.id} machine={machine} />
          ))}
        </ul>
      )}

      {sorted.length > 0 && availableCount === 0 && (
        <p className={styles.tip}>
          <img src="/mascot.png" alt="빨래집사 마스코트" className={styles.mascotTip} />
          <span>지금은 모든 세탁기가 사용 중이에요. 아래에서 세탁기별 남은 시간을 확인해 보세요.</span>
        </p>
      )}
    </Shell>
  );
}

/* 한 줄이 답하는 것 — "이 기계, 지금 쓸 수 있나". 쓸 수 없으면 언제쯤인지 또는 왜인지.
   RUNNING/SPIN만 미래 시각(etaFrom~etaTo)이 남아 있어 범위로 보여준다.
   DONE·ABANDONED는 세션이 이미 끝나 etaTo가 과거 시각이라 "남은 시간"으로 보여주면
   이미 지난 시각을 마치 예정처럼 보여주는 셈이라 시간 대신 안내 문구로 대신한다
   (ABANDONED는 결정사항 3번 — freeAt이 과거라 그대로 노출 금지). */
function MachineRow({ machine }) {
  const { name, status, session } = machine;
  const { available } = getMachineAvailability(machine);
  const inProgress = status === "RUNNING" || status === "SPIN";

  return (
    <li className={styles.row}>
      <div className={styles.rowTop}>
        <span className={styles.rowName}>{name}</span>
        <StatusBadge status={status} />
      </div>

      {available && <p className={styles.rowNote}>지금 바로 사용할 수 있어요</p>}

      {inProgress && session && (
        <p className={styles.rowNote}>
          <span className={styles.rowLabel}>남은 시간</span> {formatRange(session.etaFrom, session.etaTo)}
        </p>
      )}

      {status === "DONE" && (
        <p className={styles.rowNote}>세탁은 끝났고 아직 정리 전이에요. 곧 사용할 수 있어요.</p>
      )}

      {/* 방치를 고객에게 "방치"라 부르지 않는다 (CLAUDE.md Notification Rule) */}
      {status === "ABANDONED" && (
        <p className={`${styles.rowNote} ${styles.rowNoteWarn}`}>
          찾아가지 않은 세탁물이 있어요. 곧 정리될 예정이에요.
        </p>
      )}
    </li>
  );
}

function Shell({ children }) {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.head}>
          <p className={styles.brand}>
            <img src="/mascot.png" alt="" aria-hidden="true" className={styles.mascot} /> 빨래집사
          </p>
          <p className={styles.store}>워시엔조이 혁신점</p>
        </header>
        <h1 className={styles.title}>매장 현황</h1>
        {children}
      </div>
    </main>
  );
}
