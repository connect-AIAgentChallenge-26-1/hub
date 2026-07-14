// 결(結) — 2단계: LLM 채점 프롬프트 템플릿 + 출력 스키마
//
// 3축의 세부 채점 기준을 명시적으로 프롬프트에 박아, "무엇을 근거로 점수를 매기는지"를
// 고정한다. 1단계 신호값은 참고 자료로만 전달하고, 최종 판정은 모델이 한다.
// 출력은 structured outputs(json_schema)로 강제하며 점수는 enum으로 1~5에 제약한다.

export const AXES = [
  { key: 'context_intent', num: '①', name: '맥락·의도' },
  { key: 'relation_formality', num: '②', name: '관계·격식' },
  { key: 'strategy_expression', num: '③', name: '전략·표현' },
];

// 각 축의 세부 채점 기준(고정). 점수 척도 1(위험)~5(적절).
const RUBRIC_CRITERIA = `[① 맥락·의도 (context_intent)]
- 상황이 요구하는 목적(부탁/거절/보고/사과 등)을 정확히 인지했는가
- 상대가 처한 입장·제약(권한, 시간, 형평성, 부담)을 읽고 배려했는가
- 타이밍과 요청 범위가 적절한가(막연·과다 요구가 아닌가)
  1 위험: 목적을 놓치거나 상대 입장을 무시/전가. 관계·평판 리스크.
  3 무난: 목적은 전달되나 상대 입장 읽기가 얕거나 요청이 막연.
  5 적절: 목적 명확 + 상대 제약을 반영 + 요청 범위 특정.

[② 관계·격식 (relation_formality)]
- 위계·친밀도에 맞는 어휘·존대 수준인가(과함=과공도, 부족도 모두 감점)
- 거리감 조절이 맞는가(너무 딱딱/너무 편함)
- 체면(face)을 손상시키지 않는가
  1 위험: 관계에 어긋난 레지스터(상급자에게 반말/이모티콘, 동료에게 과공).
  3 무난: 대체로 맞으나 어색하거나 다소 과함/부족.
  5 적절: 관계에 정확히 맞는 톤. 상급자엔 정중, 동료엔 과하지 않은 친근함.

[③ 전략·표현 (strategy_expression)]
- 완충 표현(쿠션어)을 상황에 맞게 썼는가(부족도 과다도 감점)
- 논리 구조가 있는가(배경→요청, 사과→대안 등)
- 문장 길이·명료성이 적절한가
  1 위험: 요구조·감정 호소만 있고 근거/구조/완충이 결여.
  3 무난: 요청·정보는 있으나 배열이 흐트러지거나 완충이 어긋남.
  5 적절: 완충→핵심→요청이 명료하고, 상황에 맞는 간결함/완곡함.

[관계별 '적절'의 방향 — 격식은 높을수록 좋은 게 아님]
- 상급자(교수·상사·거래처 등): 신중한 완충 + 오류 가능성 자기 귀속 + 요청 범위 특정. 과한 완충도 대체로 허용.
- 실무 창구(조교·행정): 간결·정확 + 필요 정보 완비. 장황한 완충·아부는 감점.
- 동료·후배: 가볍고 명확한 톤이 5점. 과공·과격식은 거리감을 만들어 1~2점.`;

const SYSTEM = `당신은 한국어 '화용 능력' 채점 엔진입니다. 문법·어휘가 아니라 오직 화용
(이 글이 이 상황·관계·의도에서 적절한가)만 채점합니다. 아래 3축 기준을 최우선으로 적용해
각 축을 1~5로 판정하고, 각 축마다 근거를 한국어 한 문장으로 답하세요. 다른 텍스트 없이
지정된 JSON만 출력합니다.

${RUBRIC_CRITERIA}

[규칙 신호 활용 지침]
- 함께 주어지는 '규칙 신호'는 종결어미·쿠션어·문체를 기계적으로 추출한 참고 자료입니다.
- 신호는 힌트일 뿐이며, 오탐이 있을 수 있습니다. 초안 원문을 근거로 최종 판정하세요.
- 특히 관계·격식 축은 신호(반말/과공 플래그 등)를 적극 참고하되 맹신하지 마세요.`;

/**
 * 채점 프롬프트를 조립한다.
 * @returns {{system:string, user:string, schema:object}}
 */
export function buildScoringPrompt({ situation = {}, draft = '', thread = [], signals = {} }) {
  let user = `[상황] ${situation.title || '(제목 없음)'}\n`;
  user += `[상대(관계)] ${situation.rel || '?'} — ${situation.counterpart || situation.who || ''}\n`;
  if (situation.goal) user += `[목적] ${situation.goal}\n`;
  if (situation.tension) user += `[긴장 포인트] ${situation.tension}\n`;
  if (situation.direction) user += `[이 관계에서 '적절'의 방향] ${situation.direction}\n`;

  if (Array.isArray(thread) && thread.length) {
    user += `[지금까지의 대화]\n`;
    user += thread.map(t => `${t.from === 'them' ? '상대' : '나'}: ${t.text}`).join('\n') + '\n';
  }

  user += `\n[규칙 신호(참고용)]\n${summarizeSignals(signals)}\n`;
  user += `\n[채점할 내 초안]\n"""\n${draft}\n"""\n지정된 JSON만 출력하세요.`;

  return { system: SYSTEM, user, schema: OUTPUT_SCHEMA };
}

function summarizeSignals(s) {
  if (!s || !s.honorific) return '(신호 없음)';
  const h = s.honorific, st = s.style || {};
  const parts = [
    `존대수준=${h.level}(합쇼체:${!!h.hap}/해요체:${!!h.haeyo}/반말:${!!h.banmal})`,
    `쿠션어=${s.cushions ? s.cushions.count : 0}개${s.cushions && s.cushions.matched.length ? '('+s.cushions.matched.join(',')+')' : ''}`,
    `글자수=${st.charLen}, 문장수=${st.sentenceCount}, 이모티콘/구어체=${!!st.hasEmoji || !!st.hasColloquial}`,
    `관계분류=${s.relClass}`,
    `플래그=${(s.flags && s.flags.length) ? s.flags.join(',') : '없음'}`,
  ];
  return '- ' + parts.join('\n- ');
}

const axisSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['score', 'reason'],
  properties: {
    score: { type: 'integer', enum: [1, 2, 3, 4, 5] },
    reason: { type: 'string' },
  },
};

export const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['context_intent', 'relation_formality', 'strategy_expression'],
  properties: {
    context_intent: axisSchema,
    relation_formality: axisSchema,
    strategy_expression: axisSchema,
  },
};
