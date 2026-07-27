'use strict';

const DEFAULT_HISTORY_LIMIT = 12;

function createStoreError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizeSupabaseUrl(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw createStoreError(503, 'SUPABASE_URL이 설정되지 않았습니다.');
  }

  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw createStoreError(503, 'SUPABASE_URL 형식이 올바르지 않습니다.');
  }
  if (parsed.protocol !== 'https:' && parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost') {
    throw createStoreError(503, 'Supabase 연결은 HTTPS 주소를 사용해야 합니다.');
  }
  return parsed.origin;
}

function validateSecretKey(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw createStoreError(503, 'SUPABASE_SECRET_KEY가 설정되지 않았습니다.');
  }
  return value.trim();
}

function buildHeaders(secretKey, extra = {}) {
  const headers = {
    apikey: secretKey,
    'Content-Type': 'application/json',
    ...extra
  };

  // Legacy service_role keys are JWTs. New sb_secret_ keys use the apikey header.
  if (!secretKey.startsWith('sb_secret_')) {
    headers.Authorization = `Bearer ${secretKey}`;
  }
  return headers;
}

async function readResponseBody(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function getErrorMessage(body, fallback) {
  if (body && typeof body === 'object') {
    return body.message || body.details || body.hint || fallback;
  }
  return typeof body === 'string' && body ? body : fallback;
}

function createSupabaseStore(options = {}) {
  const supabaseUrl = normalizeSupabaseUrl(options.supabaseUrl);
  const secretKey = validateSecretKey(options.secretKey);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('Node.js의 fetch를 사용할 수 없습니다. Node 24 이상이 필요합니다.');
  }

  const tableUrl = `${supabaseUrl}/rest/v1/assistant_messages`;
  const stateTableUrl = `${supabaseUrl}/rest/v1/planner_states`;

  async function getHistory(sessionId, limit = DEFAULT_HISTORY_LIMIT) {
    const safeLimit = Math.max(1, Math.min(Number.parseInt(limit, 10) || DEFAULT_HISTORY_LIMIT, 100));
    const requestUrl = new URL(tableUrl);
    requestUrl.searchParams.set('session_id', `eq.${sessionId}`);
    requestUrl.searchParams.set('select', 'id,role,content,created_at');
    requestUrl.searchParams.set('order', 'id.desc');
    requestUrl.searchParams.set('limit', String(safeLimit));

    const response = await fetchImpl(requestUrl, {
      method: 'GET',
      headers: buildHeaders(secretKey, { Accept: 'application/json' })
    });
    const body = await readResponseBody(response);
    if (!response.ok) {
      throw createStoreError(502, getErrorMessage(body, `Supabase 조회 실패 (${response.status})`));
    }
    if (!Array.isArray(body)) {
      throw createStoreError(502, 'Supabase 조회 응답 형식이 올바르지 않습니다.');
    }

    return body.reverse().map((row) => ({
      id: row.id,
      role: row.role,
      content: row.content,
      createdAt: row.created_at
    }));
  }

  async function saveExchange(sessionId, payload, coachOutput) {
    const rows = [
      {
        session_id: sessionId,
        role: 'user',
        content: payload.message,
        payload_json: payload
      },
      {
        session_id: sessionId,
        role: 'assistant',
        content: coachOutput.reply,
        payload_json: coachOutput
      }
    ];

    const response = await fetchImpl(tableUrl, {
      method: 'POST',
      headers: buildHeaders(secretKey, { Prefer: 'return=minimal' }),
      body: JSON.stringify(rows)
    });
    const body = await readResponseBody(response);
    if (!response.ok) {
      throw createStoreError(502, getErrorMessage(body, `Supabase 저장 실패 (${response.status})`));
    }
  }

  async function getPlannerState(sessionId) {
    const requestUrl = new URL(stateTableUrl);
    requestUrl.searchParams.set('session_id', `eq.${sessionId}`);
    requestUrl.searchParams.set('select', 'state_json,updated_at');
    requestUrl.searchParams.set('limit', '1');
    const response = await fetchImpl(requestUrl, {
      method: 'GET',
      headers: buildHeaders(secretKey, { Accept: 'application/json' })
    });
    const body = await readResponseBody(response);
    if (!response.ok) {
      throw createStoreError(502, getErrorMessage(body, `Supabase 상태 조회 실패 (${response.status})`));
    }
    if (!Array.isArray(body) || !body.length) return null;
    return { state: body[0].state_json, updatedAt: body[0].updated_at };
  }

  async function savePlannerState(sessionId, state) {
    const updatedAt = new Date().toISOString();
    const requestUrl = new URL(stateTableUrl);
    requestUrl.searchParams.set('on_conflict', 'session_id');
    const response = await fetchImpl(requestUrl, {
      method: 'POST',
      headers: buildHeaders(secretKey, { Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify([{ session_id: sessionId, state_json: state, updated_at: updatedAt }])
    });
    const body = await readResponseBody(response);
    if (!response.ok) {
      throw createStoreError(502, getErrorMessage(body, `Supabase 상태 저장 실패 (${response.status})`));
    }
    return { updatedAt };
  }

  async function clearSession(sessionId) {
    for (const baseUrl of [tableUrl, stateTableUrl]) {
      const requestUrl = new URL(baseUrl);
      requestUrl.searchParams.set('session_id', `eq.${sessionId}`);
      const response = await fetchImpl(requestUrl, {
        method: 'DELETE',
        headers: buildHeaders(secretKey, { Prefer: 'return=minimal' })
      });
      const body = await readResponseBody(response);
      if (!response.ok) {
        throw createStoreError(502, getErrorMessage(body, `Supabase 기록 삭제 실패 (${response.status})`));
      }
    }
  }

  return {
    getHistory,
    saveExchange,
    getPlannerState,
    savePlannerState,
    clearSession,
    close: () => {}
  };
}

module.exports = {
  buildHeaders,
  createSupabaseStore,
  normalizeSupabaseUrl
};
