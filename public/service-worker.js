const CACHE_NAME = "nagging-bot-static-v2";
const PRECACHE_URLS = [
  "/",
  "/manifest.json",
  "/icons/nagbot-app-icon-192.png",
  "/icons/nagbot-app-icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      ),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      // 네비게이션 요청(/home, /history 등 SPA 라우트 진입)만 오프라인 시 캐시된
      // "/"로 폴백한다. /api/* 등 그 외 요청까지 "/"(HTML)로 대체하면 프론트가
      // JSON으로 파싱하려다 에러가 나므로, 이 요청들은 지금처럼 그대로 reject되게 둔다.
      if (event.request.mode === "navigate") {
        return fetch(event.request).catch(() => caches.match("/"));
      }
      return fetch(event.request);
    }),
  );
});

// 서버가 전달하는 Push payload에서 title과 body를 사용한다.
// 값이 없거나 JSON 파싱에 실패하면 기본 알림 문구로 폴백한다.
const DEFAULT_NOTIFICATION_TITLE = "잔소리봇";
const DEFAULT_NOTIFICATION_BODY = "확인할 게 있어요!";
const NOTIFICATION_ICON = "/icons/nagbot-app-icon-192.png";

// PushMessageData의 json()/text()는 Fetch body와 달리 여러 번 호출해도 안전하다
// (스펙상 스트림이 아니라 바이트 시퀀스 래퍼) — json() 실패 시 text()로 그대로 폴백한다.
function parsePushPayload(data) {
  if (!data) {
    return {
      title: DEFAULT_NOTIFICATION_TITLE,
      body: DEFAULT_NOTIFICATION_BODY,
    };
  }
  try {
    const json = data.json();
    return {
      title: json.title || DEFAULT_NOTIFICATION_TITLE,
      body: json.body || DEFAULT_NOTIFICATION_BODY,
    };
  } catch {
    return {
      title: DEFAULT_NOTIFICATION_TITLE,
      body: data.text() || DEFAULT_NOTIFICATION_BODY,
    };
  }
}

self.addEventListener("push", (event) => {
  const { title, body } = parsePushPayload(event.data);
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: NOTIFICATION_ICON,
    }),
  );
});

// 알림 클릭 시 이미 열려있는 앱 탭이 있으면 그쪽으로 포커스, 없으면 새 탭을 연다.
// focus()는 실패(reject)할 수 있으므로(브라우저/탭 상태에 따라) 한 client에서 실패해도
// 조용히 끝내지 않고 다음 후보로 넘어가며, 모든 후보가 실패하면 openWindow로 폴백한다.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (clientsList) => {
        for (const client of clientsList) {
          try {
            return await client.focus();
          } catch {
            // 이 client는 focus 실패 — 다음 후보로 계속
          }
        }
        if (self.clients.openWindow) return self.clients.openWindow("/home");
        return undefined;
      }),
  );
});
