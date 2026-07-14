// 결(結) — 기기 식별(익명 device_id) 추출·검증
//
// 로그인 없이 기기별로 데이터를 격리한다. 브라우저가 localStorage의 UUID를
// x-device-id 헤더로 보낸다. 실제 인증을 붙일 땐 여기서 세션 토큰을 검증하도록 교체.

const ID_RE = /^[A-Za-z0-9-]{8,64}$/;

export function deviceId(req) {
  const raw = req.headers['x-device-id'];
  const id = Array.isArray(raw) ? raw[0] : raw;
  if (typeof id === 'string' && ID_RE.test(id)) return id;
  return null;
}
