// 결(結) — 채점 파이프라인 통합
//
// 1(규칙 신호) → 2(LLM 채점) → 3(합성)을 하나의 함수로 묶는다.
// LLM 호출(callClaude)은 주입받는다 → 서버(Anthropic SDK)든 테스트 모의든 교체 가능.
// 이 함수는 서버리스 함수(api/score.mjs)에서 실행되는 것을 기준으로 한다
// (Anthropic 키가 필요한 2단계는 브라우저에서 직접 못 돌린다).

import { extractSignals } from './signals.mjs';
import { buildScoringPrompt } from './rubric.mjs';
import { synthesizeScores } from './synthesize.mjs';

/**
 * @param {object} params
 * @param {object} params.situation 상황 메타
 * @param {string} params.draft 사용자 초안
 * @param {Array}  [params.thread] 지금까지의 대화
 * @param {(args:{system,user,schema})=>Promise<object>} params.callClaude
 *        system/user/schema를 받아 스키마에 맞는 JSON 객체를 반환하는 함수
 * @returns {Promise<{scores,reasons,ruleContribution,total,focusAxis,signals}>}
 */
export async function scoreDraft({ situation, draft, thread = [], callClaude }) {
  if (typeof callClaude !== 'function') {
    throw new Error('scoreDraft: callClaude 주입이 필요합니다.');
  }
  // 1단계
  const signals = extractSignals(draft, situation);
  // 2단계
  const { system, user, schema } = buildScoringPrompt({ situation, draft, thread, signals });
  const llm = await callClaude({ system, user, schema });
  // 3단계
  const result = synthesizeScores({ llm, signals });
  return { ...result, signals };
}
