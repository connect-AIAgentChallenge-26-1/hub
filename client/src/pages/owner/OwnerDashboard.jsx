import { useEffect, useState } from "react";
import { NOTIFICATION_TYPE } from "../../constants.js";
import OwnerNav from "../../components/OwnerNav.jsx";
import StatusBadge from "../../components/StatusBadge.jsx";
import { formatElapsed, formatRange, formatTime, progressPercent } from "../../utils/time.js";
import { mascotPose } from "../../utils/mascotPose.js";
import styles from "./OwnerDashboard.module.css";

/* T-16 사장님 대시보드.
   T-17: 기계 목록(GET /api/machines)·처리 내역(GET /api/notifications/recent) 모두 fetch로 교체 완료.
   NOTIFICATION_TYPE(알림 5종 enum)만 mocks에서 계속 가져다 쓴다 — 데이터가 아니라 타입 정의다.
   아래 byUrgency·summarize·TodoCard·MachineCard·describe는 손대지 않는다.

   이 화면이 답해야 하는 질문은 하나다 — "지금 내가 손댈 게 있나?"
   그래서 맨 위가 "사장님 손이 필요해요"이고, 할 게 없으면 "다 괜찮아요"가 뜬다.
   사장님이 가장 자주 봐야 하는 건 후자다. 그게 이 서비스가 파는 것이다.

   문구는 셋이 겹치지 않게 갈라 쓴다.
   - "사장님 손이 필요해요" — 사장님이 나서야 하는 일 전체 (맨 위 카드)
   - "점검 필요"          — 기계가 이상하다 (기계 카드)
   - "사장님께 알림"       — 집사가 사장님에게 넘긴 방치 건 (처리 내역)

   관리자 화면이라 표준 존댓말만 쓴다 ("~냥" 금지 — 돈·운영을 다루는 화면).
   빨강(#E84D4D)은 쓰지 않는다. 방치는 오류가 아니라서다 (CLAUDE.md 빨강 정책).
   사장님이 나서야 하는 건 방치색(#F08C00), 집사가 해결한 건 완료색(#4CAF50).
   색은 배경으로 넓게 깔지 않고 배지·아이콘에 작고 진하게 쓴다 — 배경을 칠하면 본문 대비가 깎인다. */

const RUNNING_STATES = ["RUNNING", "SPIN"];

/* 사장님이 손대야 하는 순서. 기계 번호순이 아니라 급한 순으로 본다 */
const URGENCY = ["ABANDONED", "DONE", "SPIN", "RUNNING", "COLLECTED", "IDLE"];

/* 이름 끝 숫자를 뽑아 번호순 정렬에 쓴다 ("세탁기 2" → 2). 숫자가 없으면 이름 문자열로 */
function machineNumber(machine) {
  const match = String(machine.name ?? "").match(/\d+/);
  return match ? Number(match[0]) : Number.POSITIVE_INFINITY;
}

function byUrgency(a, b) {
  const rank = (machine) => {
    const base = URGENCY.indexOf(machine.status);
    /* 확인 필요는 방치보다는 덜 급하지만 나머지보다는 먼저 본다 */
    return machine.needsAttention && machine.status === "IDLE" ? 0.5 : base;
  };
  /* 급함이 같으면(예: 다 대기) 기계 번호순으로 — DB 저장 순서(2,1,4,3)가 새지 않게 */
  const byRank = rank(a) - rank(b);
  if (byRank !== 0) return byRank;
  const byNumber = machineNumber(a) - machineNumber(b);
  if (byNumber !== 0) return byNumber;
  return String(a.name ?? "").localeCompare(String(b.name ?? ""), "ko");
}

/* 처리 내역 한 줄이 사장님 일인지 아닌지를 여기서 가른다.
   저장된 문구가 아니라 type과 sessionState로 판단한다 (CLAUDE.md 조회 API). */
function describe(notification) {
  const { type, sessionState, machineName } = notification;

  if (type === NOTIFICATION_TYPE.OWNER_ALERT) {
    return {
      /* "확인 필요"라고 쓰지 않는다 — 기계 카드의 "점검 필요"(전력 이상)와 헷갈린다.
         이건 기계 문제가 아니라 집사가 사장님에게 넘긴 일이다 */
      tag: "사장님께 알림",
      tone: "attention",
      /* 로그는 짧게. "왜 사장님께 넘겼는지"는 위의 "사장님 손이 필요해요"가 이미 설명한다 */
      text: `${machineName} — QR 미신청 방치. 사장님께 알리고 QR 화면을 방치 안내 모드로 바꿨어요.`,
    };
  }

  const collected = sessionState === "COLLECTED";
  const label = {
    [NOTIFICATION_TYPE.DEPARTURE]: "종료 임박 알림",
    [NOTIFICATION_TYPE.COMPLETED]: "완료 알림",
    [NOTIFICATION_TYPE.COLLECT_1]: "1차 수거 알림",
    [NOTIFICATION_TYPE.COLLECT_2]: "2차 수거 알림",
  }[type];

  /* 기계 이름이 숫자로 끝나서 "세탁기 1 1차 수거 알림"이 "세탁기 11차"로 읽힌다.
     이름과 내용 사이를 —로 끊는다. */
  return {
    tag: collected ? "자동 해결" : "자동 안내",
    tone: collected ? "resolved" : "info",
    text: collected
      ? `${machineName} — ${label} 발송 후 도어 열림으로 수거를 확인했어요.`
      : `${machineName} — ${label}을 보냈어요.`,
  };
}

/* 기계 카드가 답하는 건 "지금 어떤 상태인가"다.
   긴 설명("집사가 판단할 범위를 벗어났어요…")은 위의 "사장님 손이 필요해요"에만 둔다 —
   같은 문장이 화면에 두 번 뜨면 소음이다.
   다만 짧은 꼬리표(QR 미신청 · 점검 필요)는 반복이 아니라 표식이다.
   기계 현황만 훑는 사람은 그게 없으면 왜 이 기계가 방치인지 알 수 없다. */
function summarize(machine) {
  const { status, session, attentionReason } = machine;

  if (!session) return attentionReason ?? "대기 중이에요.";

  if (RUNNING_STATES.includes(status)) {
    const subscribers =
      session.subscriberCount > 0 ? `알림 신청 ${session.subscriberCount}명` : "알림 미신청";
    return `종료 예상 ${formatRange(session.etaFrom, session.etaTo)} · ${subscribers}`;
  }
  if (status === "DONE") {
    return `${formatTime(session.endedAt)} 종료 · 수거 대기 ${formatElapsed(session.endedAt)}째`;
  }
  if (status === "ABANDONED") {
    return `${formatTime(session.endedAt)} 종료 · 아직 찾아가지 않았어요`;
  }
  if (status === "COLLECTED") {
    return `${formatTime(session.endedAt)} 종료 · 도어 열림으로 수거 확인`;
  }
  return "";
}

/* 5초 폴링 간격. 대시보드 안내 문구("5초마다 자동 갱신")와 값을 맞춘다 */
const POLL_INTERVAL_MS = 5000;

export default function OwnerDashboard() {
  /* 자동으로 5초마다 갱신되지만 손잡이는 하나 있어야 한다.
     "지금 당장 확인하고 싶다"는 순간에 누를 게 없으면 사장님이 화면을 못 믿는다. */
  const [rawMachines, setRawMachines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshedAt, setRefreshedAt] = useState(() => Date.now());

  /* 처리 내역은 기계 목록과 다른 자원이라 loading/error를 따로 관리한다.
     한쪽이 실패해도 다른 쪽 화면은 멀쩡해야 한다. */
  const [rawNotifications, setRawNotifications] = useState([]);
  const [notifLoading, setNotifLoading] = useState(true);
  const [notifError, setNotifError] = useState(null);

  async function loadMachines() {
    try {
      const res = await fetch("/api/machines");
      if (!res.ok) throw new Error(`서버 응답 오류 (HTTP ${res.status})`);
      const data = await res.json();
      setRawMachines(data);
      setError(null);
    } catch (err) {
      console.error("[OwnerDashboard] /api/machines 조회 실패", err);
      setError("기계 목록을 불러오지 못했어요. 서버 연결 상태를 확인해 주세요.");
    } finally {
      setLoading(false);
      setRefreshedAt(Date.now());
    }
  }

  async function loadNotifications() {
    try {
      const res = await fetch("/api/notifications/recent");
      if (!res.ok) throw new Error(`서버 응답 오류 (HTTP ${res.status})`);
      const data = await res.json();
      setRawNotifications(data);
      setNotifError(null);
    } catch (err) {
      console.error("[OwnerDashboard] /api/notifications/recent 조회 실패", err);
      setNotifError("최근 처리 내역을 불러오지 못했어요.");
    } finally {
      setNotifLoading(false);
    }
  }

  useEffect(() => {
    /* 대시보드는 "5초마다 한 번" 갱신된다는 개념을 유지한다 — interval은 하나만 둔다 */
    loadMachines();
    loadNotifications();
    const interval = setInterval(() => {
      loadMachines();
      loadNotifications();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  const running = rawMachines.filter((machine) => RUNNING_STATES.includes(machine.status));
  const idle = rawMachines.filter((machine) => machine.status === "IDLE");
  const abandoned = rawMachines.filter((machine) => machine.status === "ABANDONED");
  const attention = rawMachines.filter((machine) => machine.needsAttention);
  const handled = rawNotifications.filter((n) => n.sessionState === "COLLECTED").length;

  // 대시보드는 기계 번호순(1·2·3·4)으로 고정 표시한다 (사장님 요청).
  // byUrgency(급한 순)는 함수로 남겨두되 여기선 쓰지 않는다.
  const machineNo = (m) => Number(String(m.name).replace(/\D/g, "")) || 0;
  const machines = [...rawMachines].sort((a, b) => machineNo(a) - machineNo(b));

  return (
    <div className={styles.layout}>
      <OwnerNav />

      <main className={styles.page}>
        <header className={styles.head}>
          <h1 className={styles.greeting}>안녕하세요, 사장님</h1>
          <div className={styles.refresh}>
            <button type="button" className={styles.refreshButton} onClick={loadMachines}>
              새로고침
            </button>
            <p className={styles.refreshNote}>
              5초마다 자동 갱신 · 마지막 {formatTime(new Date(refreshedAt).toISOString())}
            </p>
          </div>
        </header>

        {loading ? (
          <p className={styles.strip}>기계 목록을 불러오는 중이에요…</p>
        ) : error && rawMachines.length === 0 ? (
          <section className={styles.errorCard}>
            <p className={styles.errorText}>{error}</p>
            <button type="button" className={styles.refreshButton} onClick={loadMachines}>
              다시 시도
            </button>
          </section>
        ) : (
          <>
            {error && <p className={styles.errorNote}>{error} · 마지막으로 불러온 정보를 보여드리고 있어요.</p>}

            <TodoCard abandoned={abandoned} attention={attention} handled={handled} />

            <p className={styles.strip}>
              기계 {rawMachines.length}대 · 가동 중 {running.length} · 대기 {idle.length}
            </p>

            <section>
              <div className={styles.sectionHead}>
                <h2>기계 현황</h2>
                <span>전력·도어 센서로 자동 감지 · 5초마다 갱신 · 번호 순</span>
              </div>
              <div className={styles.machines}>
                {machines.map((machine) => (
                  <MachineCard key={machine.id} machine={machine} />
                ))}
              </div>
            </section>

            {/* 집사가 이미 해결한 일이다. 매번 읽을 이유가 없으니 접어둔다.
                다만 "집사가 일하고 있다"는 증거라 없애지는 않는다 */}
            <details className={styles.log}>
              <summary className={styles.logSummary}>
                최근 처리 내역
                <span className={styles.logNote}>집사가 {handled}건을 자동으로 해결했어요</span>
              </summary>
              {notifLoading ? (
                <p className={styles.logState}>불러오는 중이에요…</p>
              ) : notifError && rawNotifications.length === 0 ? (
                <div className={styles.logErrorWrap}>
                  <section className={styles.errorCard}>
                    <p className={styles.errorText}>{notifError}</p>
                    <button
                      type="button"
                      className={styles.refreshButton}
                      onClick={loadNotifications}
                    >
                      다시 시도
                    </button>
                  </section>
                </div>
              ) : rawNotifications.length === 0 ? (
                <p className={styles.logState}>아직 처리한 내역이 없어요.</p>
              ) : (
                <>
                  {notifError && <p className={styles.logState}>{notifError} · 마지막으로 불러온 내역을 보여드리고 있어요.</p>}
                  <Feed notifications={rawNotifications} />
                </>
              )}
            </details>

            {/* T-20 — 승인 대기함. UI 자리만 둔다(CLAUDE.md MVP Scope) — 발주·환불처럼
                되돌리기 어렵거나 돈이 나가는 3단계 행동(docs/plan.md)이 나중에 여기 쌓인다.
                지금 MVP는 3단계 행동을 하나도 만들지 않으므로 이 화면은 항상 빈 상태다. */}
            <details className={styles.log}>
              <summary className={styles.logSummary}>
                승인 대기함
                <span className={styles.logNote}>사장님 승인이 필요한 일을 모아둘 자리예요</span>
              </summary>
              <div className={styles.approvalBody}>
                <p className={styles.logState}>아직 승인이 필요한 일이 없어요.</p>
                <button type="button" className={styles.approvalButton} disabled>
                  승인하기 (준비 중)
                </button>
              </div>
            </details>
          </>
        )}
      </main>
    </div>
  );
}

/* 지금 챙길 것 — 사장님이 이 화면에서 답을 얻어야 하는 유일한 질문이다.
   할 게 없으면 "다 괜찮아요"가 뜬다. 그게 이 서비스의 가치다 */
function TodoCard({ abandoned, attention, handled }) {
  const todos = [
    ...abandoned.map((machine) => ({
      key: machine.id,
      title: `${machine.name} · ${formatElapsed(machine.session.endedAt)}째 찾아가지 않았어요`,
      body:
        machine.session.subscriberCount === 0
          ? "QR 미신청이라 손님께 연락할 방법이 없어요. 선반으로 옮겨 두시면 집사가 안내할게요."
          : "집사가 수거 알림을 보냈지만 아직 찾아가지 않았어요.",
    })),
    /* 무엇이 이상한지(attentionReason)는 기계 카드가 말한다.
       여기서는 사장님이 뭘 하면 되는지만 말한다 — 같은 문장을 두 번 쓰지 않는다 */
    ...attention.map((machine) => ({
      key: `${machine.id}-attention`,
      title: `${machine.name} · 점검이 필요해요`,
      body: "집사가 판단할 수 있는 범위를 벗어났어요. 기계를 한 번 봐 주세요.",
      minor: true,
    })),
  ];

  if (todos.length === 0) {
    return (
      <section className={`${styles.todo} ${styles.todoClear}`}>
        <span className={`${styles.todoIcon} ${styles.todoIconClear}`}>
          <img src="/mascot.png" alt="" aria-hidden="true" className={styles.todoMascot} />
        </span>
        <div>
          <h2 className={styles.todoTitle}>다 괜찮아요</h2>
          <p className={styles.todoBody}>
            사장님이 챙길 일이 없어요. 집사가 오늘 {handled}건을 자동으로 처리했어요.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.todo}>
      {/* "지금 챙길 것"이 아니다 — 대시보드는 늘 실시간이라 "지금"은 재촉만 되고,
         "챙길 것"은 사장님이 뭔가 놓쳤다는 뉘앙스가 된다.
         집사가 다 하고 정말 안 되는 것만 부탁드리는 관계를 문구로 그대로 말한다 */}
      <h2 className={styles.todoTitle}>
        사장님 손이 필요해요
        <span className={styles.todoCount}>{todos.length}</span>
      </h2>
      <ul className={styles.todoList}>
        {todos.map(({ key, title, body, minor }) => (
          <li key={key} className={`${styles.todoItem} ${minor ? styles.todoMinor : ""}`}>
            <span className={styles.todoIcon}>{minor ? "🔧" : "🧺"}</span>
            <div className={styles.todoText}>
              <p className={styles.todoItemTitle}>{title}</p>
              <p className={styles.todoBody}>{body}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Feed({ notifications }) {
  return (
    <ul className={styles.feed}>
      {notifications.map((notification) => {
        const { tag, tone, text } = describe(notification);
        return (
          <li key={notification.id} className={styles.feedItem}>
            <time className={styles.feedTime}>{formatTime(notification.sentAt)}</time>
            <span className={`${styles.tag} ${styles[tone]}`}>{tag}</span>
            <span className={styles.feedText}>{text}</span>
          </li>
        );
      })}
    </ul>
  );
}

function MachineCard({ machine }) {
  const { name, status, session, needsAttention } = machine;
  const isRunning = RUNNING_STATES.includes(status);

  return (
    <article className={`${styles.machine} ${status === "ABANDONED" ? styles.machineAlert : ""}`}>
      <div className={styles.machineTop}>
        <div className={styles.machineTitle}>
          {/* 세탁 중엔 다리 저으며 달리는 스프라이트, 그 외엔 상태별 정지 포즈 */}
          {isRunning ? (
            <span className={styles.cardRunner} aria-hidden="true" />
          ) : (
            mascotPose(status) && (
              <img
                className={styles.cardMascot}
                src={mascotPose(status)}
                alt=""
                aria-hidden="true"
              />
            )
          )}
          <h3 className={styles.machineName}>{name}</h3>
        </div>
        {/* 방치만 꽉 채운다. 카드 배경을 칠하는 대신 배지 하나를 진하게 — 본문 대비를 안 깎는다 */}
        <StatusBadge
          status={status}
          audience="owner"
          solid={status === "ABANDONED"}
          detail={status === "ABANDONED" ? formatElapsed(session.endedAt) : undefined}
        />
      </div>

      <p className={styles.machineMeta}>{summarize(machine)}</p>

      {isRunning && (
        <div className={styles.bar}>
          <div
            className={styles.barFill}
            style={{ width: `${progressPercent(session.startedAt, session.etaTo)}%` }}
          />
        </div>
      )}

      {/* 짧은 꼬리표. 기계 현황만 훑어도 왜 이 기계가 눈에 걸리는지 알 수 있어야 한다.
          "점검 필요"는 기계를 봐야 하는 일, "QR 미신청"은 손님께 연락할 방법이 없다는 뜻 */}
      <div className={styles.chips}>
        {needsAttention && <span className={styles.check}>점검 필요</span>}
        {status === "ABANDONED" && session.subscriberCount === 0 && (
          <span className={styles.noChannel}>QR 미신청</span>
        )}
      </div>
    </article>
  );
}
