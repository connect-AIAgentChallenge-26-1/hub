// 결(結) — 앱 데이터 API (프로필·훈련기록·자산·커스텀 상황)
//
// 단일 엔드포인트 + action 방식. 기기 식별은 x-device-id 헤더.
// POST /api/data  { action, ...payload }
//   action: 'load' | 'saveProfile' | 'addSession' | 'addAsset' | 'addSituation' | 'removeSituation'
//
// 배포: DATABASE_URL 환경변수 + `node db/migrate.mjs` 로 스키마 적용 후 사용.

import { checkOrigin, applyCors, clientIp } from './_guard.mjs';
import { checkRate } from './_ratelimit.mjs';
import { deviceId } from './_device.mjs';
import {
  ensureDevice, getState, upsertProfile,
  addSession, addAsset, addSituation, removeSituation,
  saveBlob, getBlob,
} from '../db/repo.mjs';

const BLOB_MAX_BYTES = 200_000; // 프로토타입 blob 크기 상한

const DATA_MAX = Number(process.env.DATA_RATE_PER_MIN) || 120; // 데이터 호출은 저렴 → 넉넉히

export default async function handler(req, res) {
  // 1) Origin + CORS + 프리플라이트
  const origin = checkOrigin(req);
  if (origin.ok) applyCors(res, origin.origin);
  if (req.method === 'OPTIONS') { res.status(origin.ok ? 204 : 403).end(); return; }
  if (!origin.ok) { res.status(403).json({ error: { message: origin.reason || '허용되지 않은 요청입니다.' } }); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: { message: 'POST만 허용됩니다.' } }); return; }

  if (!process.env.DATABASE_URL) {
    res.status(500).json({ error: { message: '서버에 DATABASE_URL이 설정되지 않았습니다.' } });
    return;
  }

  // 2) 기기 식별
  const id = deviceId(req);
  if (!id) { res.status(400).json({ error: { message: 'x-device-id 헤더가 없거나 형식이 올바르지 않습니다.' } }); return; }

  // 3) 레이트리밋(기기 기준 우선, 없으면 IP)
  const rl = await checkRate(id || clientIp(req), { prefix: 'data', max: DATA_MAX, windowSec: 60 });
  if (!rl.ok) {
    res.setHeader('Retry-After', String(rl.retryAfter || 30));
    res.status(429).json({ error: { message: `요청이 너무 잦습니다. ${rl.retryAfter || 30}초 뒤 다시 시도해주세요.` } });
    return;
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  } catch {
    res.status(400).json({ error: { message: '요청 본문이 올바른 JSON이 아닙니다.' } });
    return;
  }

  const { action } = body;
  try {
    let result;
    switch (action) {
      case 'load':
        await ensureDevice(id);
        result = await getState(id);
        break;
      case 'saveProfile':
        if (!body.profile) return bad(res, 'profile이 필요합니다.');
        await upsertProfile(id, body.profile);
        result = { ok: true };
        break;
      case 'addSession':
        if (!body.session || !body.session.situationId) return bad(res, 'session.situationId가 필요합니다.');
        result = await addSession(id, body.session);
        break;
      case 'addAsset':
        if (!body.asset || !body.asset.text) return bad(res, 'asset.text가 필요합니다.');
        result = await addAsset(id, body.asset);
        break;
      case 'addSituation':
        if (!body.situation || !body.situation.title) return bad(res, 'situation.title이 필요합니다.');
        result = await addSituation(id, body.situation);
        break;
      case 'removeSituation':
        if (!body.id) return bad(res, 'id가 필요합니다.');
        await removeSituation(id, body.id);
        result = { ok: true };
        break;
      // 프로토타입 브리지(전체 blob)
      case 'loadBlob':
        result = { state: await getBlob(id) };
        break;
      case 'saveBlob':
        if (!body.state || typeof body.state !== 'object') return bad(res, 'state 객체가 필요합니다.');
        if (JSON.stringify(body.state).length > BLOB_MAX_BYTES) return bad(res, '저장 데이터가 너무 큽니다.');
        await saveBlob(id, body.state);
        result = { ok: true };
        break;
      default:
        return bad(res, `알 수 없는 action: ${action}`);
    }
    res.status(200);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.send(JSON.stringify(result));
  } catch (e) {
    res.status(500).json({ error: { message: `DB 오류: ${(e && e.message) || e}` } });
  }
}

function bad(res, message) { res.status(400).json({ error: { message } }); }
