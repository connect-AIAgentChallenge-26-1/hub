const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const { GoogleGenerativeAI } = require('@google/generative-ai');

dotenv.config();

const app = express();
app.use(express.json({ limit: '1mb' }));

const PORT = process.env.GEMINI_AUTOMANAGED_PORT || 3001;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AQ.Ab8RN6JIafTsbXswf_dM6Ec5bJ99wXTm-nqHmgXxAQx7QAnxHQ';

if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY가 설정되지 않았습니다.');
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

function toLocalTimeLabel(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
}

function getTodayRange() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return {
        timeMin: start.toISOString(),
        timeMax: end.toISOString()
    };
}

async function refreshGoogleAccessToken(refreshToken) {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID || '';
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET || '';

    if (!clientId || !clientSecret) {
        throw new Error('서버 환경변수 GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET 설정이 필요합니다.');
    }

    const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
    });

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: body.toString()
    });

    const tokenPayload = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenPayload.access_token) {
        const reason = tokenPayload.error_description || tokenPayload.error || `HTTP ${tokenResponse.status}`;
        throw new Error(`Google OAuth 토큰 갱신 실패: ${reason}`);
    }

    return tokenPayload.access_token;
}

async function fetchGoogleEventsByAccessToken({ calendarId, accessToken }) {
    const { timeMin, timeMax } = getTodayRange();
    const endpoint = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`;
    const response = await fetch(endpoint, {
        headers: {
            Authorization: `Bearer ${accessToken}`
        }
    });

    const payload = await response.json();
    if (!response.ok) {
        const reason = payload?.error?.message || `HTTP ${response.status}`;
        throw new Error(`Google Calendar OAuth 요청 실패: ${reason}`);
    }

    const items = Array.isArray(payload.items) ? payload.items : [];
    return items.map((event) => {
        const startRaw = event.start?.dateTime || event.start?.date;
        const endRaw = event.end?.dateTime || event.end?.date;
        const start = toLocalTimeLabel(startRaw);
        const end = toLocalTimeLabel(endRaw);
        if (!start || !end) return null;
        return `${start}-${end} ${event.summary || '회의'}`;
    }).filter(Boolean);
}

async function refreshOutlookAccessToken(refreshToken) {
    const clientId = process.env.OUTLOOK_OAUTH_CLIENT_ID || '';
    const clientSecret = process.env.OUTLOOK_OAUTH_CLIENT_SECRET || '';
    const tenantId = process.env.OUTLOOK_OAUTH_TENANT_ID || 'common';

    if (!clientId || !clientSecret) {
        throw new Error('서버 환경변수 OUTLOOK_OAUTH_CLIENT_ID / OUTLOOK_OAUTH_CLIENT_SECRET 설정이 필요합니다.');
    }

    const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
        scope: 'offline_access Calendars.Read'
    });

    const tokenEndpoint = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;
    const tokenResponse = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: body.toString()
    });

    const tokenPayload = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenPayload.access_token) {
        const reason = tokenPayload.error_description || tokenPayload.error || `HTTP ${tokenResponse.status}`;
        throw new Error(`Outlook OAuth 토큰 갱신 실패: ${reason}`);
    }

    return tokenPayload.access_token;
}

async function fetchOutlookEventsByAccessToken({ accessToken }) {
    const { timeMin, timeMax } = getTodayRange();
    const endpoint = `https://graph.microsoft.com/v1.0/me/calendarview?startDateTime=${encodeURIComponent(timeMin)}&endDateTime=${encodeURIComponent(timeMax)}&$orderby=start/dateTime`;
    const response = await fetch(endpoint, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Prefer: 'outlook.timezone="Asia/Seoul"'
        }
    });

    const payload = await response.json();
    if (!response.ok) {
        const reason = payload?.error?.message || `HTTP ${response.status}`;
        throw new Error(`Outlook Calendar OAuth 요청 실패: ${reason}`);
    }

    const events = Array.isArray(payload.value) ? payload.value : [];
    return events.map((event) => {
        const startText = event.start?.dateTime;
        const endText = event.end?.dateTime;
        const startLabel = startText ? toLocalTimeLabel(startText) : null;
        const endLabel = endText ? toLocalTimeLabel(endText) : null;
        if (!startLabel || !endLabel) return null;
        return `${startLabel}-${endLabel} ${event.subject || '회의'}`;
    }).filter(Boolean);
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'godsaeng_planner_gemini_automanaged.html'));
});

app.use(express.static(__dirname, { index: false }));

app.post('/api/calendar/google-oauth/events', async (req, res) => {
    try {
        const calendarId = String(req.body?.calendarId || '').trim();
        const refreshToken = String(req.body?.refreshToken || '').trim();

        if (!calendarId) {
            return res.status(400).json({ success: false, error: 'calendarId가 필요합니다.' });
        }
        if (!refreshToken) {
            return res.status(400).json({ success: false, error: 'Google Refresh Token이 필요합니다.' });
        }

        const accessToken = await refreshGoogleAccessToken(refreshToken);
        const lines = await fetchGoogleEventsByAccessToken({ calendarId, accessToken });

        return res.json({
            success: true,
            lines
        });
    } catch (error) {
        console.error('Google OAuth calendar sync error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/calendar/outlook-oauth/events', async (req, res) => {
    try {
        const refreshToken = String(req.body?.refreshToken || '').trim();
        if (!refreshToken) {
            return res.status(400).json({ success: false, error: 'Outlook Refresh Token이 필요합니다.' });
        }

        const accessToken = await refreshOutlookAccessToken(refreshToken);
        const lines = await fetchOutlookEventsByAccessToken({ accessToken });

        return res.json({
            success: true,
            lines,
            accessToken
        });
    } catch (error) {
        console.error('Outlook OAuth calendar sync error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

function safeJsonParse(text) {
    try {
        return JSON.parse(text);
    } catch (error) {
        const fenced = text.match(/```json\s*([\s\S]*?)```/i);
        if (fenced) {
            return JSON.parse(fenced[1]);
        }

        const firstBrace = text.indexOf('{');
        const lastBrace = text.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            return JSON.parse(text.slice(firstBrace, lastBrace + 1));
        }

        throw error;
    }
}

function buildPrompt(payload) {
    return `
당신은 갓생플래너의 제미나이 자율 운영 코치입니다.
사용자의 계획, 에너지, 일정, 모드를 읽고 실제 수정 가능한 추천을 만들어야 합니다.

[현재 상태]
- 요일: ${payload.currentDay}
- 모드: ${payload.mode}
- 에너지: ${payload.energy}
- 사용자 요청: ${payload.message}
- 월~수 성취율: ${payload.metrics?.earlyPercent ?? 0}%
- 전체 성취율: ${payload.metrics?.totalPercent ?? 0}%

[회의 정보]
${Array.isArray(payload.meetings) && payload.meetings.length ? payload.meetings.join('\n') : '없음'}

[현재 플래너 데이터]
${JSON.stringify(payload.plans || {}, null, 2)}

[반드시 수행할 일]
1. 사용자의 요청을 해석해 실제 행동 가능한 코칭 메시지를 작성합니다.
2. 필요하면 일정 이동, 삭제, 태스크 쪼개기, 저에너지 재정렬, 포커스 타임 추천 중 적절한 것을 선택합니다.
3. 학생 모드면 공부 태스크를 잘게 쪼개고, 직장인 모드면 회의 사이 빈 시간을 고려합니다.
4. 에너지가 낮으면 쉬운 것부터 처리하게 설계합니다.
5. 답변은 반드시 한국어입니다.
6. 완료된 체크리스트를 분석해 자동 회고를 작성합니다.
7. 다음날 계획은 자동 확정하지 말고 제안 수준으로만 제공합니다.

[반환 규칙]
- JSON만 출력하세요.
- recommendations[].type 은 move, delete, atomize, reorder-light, focus-slots, none 중 하나만 사용하세요.
- move/delete는 가능하면 taskText를 포함하세요.
- move는 toDay에 mon/tue/wed/thu/fri 중 하나를 넣으세요.
- atomize는 items 배열을 넣으세요.
- focus-slots는 message에 추천 시간을 자연어로 적으세요.
- 필요하면 요일별 제목(title)과 설명(description)도 수정 제안하세요.
- planUpdates 는 제목/설명을 바꾸고 싶은 요일만 포함하세요.
- taskUpdates 는 요일별 체크리스트를 추가 생성하거나 통째로 교체하고 싶을 때 사용하세요.
- replaceTasks 가 true면 해당 요일의 tasks를 새 목록으로 교체하고, false면 뒤에 추가하는 의미입니다.
- retrospective 는 완료된 체크리스트 분석 결과를 담습니다.
- nextDaySuggestion 은 다음날 계획 초안 제안이며 자동 반영 대상이 아닙니다.

[반환 스키마]
{
  "reply": "사용자에게 보여줄 최종 코칭 메시지",
    "retrospective": {
        "summary": "오늘/이번 구간 회고 요약",
        "wins": ["잘한 점 1", "잘한 점 2"],
        "risks": ["보완할 점 1"],
        "coachComment": "짧은 코치 코멘트"
    },
    "nextDaySuggestion": {
        "day": "tue",
        "title": "다음날 추천 초안",
        "tasks": ["첫 번째 제안", "두 번째 제안"],
        "note": "이 제안은 자동 반영되지 않습니다."
    },
    "planUpdates": [
        {
            "day": "mon",
            "title": "이번 주 시험 우선 계획",
            "description": "월요일은 과목 우선순위와 공부 범위를 가볍게 확정합니다.",
            "reason": "제목과 설명을 더 즉시 실행형으로 정리"
        }
    ],
    "taskUpdates": [
        {
            "day": "mon",
            "replaceTasks": true,
            "reason": "과목별 우선순위부터 먼저 잡는 편이 효율적임",
            "tasks": [
                {
                    "text": "시험 과목별 난이도와 비중 정리",
                    "details": ["전공 3과목, 교양 2과목 기준 정리"],
                    "done": false
                },
                {
                    "text": "가장 급한 과목 1개 먼저 착수",
                    "details": ["25분 집중 블록 1회"],
                    "done": false
                }
            ]
        }
    ],
  "recommendations": [
    {
      "type": "move",
      "title": "일정 이동 추천",
      "message": "왜 이 이동이 필요한지",
      "taskText": "대상 태스크",
      "toDay": "thu",
      "metrics": "간단한 근거"
    }
  ]
}
`;
}

app.post('/api/gemini-manage', async (req, res) => {
    try {
        const payload = req.body || {};
        const model = genAI.getGenerativeModel({
            model: 'gemini-1.5-flash',
            generationConfig: {
                responseMimeType: 'application/json'
            }
        });

        const result = await model.generateContent(buildPrompt(payload));
        const response = await result.response;
        const text = response.text();
        const parsed = safeJsonParse(text);

        res.json({
            success: true,
            reply: typeof parsed.reply === 'string' ? parsed.reply : '제미나이 응답을 해석하지 못했습니다.',
            retrospective: parsed.retrospective && typeof parsed.retrospective === 'object' ? parsed.retrospective : null,
            nextDaySuggestion: parsed.nextDaySuggestion && typeof parsed.nextDaySuggestion === 'object' ? parsed.nextDaySuggestion : null,
            planUpdates: Array.isArray(parsed.planUpdates) ? parsed.planUpdates : [],
            taskUpdates: Array.isArray(parsed.taskUpdates) ? parsed.taskUpdates : [],
            recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : []
        });
    } catch (error) {
        console.error('Gemini managed planner error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Gemini 자율 운영 플래너 서버 실행: http://localhost:${PORT}`);
});
