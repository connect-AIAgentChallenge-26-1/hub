const fs = require('fs');

const systemPrompt = `
You are the Feature-Slice Planning Agent.
Your task is to break down the given web development requirements into vertical slices (Data Layer, Service Layer, UI Layer) and prioritize them.
`;

function generatePlanToHTML(requirement) {
    const breakdown = [
        "1. Data Layer: Supabase table architecture configuration",
        "2. Service Layer: Express REST API route definition (POST/GET)",
        "3. UI Layer: React state binding and fetch synchronization",
        "4. Integration: Vertical slice data flow verification"
    ];
    
    // 브라우저에서 시각적으로 확인할 수 있는 HTML 템플릿 구성
    const htmlContent = `
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Feature-Slice 계획 수립 결과 리포트</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; background: #fafafa; color: #0f172a; line-height: 1.6; }
        .container { max-width: 800px; margin: 0 auto; background: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
        h1 { font-size: 24px; border-bottom: 2px solid #e2e8f0; padding-bottom: 15px; margin-bottom: 20px; }
        .meta { background: #f1f5f9; padding: 15px; border-radius: 6px; margin-bottom: 25px; font-size: 14px; }
        .task-list { list-style: none; padding: 0; }
        .task-item { background: #ffffff; margin-bottom: 12px; padding: 16px; border-left: 4px solid #1e293b; border-radius: 0 6px 6px 0; box-shadow: 0 1px 3px rgba(0,0,0,0.05); font-weight: 500; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Feature-Slice 계획 수립 결과 리포트</h1>
        <div class="meta">
            <strong>요구 사항:</strong> ${requirement}
        </div>
        <ul class="task-list">
            ${breakdown.map(task => `<li class="task-item">${task}</li>`).join('')}
        </ul>
    </div>
</body>
</html>
    `;
    
    // 파일 쓰기 동기 처리
    try {
        fs.writeFileSync('planning_result.html', htmlContent, 'utf8');
        console.log("정상 처리: planning_result.html 파일이 성공적으로 생성되었습니다.");
    } catch (error) {
        console.error("오류 발생: 파일 생성 실패", error);
    }
}

const userRequirement = "React-Express-Supabase CRUD full-stack connection";
generatePlanToHTML(userRequirement);