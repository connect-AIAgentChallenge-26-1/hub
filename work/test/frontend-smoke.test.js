'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const FRONTEND_DIR = path.join(__dirname, '..', '..', 'frontend-work');
const HTML_PATH = path.join(FRONTEND_DIR, '플래너.html');
const CORE_PATH = path.join(FRONTEND_DIR, 'planner-core.js');

function countId(html, id) {
  return (html.match(new RegExp(`id=["']${id}["']`, 'g')) || []).length;
}

test('핵심 AI 비서 UI 요소가 한 번씩 존재한다', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const requiredIds = [
    'daily-briefing',
    'omni-dropzone',
    'agent-request',
    'assistant-condition-toggle',
    'upload-file-input',
    'omni-voice-trigger',
    'generate-agent',
    'inline-action-cards',
    'assistant-drawer',
    'assistant-persona'
  ];

  for (const id of requiredIds) {
    if (id === 'assistant-persona') {
      assert.match(html, /name=["']assistant-persona["']/);
    } else {
      assert.equal(countId(html, id), 1, `${id} 요소가 정확히 한 번 있어야 합니다.`);
    }
  }
  assert.equal(html.includes('id="upload-file-btn"'), false, '삭제한 구형 업로드 버튼이 남아 있으면 안 됩니다.');
});

test('공용 로직이 인라인 앱 코드보다 먼저 로드된다', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const externalCoreIndex = html.indexOf('<script src="./planner-core.js"></script>');
  const inlineCoreIndex = html.indexOf('function attachPlannerCore');
  const coreIndex = externalCoreIndex >= 0 ? externalCoreIndex : inlineCoreIndex;
  const appIndex = html.lastIndexOf('<script>');

  assert.ok(coreIndex >= 0);
  assert.ok(appIndex > coreIndex);
  assert.match(html, /const plannerCore = window\.PlannerCore;/);
  assert.match(html, /plannerCore\.computeCompletionPercent/);
});

test('공용 모듈과 인라인 앱 JavaScript에 문법 오류가 없다', () => {
  const core = fs.readFileSync(CORE_PATH, 'utf8');
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const inlineStart = html.lastIndexOf('<script>') + '<script>'.length;
  const inlineEnd = html.lastIndexOf('</script>');

  assert.doesNotThrow(() => new vm.Script(core, { filename: 'planner-core.js' }));
  assert.doesNotThrow(() => new vm.Script(html.slice(inlineStart, inlineEnd), { filename: 'planner-inline.js' }));
});

test('AI 로딩 퍼센트는 목표값까지 연속 보간되고 완료 후에만 답변으로 전환된다', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  assert.match(html, /assistantLoadingTarget/);
  assert.match(html, /gap \* 0\.055/);
  assert.match(html, /requestAnimationFrame\(animate\)/);
  assert.ok(
    html.indexOf('await completeAssistantLoading();') < html.indexOf("addAssistantChat('assistant', reply)"),
    '100% 로딩 완료 전에 답변이 노출되면 안 됩니다.'
  );
});

test('첨부 파일의 실제 추출 항목과 근거가 최종 AI 요청에 전달된다', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  assert.match(html, /첨부 파일 분석 결과 - 최우선 근거/);
  assert.match(html, /근거: \$\{task\.details\.join/);
  assert.match(html, /source: task\.source \|\| 'manual'/);
  assert.match(html, /durationMinutes: Number\(task\.durationMinutes\)/);
});

test('새 실행 요청은 작성 화면과 이전 첨부 문맥을 초기화한다', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  assert.match(html, /resetAssistantComposeAfterSubmit\(submittedInstruction, submittedTitle\)/);
  assert.match(html, /activeAssistantRequestContext = \{ hasAttachment: hasFile, uploadedTaskTexts: \[\] \}/);
  assert.match(html, /uploadedTaskTexts: \(uploadResult\.uploadedTasks \|\| \[\]\)\.map/);
  assert.match(html, /displayMessage: getVisibleAssistantRequest/);
});

test('OCR 내부 인식 메타데이터는 소단위 작업으로 노출하지 않는다', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const core = fs.readFileSync(CORE_PATH, 'utf8');
  for (const source of [html, core]) {
    assert.ok(source.includes('!/^이미지 OCR \\d+번째 인식 문장$/i.test'));
    assert.ok(source.includes('!/^인식 원문:/i.test'));
  }
});

test('승인 액션은 즉시 완료 상태로 바뀌고 반영된 계획 위치로 이동한다', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  assert.match(html, /void persistPlannerState\(`action:\$\{actionItem\.kind\}`\)/);
  assert.match(html, /event\.currentTarget\.textContent = applied \? '반영 완료' : '적용 불가'/);
  assert.match(html, /moveToAppliedLocation\(actions\[index\]\)/);
  assert.match(html, /target\.scrollIntoView\(\{ behavior: 'smooth', block: 'start' \}\)/);
  assert.match(html, /action-target-highlight/);
});

test('긴 권장 실행 순서는 독립 스크롤 영역으로 표시한다', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  assert.match(html, /const isExecutionOrder = \/권장\\s\*실행\\s\*순서\//);
  assert.match(html, /paragraph\.length > 360 \|\| paragraph\.split\('\\n'\)\.length > 7/);
  assert.match(html, /section\.dataset\.scrollableSection = 'execution-order'/);
  assert.match(html, /\.assistant-response-section\.is-scrollable \.assistant-response-section-content/);
  assert.match(html, /overflow-y: auto/);
});

test('타임블록은 접고 펼칠 수 있는 서랍으로 동작한다', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  assert.equal(countId(html, 'timeblock-drawer-toggle'), 1);
  assert.match(html, /id="timeblock-drawer-toggle"/);
  assert.match(html, /timeBlockDrawerOpen = !timeBlockDrawerOpen/);
  assert.match(html, /TIME_BLOCK_DRAWER_KEY/);
  assert.match(html, /\.timeblock-section\.is-collapsed \.timeblock-drawer-body/);
  assert.match(html, /grid-template-rows: 0fr/);
});

test('소단위 체크리스트는 상위 작업과 완료 상태를 동기화한다', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  assert.match(html, /data-detail-check="\$\{index\}-\$\{dIndex\}"/);
  assert.match(html, /setSubtaskDone\(task, dIndex, e\.target\.checked\)/);
  assert.match(html, /setTaskDone\(plans\[currentDay\]\.tasks\[index\], e\.target\.checked\)/);
  assert.match(html, /detailDone: Array\.isArray\(task\.detailDone\)/);
});

test('컨디션 선택 여부에 따라 AI 요청과 별도 제안 카드를 분리한다', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  assert.match(html, /AI 비서가 컨디션을 고려할까요\?/);
  assert.match(html, />AI 비서에게 요청<\/button>/);
  assert.match(html, /considerCondition: Boolean\(considerCondition\)/);
  assert.match(html, /energy: considerCondition \? currentEnergy : undefined/);
  assert.match(html, /activeAssistantConditionEnabled\s*\?\s*normalizeConditionSuggestion/);
  assert.match(html, /suggestionTitle\.textContent = 'AI 비서의 제안'/);
  assert.match(html, /className = 'assistant-condition-suggestion'/);
});

test('요일 진행에 따라 하늘빛 배경이 월요일에서 금요일 방향으로 이동한다', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  assert.match(html, /@property --week-flow-x/);
  assert.match(html, /mon: '12%'/);
  assert.match(html, /wed: '50%'/);
  assert.match(html, /fri: '88%'/);
  assert.match(html, /document\.documentElement\.style\.setProperty\('--week-flow-x', flowPosition\)/);
  assert.match(html, /updateWeekFlowBackground\(currentDay\)/);
  assert.match(html, /transition: --week-flow-x 920ms cubic-bezier/);
});

test('직접 연 파일은 서버 주소로 이동하고 캐러셀 화살표는 양옆 중앙에 표시한다', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  assert.match(html, /window\.location\.protocol === 'file:'/);
  assert.match(html, /window\.location\.replace\('http:\/\/127\.0\.0\.1:3001\/'\)/);
  assert.match(html, /\.assistant-slide \{[\s\S]*padding: 22px 88px 52px;/);
  assert.match(html, /\.assistant-carousel-arrow \{[\s\S]*top: 50%;[\s\S]*width: 42px;[\s\S]*height: 42px;/);
  assert.match(html, /\.assistant-carousel-arrow\.prev \{[\s\S]*left: 22px;[\s\S]*right: auto;/);
  assert.match(html, /\.assistant-carousel-arrow\.next \{[\s\S]*right: 22px;[\s\S]*left: auto;/);
  assert.match(html, /@media \(max-width: 700px\) \{[\s\S]*\.assistant-carousel-arrow \{ display: none; \}/);
});

test('우측 계정 연동은 Google·카카오 OAuth 팝업과 로그인 상태를 연결한다', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  assert.equal(countId(html, 'account-toggle'), 1);
  assert.equal(countId(html, 'auth-modal'), 1);
  assert.equal(countId(html, 'auth-user-card'), 1);
  assert.match(html, /Google로 계속하기/);
  assert.match(html, /카카오로 계속하기/);
  assert.match(html, /window\.open\([\s\S]*\/api\/auth\/start\?provider=/);
  assert.match(html, /event\.data\.type === 'planner-auth-success'/);
  assert.match(html, /fetch\('\/api\/auth\/session'/);
  assert.match(html, /fetch\('\/api\/auth\/logout'/);
  assert.match(html, /비밀번호는 갓생러 플래너가 받거나 저장하지 않습니다/);
});

test('뽀모도로 영역은 생산성 극대화 코치와 세 가지 실행 경로로 교체된다', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  assert.equal(countId(html, 'productivity-coach'), 1);
  assert.equal(countId(html, 'productivity-apply'), 1);
  assert.match(html, /생산성 극대화 코치/);
  assert.match(html, /GOD-SAENG COMPRESSION ENGINE/);
  assert.match(html, /data-productivity-branch="output"/);
  assert.match(html, /data-productivity-branch="balanced"/);
  assert.match(html, /data-productivity-branch="recovery"/);
  assert.match(html, /시간 대비 성과 최적화/);
});

test('갓생 압축 엔진은 계획을 분석하고 적용 및 되돌리기를 지원한다', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  assert.match(html, /function createProductivityCoachAnalysis/);
  assert.match(html, /estimateImpact\(task\.text\)/);
  assert.match(html, /getProductivityTaskContext\(task\.text\)/);
  assert.match(html, /transitionSavings/);
  assert.match(html, /aiAssistSavings/);
  assert.match(html, /goalProbability/);
  assert.match(html, /async function applyProductivityCoachPlan/);
  assert.match(html, /async function undoProductivityCoachPlan/);
  assert.match(html, /autoArrangeTimeBlocks\(currentDay\)/);
  assert.match(html, /persistPlannerState\('productivity-coach-apply'\)/);
});

test('일일 브리핑은 로그인 이름과 연령대·직업별 최신 정보 피드를 사용한다', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  assert.match(html, /오늘의 1분 브리핑/);
  assert.doesNotMatch(html, /오늘의 1분 선제 브리핑/);
  assert.equal(countId(html, 'personal-age-group'), 1);
  assert.equal(countId(html, 'personal-occupation'), 1);
  assert.equal(countId(html, 'personal-interests'), 1);
  assert.equal(countId(html, 'personal-intelligence-feed'), 1);
  assert.match(html, /PERSONAL INTELLIGENCE · NAVER NEWS/);
  assert.match(html, /쉼표로 구분해 최대 8개/);
  assert.match(html, /currentAuthUser\?\.name/);
  assert.match(html, /PERSONALIZED_BRIEFING_ENDPOINT = '\/api\/briefing\/personalized'/);
  assert.match(html, /PERSONALIZED_BRIEFING_FALLBACK_ENDPOINT/);
  assert.match(html, /response\.status === 404/);
  assert.match(html, /fetchPersonalizedBriefing/);
  assert.match(html, /url\.hostname === 'news\.naver\.com'/);
  assert.match(html, /interests: profile\.interests/);
  assert.match(html, /새 업데이트 없음 · 기존 정보 유지/);
  assert.match(html, /window\.setInterval\(\(\) => \{/);
  assert.match(html, /refreshPersonalizedBriefing\(\{ force: true \}\)/);
});
