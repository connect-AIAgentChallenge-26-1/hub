const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const { GoogleGenerativeAI } = require('@google/generative-ai');

dotenv.config();

const app = express();
app.use(express.json({ limit: '1mb' }));

const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AQ.Ab8RN6JIafTsbXswf_dM6Ec5bJ99wXTm-nqHmgXxAQx7QAnxHQ';

if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY가 설정되지 않았습니다.');
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'godsaeng_planner_gemini.html'));
});

app.use(express.static(__dirname, { index: false }));

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
당신은 '갓생플래너'의 고기능 맞춤형 코치 AI입니다.
사용자의 현재 상태와 계획표를 바탕으로 실시간으로 계획을 튜닝해야 합니다.

[사용자 상태]
- 현재 요일: ${payload.currentDay}
- 현재 모드: ${payload.mode}
- 현재 에너지: ${payload.energy}
- 사용자 요청: ${payload.message}
- 월~수 성취율: ${payload.metrics?.earlyPercent ?? 0}%
- 전체 성취율: ${payload.metrics?.totalPercent ?? 0}%

[회의/일정 정보]
${Array.isArray(payload.meetings) && payload.meetings.length ? payload.meetings.join('\n') : '없음'}

[현재 플래너 상태]
${JSON.stringify(payload.plans || {}, null, 2)}

[역할]
1. 단순 조언이 아니라 실제로 계획표를 수정할 수 있는 추천을 생성합니다.
2. 학생 모드면 태스크를 잘게 쪼개고, 직장인 모드면 컨디션과 일정 빈틈을 반영합니다.
3. 에너지가 낮으면 쉬운 것부터 처리하도록 순서를 바꾸거나 일부 할 일을 뒤로 미루거나 삭제 추천을 합니다.
4. 답변은 반드시 한국어입니다.

[중요]
- 반드시 JSON만 출력하세요.
- recommendations 배열의 각 항목 type은 move, delete, atomize, reorder-light, focus-slots, none 중 하나만 사용하세요.
- move/delete는 가능하면 taskText를 포함하세요.
- move는 toDay에 mon/tue/wed/thu/fri 중 하나를 넣으세요.
- atomize는 items 배열에 바로 실행 가능한 세부 태스크를 넣으세요.

[반환 JSON 스키마]
{
  "reply": "사용자에게 보여줄 최종 코칭 메시지",
  "recommendations": [
    {
      "type": "move",
      "title": "일정 이동 추천",
      "message": "무엇을 왜 옮기는지",
      "taskText": "대상 태스크 텍스트",
      "toDay": "thu",
      "metrics": "간단한 근거"
    }
  ]
}
`;
}

app.post('/api/coach', async (req, res) => {
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
            reply: typeof parsed.reply === 'string' ? parsed.reply : '응답을 해석하지 못해 기본 코칭 결과만 전달합니다.',
            recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : []
        });
    } catch (error) {
        console.error('Gemini Coach API Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`갓생플래너 Gemini 코치 서버가 실행되었습니다: http://localhost:${PORT}`);
});
