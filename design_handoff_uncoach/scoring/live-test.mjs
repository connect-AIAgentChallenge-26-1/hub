// 결(結) — 실호출 테스트 (진짜 Claude로 채점)
//
// example.mjs 는 목(mock) LLM으로 오프라인 검증용이고, 이 파일은 실제 Anthropic API를 호출한다.
//
// 실행:
//   1) npm install                       (@anthropic-ai/sdk 설치)
//   2) 키 설정 (코드에 넣지 말 것):
//        macOS/Linux:  export ANTHROPIC_API_KEY=sk-ant-...
//        Windows PS :  $env:ANTHROPIC_API_KEY = "sk-ant-..."
//   3) node scoring/live-test.mjs                 (기본 샘플 2개 채점)
//      node scoring/live-test.mjs "교수님 저 과제 다시 봐주세요"   (내 초안 채점)
//   선택: SCORE_MODEL=claude-haiku-4-5 node scoring/live-test.mjs   (모델 변경)

import { scoreDraft } from './pipeline.mjs';
import { createClaudeScorer, DEFAULT_MODEL } from './claude.mjs';
import { toAxisRows, totalBand } from './display.mjs';

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('❌ ANTHROPIC_API_KEY 환경변수가 없습니다. 키를 설정한 뒤 다시 실행하세요(코드에 넣지 마세요).');
  process.exit(1);
}

// SDK는 설치돼 있어야 한다(npm install). 미설치면 친절히 안내.
let Anthropic;
try {
  ({ default: Anthropic } = await import('@anthropic-ai/sdk'));
} catch {
  console.error('❌ @anthropic-ai/sdk 가 설치돼 있지 않습니다. 프로젝트 루트에서 `npm install` 하세요.');
  process.exit(1);
}

const model = process.env.SCORE_MODEL || DEFAULT_MODEL;
const client = new Anthropic();

let lastMeta = null;
const callClaude = createClaudeScorer(client, { model, onMeta: (m) => { lastMeta = m; } });

const situation = {
  rel: '교수',
  title: '교수님께 과제 채점 문의',
  counterpart: '전공 수업 담당 교수 (성적 권한, 하루 수십 통 메일)',
  goal: '과제 채점 결과 확인 요청',
  tension: '근거 없이 항의로 읽히면 관계 리스크',
  direction: '오류 가능성을 내 쪽에 귀속하고 확인 지점을 특정',
};

// 인자로 초안을 주면 그것만, 없으면 기본 샘플 2개
const cliDraft = process.argv[2];
const drafts = cliDraft
  ? { '내 초안': cliDraft }
  : {
      '반말·감정호소': '쌤 저 과제 점수 왜 이렇게 나왔어요 ㅠㅠ 저 진짜 열심히 했는데 다시 봐주세요',
      '정중·구조적': '교수님 안녕하세요. 이번 과제 채점 결과 중 3번 문항이, 혹시 제가 놓친 부분이 있는지 다시 확인 부탁드려도 될까요? 바쁘시겠지만 감사합니다.',
    };

// opus-4-8 기준 대략 단가(입력 $5 / 출력 $25 per 1M). 모델 바꾸면 참고치일 뿐.
const PRICE = { in: 5, out: 25 };
let totalCost = 0;

console.log(`\n=== 실호출 채점 (model: ${model}) ===`);

for (const [label, draft] of Object.entries(drafts)) {
  console.log(`\n■ [${label}] "${draft}"`);
  try {
    const r = await scoreDraft({ situation, draft, callClaude });
    const rows = toAxisRows(r);
    for (const a of rows) {
      console.log(`  ${a.num} ${a.name}: ${a.score}/5 (${a.label})${a.isFocus ? '  ← 집중 축' : ''}`);
      console.log(`     근거: ${a.reason}`);
    }
    console.log(`  총점: ${r.total}/100 (${totalBand(r.total).label})`);
    console.log(`  규칙 합성 내역:`, JSON.stringify(r.ruleContribution));

    if (lastMeta && lastMeta.usage) {
      const u = lastMeta.usage;
      const cost = (u.input_tokens || 0) / 1e6 * PRICE.in + (u.output_tokens || 0) / 1e6 * PRICE.out;
      totalCost += cost;
      console.log(`  usage: in=${u.input_tokens} out=${u.output_tokens} · 실서빙 모델=${lastMeta.model} · ~$${cost.toFixed(5)}`);
    }
  } catch (e) {
    console.error(`  ⚠️ 채점 실패: ${(e && e.message) || e}`);
  }
}

console.log(`\n합계 예상 비용: ~$${totalCost.toFixed(5)} (참고치)\n`);
