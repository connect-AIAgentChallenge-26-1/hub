// 결(結) — 데이터 접근 계층 (모든 SQL을 여기 모은다)
//
// scoreDraft 결과의 축 키(context_intent/relation_formality/strategy_expression)를
// DB 컬럼(context/register/strategy)으로 매핑한다.

import { db } from './client.mjs';

const md = ts => { const d = new Date(ts); return `${d.getMonth() + 1}.${d.getDate()}`; };

// 기기 레코드 보장(세션·자산·상황이 profiles를 FK로 참조하므로 쓰기 전 호출).
export async function ensureDevice(id) {
  const sql = db();
  await sql`insert into profiles (device_id) values (${id}) on conflict (device_id) do nothing`;
}

// 이 기기의 전체 상태를 localStorage 시절과 같은 형태로 반환.
export async function getState(id) {
  const sql = db();
  const [profile] = await sql`select role, goal from profiles where device_id = ${id}`;
  const sessions = await sql`
    select id, situation_id, context, register, strategy, total, created_at
    from sessions where device_id = ${id} order by created_at`;
  const assets = await sql`
    select id, text, situation_id, created_at
    from assets where device_id = ${id} order by created_at`;
  const customSits = await sql`
    select id, title, rel, counterpart, goal, tension, direction, axis, sample, opener, rubric, created_at
    from custom_situations where device_id = ${id} order by created_at`;

  return {
    profile: profile ? { role: profile.role, goal: profile.goal } : null,
    history: sessions.map(s => ({
      id: String(s.id), sid: s.situation_id, d: md(s.created_at),
      scores: { context: s.context, register: s.register, strategy: s.strategy },
      total: s.total,
    })),
    assets: assets.map(a => ({ id: String(a.id), text: a.text, sid: a.situation_id, d: md(a.created_at) })),
    customSits: customSits.map(c => ({
      id: c.id, title: c.title, rel: c.rel, counterpart: c.counterpart, goal: c.goal,
      tension: c.tension, direction: c.direction, axis: c.axis, sample: c.sample,
      opener: c.opener, rubric: c.rubric, roles: [],
    })),
  };
}

export async function upsertProfile(id, { role, goal }) {
  const sql = db();
  await sql`
    insert into profiles (device_id, role, goal, updated_at)
    values (${id}, ${role ?? null}, ${goal ?? null}, now())
    on conflict (device_id) do update set role = excluded.role, goal = excluded.goal, updated_at = now()`;
}

// scores: scoreDraft 결과의 scores 객체(context_intent/relation_formality/strategy_expression)
export async function addSession(id, { situationId, scores = {}, total }) {
  const sql = db();
  await ensureDevice(id);
  const [row] = await sql`
    insert into sessions (device_id, situation_id, context, register, strategy, total)
    values (${id}, ${situationId},
            ${scores.context_intent ?? scores.context ?? null},
            ${scores.relation_formality ?? scores.register ?? null},
            ${scores.strategy_expression ?? scores.strategy ?? null},
            ${total ?? null})
    returning id, created_at`;
  return { id: String(row.id), d: md(row.created_at) };
}

export async function addAsset(id, { text, situationId }) {
  const sql = db();
  await ensureDevice(id);
  const [row] = await sql`
    insert into assets (device_id, text, situation_id)
    values (${id}, ${text}, ${situationId ?? null})
    returning id, created_at`;
  return { id: String(row.id), d: md(row.created_at) };
}

export async function addSituation(id, s = {}) {
  const sql = db();
  await ensureDevice(id);
  const sitId = s.id || ('c' + Date.now());
  await sql`
    insert into custom_situations
      (id, device_id, title, rel, counterpart, goal, tension, direction, axis, sample, opener, rubric)
    values (${sitId}, ${id}, ${s.title}, ${s.rel ?? null}, ${s.counterpart ?? null}, ${s.goal ?? null},
            ${s.tension ?? null}, ${s.direction ?? null}, ${s.axis ?? null}, ${s.sample ?? null},
            ${s.opener ?? null}, ${s.rubric ? sql.json(s.rubric) : null})
    on conflict (id) do nothing`;
  return { id: sitId };
}

export async function removeSituation(id, sitId) {
  const sql = db();
  await sql`delete from custom_situations where id = ${sitId} and device_id = ${id}`;
}

// ── 프로토타입 브리지: 전체 상태 blob 저장/조회 ────────────────────────────────
export async function saveBlob(id, data) {
  const sql = db();
  await sql`
    insert into app_state (device_id, data, updated_at)
    values (${id}, ${sql.json(data)}, now())
    on conflict (device_id) do update set data = excluded.data, updated_at = now()`;
}

export async function getBlob(id) {
  const sql = db();
  const [row] = await sql`select data from app_state where device_id = ${id}`;
  return row ? row.data : null;
}
