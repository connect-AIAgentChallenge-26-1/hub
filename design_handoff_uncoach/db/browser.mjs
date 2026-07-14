// 결(結) — 브라우저용 데이터 클라이언트
//
// 기기별 device_id(UUID)를 localStorage에 두고 x-device-id 헤더로 보낸다.
// /api/data 로 프로필·훈련기록·자산·커스텀 상황을 읽고 쓴다.
// (localStorage의 채점/상태 저장을 이 함수들로 대체하면 서버 영구 저장으로 전환된다.)

const DEVICE_KEY = 'uncoach-device-id';

export function getDeviceId() {
  let id = null;
  try { id = localStorage.getItem(DEVICE_KEY); } catch {}
  if (!id) {
    id = (crypto && crypto.randomUUID) ? crypto.randomUUID()
      : 'dev-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    try { localStorage.setItem(DEVICE_KEY, id); } catch {}
  }
  return id;
}

async function call(action, payload = {}, { apiUrl = '/api/data' } = {}) {
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-device-id': getDeviceId() },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error && data.error.message) || `HTTP ${res.status}`);
  return data;
}

// 전체 상태 로드 → { profile, history, assets, customSits }
export const loadState = (opts) => call('load', {}, opts);
export const saveProfile = (profile, opts) => call('saveProfile', { profile }, opts);
// session: { situationId, scores(scoreDraft 결과의 scores), total }
export const addSession = (session, opts) => call('addSession', { session }, opts);
export const addAsset = (asset, opts) => call('addAsset', { asset }, opts);           // { text, situationId }
export const addSituation = (situation, opts) => call('addSituation', { situation }, opts);
export const removeSituation = (id, opts) => call('removeSituation', { id }, opts);
