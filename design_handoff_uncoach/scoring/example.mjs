// 결(結) — 파이프라인 스모크 테스트 (Anthropic 호출은 모의)
// 실행: node scoring/example.mjs
import { scoreDraft } from './pipeline.mjs';
import { extractSignals } from './signals.mjs';

const situation = {
  rel: '교수',
  title: '교수님께 과제 채점 문의',
  counterpart: '전공 수업 담당 교수 (성적 권한, 하루 수십 통 메일)',
  goal: '과제 채점 결과 확인 요청',
  tension: '근거 없이 항의로 읽히면 관계 리스크',
  direction: '오류 가능성을 내 쪽에 귀속하고 확인 지점을 특정',
};

// 상황에 맞춰 그럴듯한 점수를 돌려주는 모의 LLM (실서버에선 Claude가 대체)
const mockClaude = async ({ user }) => {
  const banmal = /반말:true/.test(user);
  return banmal
    ? { context_intent: { score: 2, reason: '교수 입장을 못 읽고 항의조.' },
        relation_formality: { score: 1, reason: '교수에게 반말은 관계 리스크.' },
        strategy_expression: { score: 2, reason: '감정 호소만 있고 구조가 없음.' } }
    : { context_intent: { score: 4, reason: '오류 가능성을 자기 귀속하고 문항을 특정.' },
        relation_formality: { score: 4, reason: '정중한 존댓말로 관계에 적절.' },
        strategy_expression: { score: 4, reason: '배경→문항→확인요청으로 명료.' } };
};

const drafts = {
  '반말·감정호소': '쌤 저 과제 점수 왜 이렇게 나왔어요 ㅠㅠ 저 진짜 열심히 했는데 다시 봐주세요',
  '정중·구조적': '교수님 안녕하세요. 이번 과제 채점 결과 중 3번 문항이, 혹시 제가 놓친 부분이 있는지 다시 확인 부탁드려도 될까요? 바쁘시겠지만 감사합니다.',
};

for (const [label, draft] of Object.entries(drafts)) {
  console.log('\n===', label, '===');
  console.log('1단계 신호:', JSON.stringify(extractSignals(draft, situation)));
  const r = await scoreDraft({ situation, draft, callClaude: mockClaude });
  console.log('최종 점수(1~5):', r.scores);
  console.log('규칙 합성 내역:', r.ruleContribution);
  console.log(`총점: ${r.total}/100, 집중 축: ${r.focusAxis}`);
}
