'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createSupabaseApp } = require('../server');

function coachOutput(reply) {
  return {
    reply,
    retrospective: {
      summary: '오늘 계획을 실행 가능한 단위로 정리했습니다.',
      wins: ['우선순위를 확인했습니다.'],
      risks: [],
      coachComment: '첫 작업을 25분만 시작하세요.'
    },
    nextDaySuggestion: {
      day: 'tue',
      title: '다음 날 핵심 계획',
      tasks: ['과제 초안 30분'],
      note: '자동 반영되지 않는 제안입니다.'
    },
    planUpdates: [],
    taskUpdates: [],
    recommendations: [{
      type: 'none',
      title: '집중 추천',
      message: '가장 짧은 미완료 작업부터 시작하세요.',
      metrics: '집중 시간 25분',
      taskText: '',
      items: [],
      toDay: 'mon'
    }]
  };
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  return `http://127.0.0.1:${port}`;
}

test('FE 요청은 BE를 거쳐 Supabase에 저장되고 다시 조회된다', async (t) => {
  const rows = [];
  const plannerStates = new Map();
  const supabaseCalls = [];
  const fetchImpl = async (input, options = {}) => {
    const url = String(input);
    if (url.startsWith('https://test-project.supabase.co/rest/v1/assistant_messages')) {
      supabaseCalls.push({ url, options });
      if (options.method === 'DELETE') {
        const sessionId = new URL(url).searchParams.get('session_id').replace(/^eq\./, '');
        for (let index = rows.length - 1; index >= 0; index -= 1) {
          if (rows[index].session_id === sessionId) rows.splice(index, 1);
        }
        return new Response(null, { status: 204 });
      }
      if (options.method === 'POST') {
        const incoming = JSON.parse(options.body);
        for (const row of incoming) {
          rows.push({ ...row, id: rows.length + 1, created_at: new Date().toISOString() });
        }
        return new Response(null, { status: 201 });
      }

      const requestUrl = new URL(url);
      const sessionId = requestUrl.searchParams.get('session_id').replace(/^eq\./, '');
      const limit = Number(requestUrl.searchParams.get('limit'));
      const result = rows
        .filter((row) => row.session_id === sessionId)
        .sort((a, b) => b.id - a.id)
        .slice(0, limit)
        .map(({ id, role, content, created_at }) => ({ id, role, content, created_at }));
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (url.startsWith('https://test-project.supabase.co/rest/v1/planner_states')) {
      supabaseCalls.push({ url, options });
      const requestUrl = new URL(url);
      if (options.method === 'POST') {
        const [incoming] = JSON.parse(options.body);
        plannerStates.set(incoming.session_id, incoming);
        return new Response(null, { status: 201 });
      }
      const sessionId = requestUrl.searchParams.get('session_id').replace(/^eq\./, '');
      if (options.method === 'DELETE') {
        plannerStates.delete(sessionId);
        return new Response(null, { status: 204 });
      }
      const value = plannerStates.get(sessionId);
      return new Response(JSON.stringify(value ? [{ state_json: value.state_json, updated_at: value.updated_at }] : []), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (url === 'https://api.openai.com/v1/responses') {
      return new Response(JSON.stringify({ output_text: JSON.stringify(coachOutput('Supabase 저장 완료')) }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    throw new Error(`예상하지 못한 요청: ${url}`);
  };

  const app = createSupabaseApp({
    supabaseUrl: 'https://test-project.supabase.co',
    supabaseSecretKey: 'sb_secret_test',
    openAiApiKey: 'test-openai-key',
    fetchImpl
  });
  const baseUrl = await listen(app.server);

  t.after(async () => {
    await new Promise((resolve) => app.server.close(resolve));
    app.close();
  });

  const response = await fetch(`${baseUrl}/api/gemini-manage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: '오늘 일정 우선순위를 정리해줘.',
      currentDay: 'mon',
      mode: 'student',
      plans: { mon: { tasks: [{ text: '과제 초안', done: false }] } }
    })
  });
  const result = await response.json();
  const cookie = response.headers.getSetCookie()[0].split(';')[0];

  assert.equal(response.status, 200, result.error);
  assert.equal(result.success, true);
  assert.equal(result.reply, 'Supabase 저장 완료');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].payload_json.plans.mon.tasks[0].text, '과제 초안');
  assert.equal(supabaseCalls.at(-1).options.headers.apikey, 'sb_secret_test');
  assert.equal(supabaseCalls.at(-1).options.headers.Authorization, undefined);

  const historyResponse = await fetch(`${baseUrl}/api/assistant/history`, {
    headers: { Cookie: cookie }
  });
  const history = await historyResponse.json();
  assert.deepEqual(history.messages.map((message) => message.role), ['user', 'assistant']);
  assert.deepEqual(history.messages.map((message) => message.content), [
    '오늘 일정 우선순위를 정리해줘.',
    'Supabase 저장 완료'
  ]);

  const saveStateResponse = await fetch(`${baseUrl}/api/assistant/state`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ state: { currentDay: 'mon', plans: { mon: { tasks: [] } } } })
  });
  assert.equal(saveStateResponse.status, 200);
  const state = await (await fetch(`${baseUrl}/api/assistant/state`, { headers: { Cookie: cookie } })).json();
  assert.equal(state.state.currentDay, 'mon');

  const clearResponse = await fetch(`${baseUrl}/api/assistant/data`, { method: 'DELETE', headers: { Cookie: cookie } });
  assert.equal(clearResponse.status, 200);
  assert.equal(rows.length, 0);
  assert.equal(plannerStates.size, 0);
});
