const express = require('express');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(express.json());

// 1. 주소창에 http://localhost:3000 치면 우리가 만든 HTML 화면을 띄워줍니다.
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'weekly_planning_agent.html'));
});

// 2.  여기에 유저님의 진짜 제미나이 API 키를 따옴표 안에 넣으세요!
const GEMINI_API_KEY = "AQ.Ab8RN6JIafTsbXswf_dM6Ec5bJ99wXTm-nqHmgXxAQx7QAnxHQ";
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// 3. HTML 화면에서 'AI 비서' 버튼을 누르면 이 주소로 요청이 들어옵니다.
app.post('/api/assistant', async (req, res) => {
    try {
        const { message, day } = req.body;
        
        // 제미나이 모델 호출
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        
        const prompt = `
당신은 사용자의 주간 계획 수립과 실행을 돕는 유능한 AI 비서 에이전트입니다.
현재 계획을 수정 중인 요일: ${day}
사용자가 처한 상황 및 요청: ${message}

[지침]
1. 사용자가 피곤하거나 지친 상태라면 태스크를 아주 쉽고 직관적인 단계로 쪼개거나 우선순위를 낮추도록 조언하세요.
2. 학생 모드/직장인 모드 맥락에 맞춰 계획표를 어떻게 수정하면 좋을지 구체적이고 명확한 실행 전략을 제시하세요.
3. 친절하고 명확하게 한글로 답변해 주세요.
`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        // 진짜 제미나이의 답변을 HTML 화면으로 전송
        res.json({ success: true, reply: text });
    } catch (error) {
        console.error("Gemini API Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 서버 구동 포트 지정
app.listen(3000, () => {
    console.log(' 주간 계획 에이전트 두뇌(Server)가 실행되었습니다!');
    console.log(' 지금 브라우저를 열고 http://localhost:3000 으로 접속하세요!');
});