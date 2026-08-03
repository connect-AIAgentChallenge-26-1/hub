import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import StatusBadge from "../../components/StatusBadge.jsx";
import { formatElapsed, formatRange, formatTime, progressPercent } from "../../utils/time.js";
import styles from "./LandingPage.module.css";

/* T-14 + T-15 — 고객 화면. QR을 찍으면 열리는 단 하나의 화면이다.
   T-17: getMachine(mock)을 GET /api/machines/:id fetch로 교체하고 5초 폴링을 붙였다.

   고객은 QR을 한 번 찍는다. 신청도 여기서, 진행 확인도 여기서, 수거 확인도 여기서 한다.
   페이지를 옮겨 다니게 하지 않는다 — 화면은 하나고, 상태에 따라 내용이 갈린다.

   지켜야 할 것 (CLAUDE.md UI Rule · 빨래집사 Design Skill):
   - 빨강 금지 (방치 포함). 비난하는 인상을 주면 안 된다
   - "방치"라는 단어를 고객에게 쓰지 않는다 — "찾아가지 않은 세탁물"
   - 정보는 1가지(내 세탁 상태)만 크게
   - 종료 예상은 점이 아니라 범위로
   - Primary Action은 화면당 1개

   진행 단계는 상태 머신에 있는 것만 그린다.
   프로토타입에는 "헹굼"이 있었지만 상태 머신에 없는 단계다 —
   전력으로 감지하지 않는 단계를 화면에 그리면 채울 방법이 없다.

   알림 신청 여부는 지금 이 브라우저의 상태다. 실제 구독(Web Push)은 T-18에서 붙인다. */

const STEPS = [
  { state: "RUNNING", label: "세탁" },
  { state: "SPIN", label: "탈수" },
  { state: "DONE", label: "완료" },
];

const RUNNING_STATES = ["RUNNING", "SPIN"];

/* T-18 — QR 알림 신청. VAPID 공개키(base64url)를 PushManager가 요구하는
   Uint8Array로 바꾼다 — web-push 생태계의 표준 변환 방식. */
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

function stepIndex(status) {
  if (status === "RUNNING") return 0;
  if (status === "SPIN") return 1;
  return 2; // 끝난 세션(DONE·COLLECTED·ABANDONED)은 전부 마지막 단계다
}

/* 5초 폴링 간격 — 대시보드(OwnerDashboard)와 동일한 값을 쓴다 */
const POLL_INTERVAL_MS = 5000;

export default function LandingPage() {
  const { machineId } = useParams();
  const [machine, setMachine] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState(null);
  const [subscribed, setSubscribed] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [subscribeError, setSubscribeError] = useState(null);

  /* T-18 — 권한 요청 → Service Worker 등록 → 구독 → 서버 저장. 브라우저 미지원·권한 거부·
     저장 실패는 전부 subscribeError로 모아서 화면에 경고 타일로 보여준다(아래 렌더 부분). */
  async function handleSubscribe(sessionId) {
    if (subscribing) return;
    setSubscribing(true);
    setSubscribeError(null);
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setSubscribeError("이 브라우저는 알림 신청을 지원하지 않아요.");
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setSubscribeError("알림 권한이 거부됐어요. 브라우저 설정에서 허용 후 다시 시도해 주세요.");
        return;
      }
      await navigator.serviceWorker.register("/push-worker.js");
      const registration = await navigator.serviceWorker.ready;
      const pushSubscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(import.meta.env.VITE_VAPID_PUBLIC),
      });
      const { endpoint, keys } = pushSubscription.toJSON();

      const res = await fetch("/api/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, endpoint, keys }),
      });
      if (!res.ok) throw new Error(`구독 저장 실패 (HTTP ${res.status})`);

      setSubscribed(true);
    } catch (err) {
      console.error("[LandingPage] 알림 구독 실패", err);
      setSubscribeError("알림 신청에 실패했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSubscribing(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    /* machineId가 바뀌면(다른 QR로 이동) 이전 기계의 데이터를 들고 있으면 안 된다 */
    setMachine(null);
    setLoading(true);
    setNotFound(false);
    setError(null);

    async function loadMachine() {
      try {
        const res = await fetch(`/api/machines/${machineId}`);
        if (cancelled) return;

        if (res.status === 404) {
          setMachine(null);
          setNotFound(true);
          setError(null);
          return;
        }
        if (!res.ok) throw new Error(`서버 응답 오류 (HTTP ${res.status})`);

        const data = await res.json();
        if (cancelled) return;
        setMachine(data);
        setNotFound(false);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        console.error("[LandingPage] /api/machines/:id 조회 실패", err);
        setError("기계 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadMachine();
    const interval = setInterval(loadMachine, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [machineId]);

  if (loading) {
    return (
      <Shell>
        <div className={styles.card}>
          <h1 className={styles.cardTitle}>불러오는 중이에요</h1>
          <p className={styles.sub}>세탁기 정보를 확인하고 있어요. 잠시만 기다려 주세요.</p>
        </div>
      </Shell>
    );
  }

  if (notFound) {
    return (
      <Shell>
        <div className={styles.card}>
          <h1 className={styles.cardTitle}>기계를 찾지 못했어요</h1>
          <p className={styles.sub}>QR을 다시 찍어 주세요. 계속 안 되면 사장님께 알려 주세요.</p>
        </div>
      </Shell>
    );
  }

  if (error && !machine) {
    return (
      <Shell>
        <div className={styles.card}>
          <h1 className={styles.cardTitle}>연결이 불안정해요</h1>
          <p className={styles.sub}>{error}</p>
          <button type="button" className={styles.button} onClick={() => window.location.reload()}>
            다시 시도
          </button>
        </div>
      </Shell>
    );
  }

  const { name, status, session } = machine;
  const isRunning = RUNNING_STATES.includes(status);

  /* 알림을 신청한 사람이 없는 채로 찾아가지 않은 세탁물 — 이 QR을 찍은 사람은 다음 손님이다.
     CLAUDE.md: 알림 채널 없음 → 사장님 알림 + QR 랜딩 방치 안내 모드 전환 */
  if (status === "ABANDONED" && session.subscriberCount === 0) {
    return (
      <Shell>
        <NextCustomerGuide machine={machine} />
      </Shell>
    );
  }

  return (
    <Shell>
      {/* 이미 받아온 정보가 있는데 폴링만 실패한 경우 — 화면을 비우지 않고 조용히 알린다 */}
      {error && <p className={styles.staleNote}>{error} · 마지막으로 확인한 정보를 보여드리고 있어요.</p>}

      <section className={styles.hero}>
        <p className={styles.machineNo}>
          MACHINE {machineId.replace(/\D/g, "").padStart(2, "0")}
        </p>
        <div className={styles.heroTop}>
          <h1 className={styles.machineName}>{name}</h1>
          <StatusBadge status={status} onDark />
        </div>
        {session && isRunning && (
          <p className={styles.detect}>
            집사가 전력 데이터로 세탁 시작을 감지했어요 ({formatTime(session.startedAt)})
          </p>
        )}
      </section>

      {status === "IDLE" && (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>지금은 돌고 있는 세탁이 없어요</h2>
          <p className={styles.sub}>
            세탁을 시작하면 집사가 자동으로 감지해요. 그때 이 QR을 다시 찍으면 알림을 신청할 수
            있어요.
          </p>
        </div>
      )}

      {isRunning && (
        <>
          <Progress session={session} status={status} />
          {/* 2026-07-22 수정: subscribed(로컬 state)만 보면 알림 탭·새로고침으로 화면이
              새로 뜰 때마다 실제로는 구독돼 있어도 "신청 안 함"으로 되돌아갔다(실기기 테스트로
              발견). 서버가 내려주는 session.subscriberCount를 같이 봐서 진짜 상태를 반영한다.
              subscribed는 방금 이 화면에서 성공한 직후 폴링 전에도 즉시 반영되게 남겨둔다. */}
          {subscribed || session.subscriberCount > 0 ? (
            <p className={`${styles.tile} ${styles.tileOn}`}>
              <span className={styles.tileIcon}>🔔</span>
              <span>
                <b>알림 신청 완료</b> — 마지막 탈수가 감지되면 "지금 출발하세요" 알림을, 끝나면 완료
                알림을 보내드릴게요.
              </span>
            </p>
          ) : (
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>세탁 알림 받기</h2>
              <p className={styles.sub}>
                출발할 시점과 완료 시점에 알려드려요. 연락처 입력도, 앱 설치도 없어요.
              </p>
              <button
                type="button"
                className={styles.button}
                disabled={subscribing}
                onClick={() => handleSubscribe(session.id)}
              >
                {subscribing ? "신청 중…" : "이 세탁기 알림 신청"}
              </button>
              <p className={styles.fineprint}>
                신청하지 않아도 이 화면에서 진행 상황은 계속 볼 수 있어요. 다만 완료·수거 알림은
                보내드릴 수 없어요.
              </p>
            </div>
          )}
          {subscribeError && (
            <p className={`${styles.tile} ${styles.tileWarn}`}>
              <span className={styles.tileIcon}>🔕</span>
              <span>{subscribeError}</span>
            </p>
          )}
          <ButlerTip>
            세탁이 끝나고 오래 찾아가지 않으면, 집사가 대신 챙기고 사장님께 알려요.
          </ButlerTip>
        </>
      )}

      {(status === "DONE" || status === "ABANDONED") && (
        <Finished
          name={name}
          session={session}
          waiting={status === "ABANDONED"}
          subscribed={session.subscriberCount > 0}
        />
      )}

      {status === "COLLECTED" && (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>수거가 확인됐어요</h2>
          <p className={styles.sub}>
            {formatTime(session.endedAt)}에 세탁이 끝났고, 문이 열린 걸 확인했어요. 이용해 주셔서
            고마워요.
          </p>
        </div>
      )}
    </Shell>
  );
}

/* 진행 — 종료 예상(범위)과 단계. 이 화면에서 가장 크게 읽혀야 하는 정보다 */
function Progress({ session, status }) {
  const current = stepIndex(status);
  const pct = progressPercent(session.startedAt, session.etaTo);
  // 고양이가 바 양끝에서 잘리지 않게 6~94%로 가둔다. 바 채우기(pct)는 실제 값 그대로.
  const runnerLeft = Math.min(94, Math.max(6, pct));

  return (
    <section className={styles.card}>
      <div className={styles.eta}>
        <p className={styles.etaLabel}>종료 예상</p>
        {/* 시간은 점이 아니라 범위로 알려준다. 점으로 띄우면 약속처럼 읽힌다 */}
        <p className={styles.etaRange}>{formatRange(session.etaFrom, session.etaTo)}</p>
        <p className={styles.etaNote}>진행되면서 범위가 점점 좁혀져요</p>
      </div>

      {/* 집사가 빨랫감을 들고 진행 바 위를 달린다 — 진행률만큼 앞으로 이동하고,
          2프레임 스프라이트(다리 펼침·모음)를 번갈아 보여줘 실제로 다리를 저으며 달린다. */}
      <div className={styles.track}>
        <span
          className={styles.runner}
          aria-hidden="true"
          style={{ left: `${runnerLeft}%` }}
        />
        <div className={styles.bar}>
          <div className={styles.barFill} style={{ width: `${pct}%` }} />
        </div>
      </div>

      <ol className={styles.steps}>
        {STEPS.map((step, index) => (
          <li
            key={step.state}
            className={`${styles.step} ${index <= current ? styles.stepDone : ""}`}
          >
            <span className={styles.stepDot} />
            {step.label}
          </li>
        ))}
      </ol>
    </section>
  );
}

/* 완료 · 수거 대기. waiting이면 15분을 넘긴 상태지만 문구는 똑같이 비난하지 않는다.

   subscribed(subscriberCount > 0)로 한 번 더 갈린다 — "미신청" 상태(T-14의 3번 상태).
   알림 채널이 없으면 "수거 안내를 보내드려요"라는 약속을 할 수 없다 (CLAUDE.md:
   알림 채널 없음 → 사장님 알림 + QR 랜딩 방치 안내 모드 전환). 못 지킬 약속 대신
   지금 바로 찾아가 달라고 안내한다. waiting(=ABANDONED)일 때는 subscriberCount 0이면
   이 컴포넌트 대신 NextCustomerGuide로 빠지므로 그 조합은 실제로는 나타나지 않는다. */
function Finished({ name, session, waiting, subscribed }) {
  const tileText = waiting
    ? "다음 손님을 위해 세탁물을 찾아가 주세요. 오래 두면 집사가 사장님께 보관을 부탁드려요."
    : subscribed
      ? "15분이 지나면 다음 손님을 위해 수거 안내를 한 번 더 보내드려요."
      : "지금은 알림을 보내드릴 방법이 없어요. 잊지 말고 빨리 찾아가 주세요 — 오래 걸리면 사장님께 도움을 요청드릴게요.";

  return (
    <>
      <div className={styles.card}>
        <div className={styles.doneHero}>
          {/* 다 끝나면 집사가 따봉 — 방치(waiting)일 땐 아직 못 끝낸 일이라 바구니 아이콘 유지 */}
          {waiting ? (
            <span className={styles.doneIcon}>🧺</span>
          ) : (
            <img
              src="/mascot/mascot-collected.png"
              alt=""
              aria-hidden="true"
              className={styles.doneMascot}
            />
          )}
          <h2 className={styles.doneTitle}>세탁이 끝났어요</h2>
          <p className={styles.sub}>
            {name} · {formatTime(session.endedAt)} 종료
          </p>
          <span className={styles.waitChip}>{formatElapsed(session.endedAt)}째 기다리는 중</span>
        </div>

        {/* 수거는 문 열림으로 자동 감지한다(상태머신 트리거 ①). 고객이 미리 누르면
            도착 전 오탐이 생기므로 "수거했어요" 탭 버튼은 두지 않는다(2026-07-27 결정). */}
        <p className={styles.fineprint}>
          세탁물을 꺼내시면 자동으로 정리돼요. 따로 눌러 알리실 필요 없어요.
        </p>
      </div>

      <p className={`${styles.tile} ${waiting || !subscribed ? styles.tileWarn : ""}`}>
        <span className={styles.tileIcon}>{waiting ? "🧺" : subscribed ? "⏱️" : "🔕"}</span>
        <span>{tileText}</span>
      </p>
    </>
  );
}

/* 방치 안내 모드 — 이 화면을 보는 사람은 세탁물 주인이 아니라 다음 손님이다.
   주인을 탓하지 않으면서, 다음 손님이 기계를 쓸 수 있게 하는 게 목적이다. */
function NextCustomerGuide({ machine }) {
  const { name, session } = machine;

  return (
    <>
      <section className={styles.card}>
        <div className={styles.heroTop}>
          <h1 className={styles.machineName}>{name}</h1>
          <StatusBadge status="ABANDONED" detail={formatElapsed(session.endedAt)} />
        </div>
        <p className={styles.sub}>
          이 세탁기에는 <b>아직 찾아가지 않은 세탁물</b>이 있어요. 집사가 안내를 보냈지만 아직
          수거되지 않아 사장님께도 알렸어요.
        </p>
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>지금 이 세탁기를 쓰고 싶다면</h2>
        <ol className={styles.guide}>
          <li>
            <span className={styles.stepNo}>1</span>
            안의 세탁물을 꺼내 <b>옆 선반 위에</b> 올려 주세요
          </li>
          <li>
            <span className={styles.stepNo}>2</span>
            바로 사용하시면 돼요 — 매장 규칙상 괜찮아요
          </li>
          <li>
            <span className={styles.stepNo}>3</span>
            원래 주인에게 보관 위치를 안내하는 기능은 준비 중이에요
          </li>
        </ol>
        <button type="button" className={styles.buttonDisabled} disabled>
          선반으로 옮기고 사용할게요 (준비 중)
        </button>
      </section>
    </>
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
        {children}
      </div>
    </main>
  );
}

function ButlerTip({ children }) {
  return (
    <p className={styles.tip}>
      <img src="/mascot.png" alt="빨래집사 마스코트" className={styles.mascotTip} />
      <span>{children}</span>
    </p>
  );
}
