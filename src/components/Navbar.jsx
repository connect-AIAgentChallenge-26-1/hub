import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import nagbotFaceLv0 from "../assets/characters/nagbot_face_lv0.png";
import { subscribeToPush } from "../lib/pushSubscribe";
import "./Navbar.css";

const NAV_LINKS = [
  { to: "/home", label: "홈" },
  { to: "/register", label: "할 일 등록" },
  { to: "/history", label: "히스토리" },
];

// 알림 버튼 상태별 표시 — content-as-data.
// permission만으로는 "권한은 granted인데 실제 구독은 없는" 상태(브라우저가 구독을
// 폐기했거나 최초 구독이 실패한 경우)를 구분할 수 없어, permission과 실제
// pushManager 구독 존재 여부를 조합해 상태를 나눈다.
// - default: 아직 권한을 물어본 적 없음 → 요청부터 시작
// - granted-no-sub: 권한은 있지만 구독이 없음 → requestPermission 재호출 없이 재구독만 시도
// - granted-with-sub: 정상 구독 존재 → 비활성
// - denied/unsupported: 사용자가 바꿀 수 없는 상태 → 비활성
const NOTIFICATION_UI = {
  default: { label: "🔔 알림 켜기", clickable: true },
  checking: { label: "🔔 알림 확인 중", clickable: false },
  "granted-no-sub": { label: "🔔 알림 다시 켜기", clickable: true },
  "granted-with-sub": { label: "🔔 알림 켜짐", clickable: false },
  denied: { label: "🔔 알림 차단됨", clickable: false },
  unsupported: { label: "🔔 알림 미지원", clickable: false },
};

// Notification API를 지원하지 않는 브라우저도 있으므로 초기값을 안전하게 읽는다.
function readPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission;
}

function Navbar() {
  // 마운트 시점의 현재 권한 상태를 초기값으로. (lazy initializer로 최초 1회만 읽음)
  const [permission, setPermission] = useState(readPermission);
  // 실제 pushManager 구독 존재 여부. null(아직 확인 전) 동안은 permission만으로
  // granted를 "구독 있음"으로 낙관 처리해 기존 동작(즉시 비활성 표시)과 호환한다.
  const [hasSubscription, setHasSubscription] = useState(null);

  // 마운트 시 1회만 실제 구독 존재 여부를 확인한다. permission을 의존성에 넣지
  // 않는 이유: handleRequestPermission이 트리거하는 setPermission("granted")과
  // 뒤이은 trySubscribe()의 setHasSubscription(true)이 이 effect와 같은 타이밍에
  // 겹치면, effect가 나중에 도착해 방금 갱신한 true를 stale한 false로 덮어써버리는
  // 레이스가 생긴다. 마운트 시점 판단은 새로고침 등으로 이미 granted인 케이스만
  // 다루면 충분하고, 이번 세션 내 구독 결과는 trySubscribe가 직접 관리한다.
  useEffect(() => {
    if (readPermission() !== "granted") return;
    if (!("serviceWorker" in navigator)) {
      setHasSubscription(false);
      return;
    }
    let cancelled = false;
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => {
        if (!cancelled) setHasSubscription(Boolean(subscription));
      })
      .catch(() => {
        if (!cancelled) setHasSubscription(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function trySubscribe() {
    // 구독 생성/전송 실패가 알림 권한 버튼 자체를 깨뜨리지 않도록 방어(#42).
    // 실패 시 hasSubscription을 true로 바꾸지 않아 "켜짐"으로 잘못 표시되지 않고
    // 재시도 가능한 상태(granted-no-sub)를 유지한다.
    try {
      await subscribeToPush();
      setHasSubscription(true);
    } catch (err) {
      console.error(err);
      setHasSubscription(false);
    }
  }

  async function handleRequestPermission() {
    if (!("Notification" in window)) return;

    // 권한이 이미 granted인데 구독만 없는 경우엔 브라우저가 재차 묻지 않으므로
    // requestPermission()을 다시 부르지 않고 바로 재구독을 시도한다.
    if (Notification.permission === "granted") {
      await trySubscribe();
      return;
    }

    // initial-prototype.html의 Notification.requestPermission() 패턴 재사용 — Promise 형태로 받아 상태 반영.
    const result = await Notification.requestPermission();
    setPermission(result);

    if (result === "granted") {
      await trySubscribe();
    }
  }

  const statusKey =
    permission === "granted"
      ? hasSubscription === null
        ? "checking"
        : hasSubscription
          ? "granted-with-sub"
          : "granted-no-sub"
      : permission;
  const ui = NOTIFICATION_UI[statusKey] ?? NOTIFICATION_UI.unsupported;

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <NavLink className="brand" to="/landing">
          <img
            className="brand-logo"
            src={nagbotFaceLv0}
            alt=""
            aria-hidden="true"
          />
          잔소리봇
        </NavLink>
        <div className="nav-links">
          {NAV_LINKS.map(({ to, label }) => (
            <NavLink key={to} className="nav-link" to={to}>
              {label}
            </NavLink>
          ))}
        </div>
        <button
          className={
            statusKey === "granted-with-sub"
              ? "nav-perm-btn nav-perm-btn-on"
              : "nav-perm-btn"
          }
          type="button"
          onClick={handleRequestPermission}
          disabled={!ui.clickable}
        >
          {ui.label}
        </button>
      </div>
    </nav>
  );
}

export default Navbar;
