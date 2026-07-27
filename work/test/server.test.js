'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createApp } = require('../server');

function coachOutput(reply, considerCondition = false) {
  return {
    reply,
    conditionSuggestion: considerCondition
      ? {
          enabled: true,
          energyLevel: 'low',
          fatigueLevel: 'high',
          estimatedMinutes: 95,
          summary: '현재 컨디션을 고려한 피로도 분석입니다.',
          actions: ['가벼운 작업부터 시작하세요.']
        }
      : {
          enabled: false,
          energyLevel: '',
          fatigueLevel: '',
          estimatedMinutes: 0,
          summary: '',
          actions: []
        },
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
    recommendations: [
      {
        type: 'none',
        title: '집중 추천',
        message: '가장 짧은 미완료 작업부터 시작하세요.',
        metrics: '집중 시간 25분',
        taskText: '',
        items: [],
        toDay: 'mon'
      }
    ]
  };
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

test('AI 요청은 OpenAI JSON 스키마를 사용하고 SQLite에 저장·조회한다', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'planner-backend-'));
  const mockRequests = [];
  const app = createApp({
    dbPath: path.join(tempDir, 'planner.sqlite'),
    openAiApiKey: 'test-key',
    fetchImpl: async (url, options) => {
      if (url === 'https://api.openai.com/v1/audio/transcriptions') {
        assert.equal(options.body.get('model'), 'gpt-4o-mini-transcribe');
        assert.equal(options.body.get('language'), 'ko');
        return new Response(JSON.stringify({
          text: '내일 오전 9시 임원 회의를 먼저 배치해 줘'
        }), { status: 200 });
      }
      const request = JSON.parse(options.body);
      mockRequests.push(request);
      if (request.text?.format?.name === 'planner_upload_parse') {
        return new Response(JSON.stringify({
          output_text: JSON.stringify({
            summary: '시험범위와 마감일을 확인했습니다.',
            tasks: [{ text: '시험범위 1장 복습', details: ['핵심 개념 표시'], urgency: 4, durationMinutes: 25 }]
          })
        }), { status: 200 });
      }
      const coachInput = JSON.parse(request.input[1].content);
      return new Response(JSON.stringify({
        output_text: JSON.stringify(coachOutput(
          `코칭 ${mockRequests.length}`,
          Boolean(coachInput.plannerPayload.considerCondition)
        ))
      }), { status: 200 });
    }
  });
  const baseUrl = await listen(app.server);

  t.after(async () => {
    await new Promise((resolve) => app.server.close(resolve));
    app.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const frontendResponse = await fetch(`${baseUrl}/`);
  const frontendHtml = await frontendResponse.text();
  assert.equal(frontendResponse.status, 200);
  assert.match(frontendHtml, /<title>갓생러 플래너<\/title>/);

  const health = await (await fetch(`${baseUrl}/api/health`)).json();
  assert.equal(health.aiConfigured, true);
  assert.deepEqual(health.capabilities, ['text', 'image', 'document', 'voice', 'personalized-briefing']);

  const coreResponse = await fetch(`${baseUrl}/planner-core.js`);
  const coreScript = await coreResponse.text();
  assert.equal(coreResponse.status, 200);
  assert.match(coreResponse.headers.get('content-type'), /text\/javascript/);
  assert.match(coreScript, /computeCompletionPercent/);

  const payload = {
    message: '오늘 과제와 발표 준비를 어떻게 배치할까?',
    currentDay: 'mon',
    mode: 'student',
    energy: 'normal',
    plans: { mon: { tasks: [{ text: '과제 초안', done: false, details: [] }] } }
  };
  const firstResponse = await fetch(`${baseUrl}/api/gemini-manage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const firstResult = await firstResponse.json();

  assert.equal(firstResponse.status, 200, firstResult.error);
  const cookie = firstResponse.headers.getSetCookie()[0].split(';')[0];
  assert.equal(firstResult.success, true);
  assert.equal(firstResult.reply, '코칭 1');
  assert.equal(firstResult.conditionSuggestion.enabled, false);
  assert.equal(mockRequests[0].text.format.type, 'json_schema');
  assert.equal(mockRequests[0].text.format.strict, true);
  assert.equal(mockRequests[0].text.format.name, 'planner_coach_response');
  assert.match(mockRequests[0].input[0].content, /너는 일정 관리 코치다/);

  const historyResponse = await fetch(`${baseUrl}/api/assistant/history`, { headers: { Cookie: cookie } });
  const history = await historyResponse.json();
  assert.equal(history.success, true);
  assert.deepEqual(history.messages.map((message) => message.role), ['user', 'assistant']);
  assert.deepEqual(history.messages.map((message) => message.content), [payload.message, '코칭 1']);

  const stateResponse = await fetch(`${baseUrl}/api/assistant/state`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ state: { currentDay: 'mon', plans: payload.plans, token: 'sk-super-secret-value-12345' } })
  });
  assert.equal(stateResponse.status, 200);
  const storedStateResponse = await fetch(`${baseUrl}/api/assistant/state`, { headers: { Cookie: cookie } });
  const storedState = await storedStateResponse.json();
  assert.equal(storedState.state.currentDay, 'mon');
  assert.equal(storedState.state.token, '[보안정보 저장 안 함]');

  const uploadForm = new FormData();
  uploadForm.append('file', new Blob(['시험 범위 1장'], { type: 'text/plain' }), 'range.txt');
  uploadForm.append('mode', 'student');
  uploadForm.append('currentDay', 'mon');
  uploadForm.append('message', '오늘 계획으로 정리해줘');
  const uploadResponse = await fetch(`${baseUrl}/api/assistant/upload-parse`, {
    method: 'POST',
    headers: { Cookie: cookie },
    body: uploadForm
  });
  const uploadResult = await uploadResponse.json();
  assert.equal(uploadResponse.status, 200, uploadResult.error);
  assert.equal(uploadResult.tasks[0].text, '시험범위 1장 복습');

  const imageForm = new FormData();
  imageForm.append('file', new Blob(['fake-png-bytes'], { type: 'image/png' }), 'schedule.png');
  imageForm.append('mode', 'worker');
  imageForm.append('currentDay', 'mon');
  imageForm.append('message', '사진 안의 일정 중 무엇부터 해야 할지 정렬해줘');
  const imageResponse = await fetch(`${baseUrl}/api/assistant/upload-parse`, {
    method: 'POST',
    headers: { Cookie: cookie },
    body: imageForm
  });
  const imageResult = await imageResponse.json();
  assert.equal(imageResponse.status, 200, imageResult.error);
  const visionRequest = mockRequests.find((request) =>
    request.text?.format?.name === 'planner_upload_parse'
    && request.input?.[0]?.content?.some((item) => item.type === 'input_image')
  );
  const imageInput = visionRequest.input[0].content.find((item) => item.type === 'input_image');
  assert.equal(imageInput.detail, 'original');
  assert.match(visionRequest.input[0].content[0].text, /사용자의 지시가 최우선/);
  assert.match(visionRequest.input[0].content[0].text, /파일에 없는 일정이나 작업을 추측해 만들지 마세요/);

  const voiceForm = new FormData();
  voiceForm.append('file', new Blob(['voice-bytes'], { type: 'audio/webm' }), 'voice.webm');
  const voiceResponse = await fetch(`${baseUrl}/api/assistant/transcribe`, {
    method: 'POST',
    headers: { Cookie: cookie },
    body: voiceForm
  });
  const voiceResult = await voiceResponse.json();
  assert.equal(voiceResponse.status, 200, voiceResult.error);
  assert.equal(voiceResult.transcript, '내일 오전 9시 임원 회의를 먼저 배치해 줘');

  const reorderResponse = await fetch(`${baseUrl}/api/assistant/auto-reorder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      currentDay: 'mon',
      plans: {
        mon: {
          tasks: [
            { text: '메일 정리', done: false, urgency: 1, durationMinutes: 15, details: [] },
            { text: '이전 이미지 요청 문장', done: false, urgency: 5, durationMinutes: 15, details: [], source: 'upload' }
          ]
        }
      },
      uploadedTasks: [{ text: '시험범위 1장 복습', done: false, urgency: 4, durationMinutes: 25, details: [], source: 'upload' }]
    })
  });
  const reorderResult = await reorderResponse.json();
  assert.equal(reorderResponse.status, 200);
  assert.equal(reorderResult.reorderedTasks[0].text, '시험범위 1장 복습');
  assert.equal(reorderResult.reorderedTasks.some((task) => task.text === '이전 이미지 요청 문장'), false);

  const secondResponse = await fetch(`${baseUrl}/api/gemini-manage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ ...payload, message: '그 순서로 진행할게.' })
  });
  assert.equal(secondResponse.status, 200);
  const coachRequests = mockRequests.filter((request) => request.text?.format?.name === 'planner_coach_response');
  const secondInput = JSON.parse(coachRequests[1].input[1].content);
  assert.equal(secondInput.recentConversation.length, 2);
  assert.equal(secondInput.recentConversation[1].content, '코칭 1');

  const attachmentResponse = await fetch(`${baseUrl}/api/gemini-manage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      ...payload,
      message: '현재 첨부 요청\n\n[첨부 파일 분석 결과 - 최우선 근거]\n1. 09:00 임원 회의',
      displayMessage: '현재 첨부 요청',
      requestContext: {
        hasAttachment: true,
        uploadedTaskTexts: ['09:00 임원 회의']
      },
      plans: {
        mon: {
          tasks: [{ text: '09:00 임원 회의', done: false, source: 'upload', details: [] }]
        }
      }
    })
  });
  assert.equal(attachmentResponse.status, 200);
  const attachmentCoachRequests = mockRequests.filter((request) => request.text?.format?.name === 'planner_coach_response');
  const attachmentInput = JSON.parse(attachmentCoachRequests.at(-1).input[1].content);
  assert.deepEqual(attachmentInput.recentConversation, []);
  const attachmentHistory = await (await fetch(`${baseUrl}/api/assistant/history`, { headers: { Cookie: cookie } })).json();
  assert.equal(attachmentHistory.messages.at(-2).content, '현재 첨부 요청');

  const conditionResponse = await fetch(`${baseUrl}/api/gemini-manage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      ...payload,
      message: '오늘 업무 순서를 정리해줘',
      considerCondition: true,
      energy: 'low'
    })
  });
  const conditionResult = await conditionResponse.json();
  assert.equal(conditionResponse.status, 200, conditionResult.error);
  assert.equal(conditionResult.conditionSuggestion.enabled, true);
  assert.equal(conditionResult.conditionSuggestion.fatigueLevel, 'high');
  const conditionCoachRequest = mockRequests.filter((request) => request.text?.format?.name === 'planner_coach_response').at(-1);
  const conditionInput = JSON.parse(conditionCoachRequest.input[1].content);
  assert.equal(conditionInput.plannerPayload.considerCondition, true);
  assert.equal(conditionInput.plannerPayload.energy, 'low');

  const tooLargeResponse = await fetch(`${baseUrl}/api/gemini-manage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'x'.repeat(1_000_001), currentDay: 'mon' })
  });
  const tooLargeResult = await tooLargeResponse.json();
  assert.equal(tooLargeResponse.status, 413);
  assert.equal(tooLargeResult.success, false);

  const clearResponse = await fetch(`${baseUrl}/api/assistant/data`, { method: 'DELETE', headers: { Cookie: cookie } });
  assert.equal(clearResponse.status, 200);
  const clearedHistory = await (await fetch(`${baseUrl}/api/assistant/history`, { headers: { Cookie: cookie } })).json();
  const clearedState = await (await fetch(`${baseUrl}/api/assistant/state`, { headers: { Cookie: cookie } })).json();
  assert.deepEqual(clearedHistory.messages, []);
  assert.equal(clearedState.state, null);
});

test('맞춤 정보 브리핑은 웹 검색 결과가 달라질 때만 저장 내용을 교체한다', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'planner-personal-briefing-'));
  let version = 1;
  let requestCount = 0;
  const app = createApp({
    dbPath: path.join(tempDir, 'planner.sqlite'),
    openAiApiKey: 'test-key',
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://api.openai.com/v1/responses');
      const request = JSON.parse(options.body);
      requestCount += 1;
      assert.deepEqual(request.tools, [{
        type: 'web_search',
        filters: { allowed_domains: ['news.naver.com'] }
      }]);
      assert.equal(request.tool_choice, 'required');
      assert.deepEqual(request.include, ['web_search_call.action.sources']);
      assert.equal(request.text.format.name, 'personalized_executive_briefing');
      const profile = JSON.parse(request.input[1].content);
      assert.equal(profile.ageGroup, '30대');
      assert.equal(profile.occupation, '개발·IT 직군');
      assert.deepEqual(profile.interests, ['AI', '반도체']);
      return new Response(JSON.stringify({
        output_text: JSON.stringify({
          headline: version === 1 ? '개발자를 위한 오늘의 변화' : '새롭게 확인된 개발 생산성 변화',
          summary: '오늘의 업무 판단에 필요한 핵심 정보입니다.',
          items: [1, 2, 3].map((index) => ({
            title: `기사 ${version}-${index}`,
            summary: `핵심 내용 ${index}`,
            sourceName: '공식 기술 블로그',
            sourceUrl: `https://n.news.naver.com/mnews/article/001/${version}${index}`,
            publishedAt: '2026-07-24',
            relevance: '개발 업무의 우선순위를 정하는 데 도움이 됩니다.'
          }))
        })
      }), { status: 200 });
    }
  });
  const baseUrl = await listen(app.server);

  t.after(async () => {
    await new Promise((resolve) => app.server.close(resolve));
    app.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const profile = { ageGroup: '30대', occupation: '개발·IT 직군', interests: ['AI', '반도체'] };
  const firstResponse = await fetch(`${baseUrl}/api/briefing/personalized`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile)
  });
  const firstResult = await firstResponse.json();
  const cookie = firstResponse.headers.getSetCookie()[0].split(';')[0];
  assert.equal(firstResponse.status, 200, firstResult.error);
  assert.equal(firstResult.updated, true);
  assert.equal(firstResult.feed.items.length, 3);
  assert.equal(requestCount, 1);

  const cachedResult = await (await fetch(`${baseUrl}/api/briefing/personalized`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(profile)
  })).json();
  assert.equal(cachedResult.updated, false);
  assert.equal(cachedResult.cached, true);
  assert.equal(requestCount, 1);

  const sameResult = await (await fetch(`${baseUrl}/api/briefing/personalized`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ ...profile, force: true })
  })).json();
  assert.equal(sameResult.updated, false);
  assert.equal(sameResult.feed.items[0].title, '기사 1-1');
  assert.equal(requestCount, 2);

  version = 2;
  const updatedResult = await (await fetch(`${baseUrl}/api/briefing/personalized`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ ...profile, force: true })
  })).json();
  assert.equal(updatedResult.updated, true);
  assert.equal(updatedResult.feed.items[0].title, '기사 2-1');
  assert.equal(requestCount, 3);
});

test('네이버 뉴스 AI 연결 실패 시 관심 분야별 네이버 섹션으로 대체한다', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'planner-naver-fallback-'));
  const app = createApp({
    dbPath: path.join(tempDir, 'planner.sqlite'),
    openAiApiKey: 'test-key',
    fetchImpl: async () => {
      throw new Error('fetch failed');
    }
  });
  const baseUrl = await listen(app.server);

  t.after(async () => {
    await new Promise((resolve) => app.server.close(resolve));
    app.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const response = await fetch(`${baseUrl}/api/briefing/personalized`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ageGroup: '20대',
      occupation: '금융·회계 직군',
      interests: ['재테크', '부동산']
    })
  });
  const result = await response.json();

  assert.equal(response.status, 200, result.error);
  assert.equal(result.success, true);
  assert.equal(result.fallback, true);
  assert.equal(result.feed.items.length, 3);
  assert.ok(result.feed.items.every((item) => new URL(item.sourceUrl).hostname === 'news.naver.com'));
  assert.match(result.feed.items[0].title, /경제/);
  assert.doesNotMatch(JSON.stringify(result), /fetch failed/);
});

test('3001 화면은 최신 맞춤 브리핑 API에 안전하게 교차 연결된다', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'planner-briefing-cors-'));
  const app = createApp({
    dbPath: path.join(tempDir, 'planner.sqlite'),
    openAiApiKey: 'test-key',
    fetchImpl: async () => {
      throw new Error('fetch failed');
    }
  });
  const baseUrl = await listen(app.server);

  t.after(async () => {
    await new Promise((resolve) => app.server.close(resolve));
    app.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const response = await fetch(`${baseUrl}/api/briefing/personalized`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'http://127.0.0.1:3001',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type'
    }
  });

  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://127.0.0.1:3001');
  assert.match(response.headers.get('access-control-allow-methods') || '', /POST/);
  assert.match(response.headers.get('access-control-allow-headers') || '', /Content-Type/i);
});

test('Google OAuth 팝업 로그인은 공식 인증 리디렉션과 서버 세션을 만든다', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'planner-auth-'));
  const oauthRequests = [];
  const app = createApp({
    dbPath: path.join(tempDir, 'planner.sqlite'),
    openAiApiKey: 'test-key',
    googleClientId: 'google-client-id',
    googleClientSecret: 'google-client-secret',
    kakaoClientId: 'kakao-rest-api-key',
    kakaoClientSecret: '',
    fetchImpl: async (url, options = {}) => {
      oauthRequests.push({ url, options });
      if (url === 'https://oauth2.googleapis.com/token') {
        assert.equal(options.method, 'POST');
        assert.equal(options.body.get('client_id'), 'google-client-id');
        assert.equal(options.body.get('client_secret'), 'google-client-secret');
        return new Response(JSON.stringify({ access_token: 'google-access-token' }), { status: 200 });
      }
      if (url === 'https://openidconnect.googleapis.com/v1/userinfo') {
        assert.equal(options.headers.Authorization, 'Bearer google-access-token');
        return new Response(JSON.stringify({
          sub: 'google-user-123',
          email: 'planner@example.com',
          name: '플래너 사용자',
          picture: 'https://example.com/avatar.png'
        }), { status: 200 });
      }
      throw new Error(`예상하지 못한 OAuth 요청: ${url}`);
    }
  });
  const baseUrl = await listen(app.server);

  t.after(async () => {
    await new Promise((resolve) => app.server.close(resolve));
    app.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const configResponse = await fetch(`${baseUrl}/api/auth/config`);
  const authConfig = await configResponse.json();
  assert.deepEqual(authConfig.providers, { google: true, kakao: true });

  const kakaoStartResponse = await fetch(`${baseUrl}/api/auth/start?provider=kakao`, { redirect: 'manual' });
  assert.equal(kakaoStartResponse.status, 302);
  const kakaoAuthorizationUrl = new URL(kakaoStartResponse.headers.get('location'));
  assert.equal(kakaoAuthorizationUrl.origin, 'https://kauth.kakao.com');
  assert.equal(kakaoAuthorizationUrl.searchParams.get('client_id'), 'kakao-rest-api-key');
  assert.equal(kakaoAuthorizationUrl.searchParams.get('scope'), 'profile_nickname,profile_image,account_email');

  const startResponse = await fetch(`${baseUrl}/api/auth/start?provider=google`, { redirect: 'manual' });
  assert.equal(startResponse.status, 302);
  const authorizationUrl = new URL(startResponse.headers.get('location'));
  assert.equal(authorizationUrl.origin, 'https://accounts.google.com');
  assert.equal(authorizationUrl.searchParams.get('client_id'), 'google-client-id');
  assert.equal(authorizationUrl.searchParams.get('prompt'), 'select_account');
  const state = authorizationUrl.searchParams.get('state');
  assert.ok(state);

  const callbackResponse = await fetch(
    `${baseUrl}/api/auth/callback/google?code=authorization-code&state=${encodeURIComponent(state)}`,
    { redirect: 'manual' }
  );
  const callbackHtml = await callbackResponse.text();
  assert.equal(callbackResponse.status, 200);
  assert.match(callbackHtml, /planner-auth-success/);
  const authCookie = callbackResponse.headers.getSetCookie()[0].split(';')[0];
  assert.match(authCookie, /^planner_auth=/);

  const sessionResponse = await fetch(`${baseUrl}/api/auth/session`, {
    headers: { Cookie: authCookie }
  });
  const session = await sessionResponse.json();
  assert.equal(session.authenticated, true);
  assert.deepEqual(session.user, {
    id: session.user.id,
    provider: 'google',
    email: 'planner@example.com',
    name: '플래너 사용자',
    avatarUrl: 'https://example.com/avatar.png'
  });

  const logoutResponse = await fetch(`${baseUrl}/api/auth/logout`, {
    method: 'POST',
    headers: { Cookie: authCookie }
  });
  assert.equal(logoutResponse.status, 200);
  assert.match(logoutResponse.headers.getSetCookie()[0], /Max-Age=0/);

  const signedOut = await (await fetch(`${baseUrl}/api/auth/session`, {
    headers: { Cookie: authCookie }
  })).json();
  assert.equal(signedOut.authenticated, false);
  assert.equal(oauthRequests.length, 2);
});

test('OAuth 인증 서버 연결이 차단되면 실행 방법을 안내한다', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'planner-auth-network-'));
  const app = createApp({
    dbPath: path.join(tempDir, 'planner.sqlite'),
    googleClientId: 'google-client-id',
    googleClientSecret: 'google-client-secret',
    fetchImpl: async () => {
      const error = new Error('fetch failed');
      error.cause = { code: 'EACCES' };
      throw error;
    }
  });
  const baseUrl = await listen(app.server);

  t.after(async () => {
    await new Promise((resolve) => app.server.close(resolve));
    app.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const startResponse = await fetch(`${baseUrl}/api/auth/start?provider=google`, {
    redirect: 'manual'
  });
  const authorizationUrl = new URL(startResponse.headers.get('location'));
  const state = authorizationUrl.searchParams.get('state');

  const callbackResponse = await fetch(
    `${baseUrl}/api/auth/callback/google?code=authorization-code&state=${encodeURIComponent(state)}`,
    { redirect: 'manual' }
  );
  const callbackHtml = await callbackResponse.text();

  assert.equal(callbackResponse.status, 503);
  assert.match(callbackHtml, /planner-auth-error/);
  assert.match(callbackHtml, /현재 실행 환경에서 차단/);
  assert.match(callbackHtml, /갓생러 플래너 서버 실행\.cmd/);
});

test('외부 AI가 일시적으로 실패해도 서버가 최신 요청 의도에 맞는 결과를 반환한다', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'planner-fallback-'));
  const app = createApp({
    dbPath: path.join(tempDir, 'planner.sqlite'),
    openAiApiKey: 'test-key',
    fetchImpl: async () => {
      throw new Error('network unavailable');
    }
  });
  const baseUrl = await listen(app.server);

  t.after(async () => {
    await new Promise((resolve) => app.server.close(resolve));
    app.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const response = await fetch(`${baseUrl}/api/assistant/manage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: '기업 임원 스케줄표를 회의와 결재 중심으로 정렬해줘',
      currentDay: 'mon',
      mode: 'student',
      energy: 'normal',
      plans: {
        mon: {
          tasks: [
            { text: '월간 목표 3개', done: false, details: [] },
            { text: '09:00 경영회의', done: false, source: 'upload', details: [] }
          ]
        }
      }
    })
  });
  const result = await response.json();

  assert.equal(response.status, 200, result.error);
  assert.equal(result.engine, 'server-fallback');
  assert.equal(result.conditionSuggestion.enabled, false);
  assert.match(result.reply, /기업 임원 일정/);
  assert.match(result.recommendations[0].message, /고정 일정/);
  assert.doesNotMatch(result.reply, /월간 목표 3개/);

  const conditionResponse = await fetch(`${baseUrl}/api/assistant/manage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: '오늘 업무 순서를 정리해줘',
      currentDay: 'mon',
      mode: 'worker',
      considerCondition: true,
      energy: 'low',
      plans: {
        mon: {
          tasks: [
            { text: '보고서 검토', done: false, durationMinutes: 45, details: [] },
            { text: '메일 정리', done: false, durationMinutes: 20, details: [] }
          ]
        }
      }
    })
  });
  const conditionResult = await conditionResponse.json();
  assert.equal(conditionResponse.status, 200, conditionResult.error);
  assert.equal(conditionResult.conditionSuggestion.enabled, true);
  assert.equal(conditionResult.conditionSuggestion.energyLevel, 'low');
  assert.equal(conditionResult.conditionSuggestion.fatigueLevel, 'high');
  assert.equal(conditionResult.conditionSuggestion.estimatedMinutes, 65);
});

test('외부 이미지 분석이 실패하면 Windows OCR 결과를 일정 근거로 사용한다', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'planner-ocr-fallback-'));
  const app = createApp({
    dbPath: path.join(tempDir, 'planner.sqlite'),
    openAiApiKey: 'test-key',
    fetchImpl: async () => {
      throw new Error('network unavailable');
    },
    ocrExtractor: async () => [
      '09:00 경영회의',
      '11:00 결재 서류 검토',
      '14:00 고객 미팅',
      '16:30 주간 보고서 제출'
    ].join('\n')
  });
  const baseUrl = await listen(app.server);

  t.after(async () => {
    await new Promise((resolve) => app.server.close(resolve));
    app.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const form = new FormData();
  form.append('file', new Blob(['fake-png-bytes'], { type: 'image/png' }), '임원 일정표.png');
  form.append('mode', 'worker');
  form.append('currentDay', 'mon');
  form.append('message', '이거 뭐부터 하면 좋을지 정렬해줘');
  const response = await fetch(`${baseUrl}/api/assistant/upload-parse`, {
    method: 'POST',
    body: form
  });
  const result = await response.json();

  assert.equal(response.status, 200, result.error);
  assert.equal(result.engine, 'windows-ocr');
  assert.deepEqual(result.tasks.map((task) => task.text), [
    '09:00 경영회의',
    '11:00 결재 서류 검토',
    '14:00 고객 미팅',
    '16:30 주간 보고서 제출'
  ]);
  assert.match(result.summary, /직접 읽었습니다/);
  assert.match(result.summary, /임원 일정표\.png/);
  assert.match(result.extractedText, /14:00 고객 미팅/);
});
