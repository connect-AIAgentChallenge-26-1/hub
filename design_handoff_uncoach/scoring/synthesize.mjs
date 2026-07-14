// 결(結) — 3단계: 최종 스코어 합성
//
// 관계·격식 축은 규칙 신호 비중을 30~50% 섞고(기본 40%), 맥락·의도·전략·표현은
// LLM 비중을 훨씬 높게 둔다(맥락은 100% LLM, 전략은 규칙 20%). 축별 1~5점을
// 가중 합성해 총점(100)과 '집중 축'(가장 낮은 축)을 계산한다.

export const AXIS_WEIGHT = { context_intent: 40, relation_formality: 30, strategy_expression: 30 };

// 규칙 신호를 섞는 비율(0~1). 나머지는 LLM 판단.
export const RULE_BLEND = {
  context_intent: 0.0,       // 규칙으로 의도를 판단할 수 없음 → 전적으로 LLM
  relation_formality: 0.4,   // 종결어미·과공 신호가 강력 → 규칙 40%
  strategy_expression: 0.2,  // 구조·완충은 일부만 규칙으로 → 20%
};

// 위계 우선순위(총점이 같을 때 집중 축 타이브레이크: 맥락 > 격식 > 전략)
const HIERARCHY = ['context_intent', 'relation_formality', 'strategy_expression'];

function clamp5(n) { return Math.max(1, Math.min(5, Math.round(Number(n) || 1))); }

/**
 * LLM 축 점수 + 규칙 신호를 가중 합성.
 * @param {object} params.llm 2단계 결과 {context_intent:{score,reason}, ...}
 * @param {object} params.signals 1단계 결과(ruleRegister/ruleStrategy 포함)
 * @returns {{scores, reasons, ruleContribution, total, focusAxis}}
 */
export function synthesizeScores({ llm, signals }) {
  const ruleScore = {
    context_intent: null,
    relation_formality: signals && signals.ruleRegister,
    strategy_expression: signals && signals.ruleStrategy,
  };

  const scores = {};
  const reasons = {};
  const ruleContribution = {};

  for (const key of HIERARCHY) {
    const llmScore = clamp5(llm && llm[key] && llm[key].score);
    const blend = RULE_BLEND[key];
    const rule = ruleScore[key];
    if (blend > 0 && rule != null) {
      scores[key] = clamp5(blend * rule + (1 - blend) * llmScore);
      ruleContribution[key] = { rule, llm: llmScore, blend };
    } else {
      scores[key] = llmScore;
    }
    reasons[key] = (llm && llm[key] && llm[key].reason) || '';
  }

  const total = Math.round(
    HIERARCHY.reduce((t, k) => t + (scores[k] / 5) * AXIS_WEIGHT[k], 0)
  );

  // 가장 낮은 축 = 집중 축. 동점이면 위계 순서(맥락 우선)로.
  let focusAxis = HIERARCHY[0];
  for (const k of HIERARCHY) if (scores[k] < scores[focusAxis]) focusAxis = k;

  return { scores, reasons, ruleContribution, total, focusAxis };
}
