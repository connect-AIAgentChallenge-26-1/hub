// 결(結) — 1단계: 규칙 기반 신호 추출
//
// 목적: 점수를 매기지 않는다. 종결어미·쿠션어·문체 등 "관찰 가능한 사실"만 뽑아
//       2단계 LLM 프롬프트의 참고 자료로 넘기고, 3단계 합성에서 관계·격식 축의
//       가중치 재료로 쓴다. 브라우저와 서버(서버리스 함수) 양쪽에서 import 가능.
//
// ⚠️ 이 신호들은 "힌트"다. 최종 판정은 2단계 LLM이 한다. 종결어미 판별은 정규식
//    휴리스틱이라 오탐이 있을 수 있다(예: 평서형 "아니다"가 합쇼체로 잡히는 등).

// 관계를 상급/동료/후배로 대략 분류(상황의 rel 라벨 기준)
const SUPERIOR_KEYS = ['교수', '지도교수', '상사', '팀장', '조교', '행정', '거래처',
  '클라이언트', '고객', '면접', '인사', '외부', '선배', '대표', '발주', '현직'];
const PEER_KEYS = ['동료', '조원', '동기', '동갑'];
const JUNIOR_KEYS = ['후배'];

function classifyRelation(situation) {
  const rel = String((situation && (situation.rel || situation.relation)) || '');
  if (JUNIOR_KEYS.some(k => rel.includes(k))) return 'junior';
  if (PEER_KEYS.some(k => rel.includes(k))) return 'peer';
  if (SUPERIOR_KEYS.some(k => rel.includes(k))) return 'superior';
  return 'unknown';
}

// 종결어미로 존대 수준 판별(근사)
function detectHonorific(text) {
  const hap = /(습니다|ㅂ니다|입니다|합니다|됩니다|겠습니다|드립니다|니까|십시오|십시오|드려요)/.test(text);
  const haeyo = /(요[.!?~\s]|요$|에요|예요|세요|아요|어요|해요|까요|네요|드려요|죠[.!?~\s]?|죠$)/.test(text);
  // 명시적 반말 신호(요-종결이 아닌 구어 종결)
  const banmal = /(했어|해봐|줘$|줘[.!?\s]|하자|이야|거야|냐\?|야[.!?\s]|야$|지\?|해$|해[.!?\s]|는데$|줄래|줄게|을게$)/.test(text);
  let level = 'mixed';
  if (hap) level = 'formal';
  else if (haeyo && !banmal) level = 'polite';
  else if (banmal && !haeyo) level = 'casual';
  return { hap, haeyo, banmal, level };
}

// 완충 표현(쿠션어) 사전 매칭
const CUSHIONS = ['혹시', '죄송', '실례', '괜찮으시', '괜찮다면', '가능하시', '가능하다면',
  '바쁘시', '염치없', '양해', '부탁', '실례가', '괜찮으실', '괜찮을까', '여쭤', '여쭙',
  '실례지만', '번거로우'];

function matchCushions(text) {
  const matched = [];
  for (const c of CUSHIONS) if (text.includes(c)) matched.push(c);
  return { count: matched.length, matched };
}

// 문체 신호
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/u;
const COLLOQUIAL_RE = /(ㅋㅋ|ㅎㅎ|ㅠ|ㅜ|~{1,}|!{2,}|\?{2,}|쌤|넵|넹|ㄱㄱ|ㅇㅇ)/;

function detectStyle(text) {
  const charLen = text.length;
  const sentences = text.split(/[.!?…\n]+/).map(s => s.trim()).filter(Boolean);
  const sentenceCount = sentences.length || 1;
  const avgSentenceLen = Math.round(charLen / sentenceCount);
  return {
    charLen,
    sentenceCount,
    avgSentenceLen,
    hasEmoji: EMOJI_RE.test(text),
    hasColloquial: COLLOQUIAL_RE.test(text),
  };
}

/**
 * 초안에서 규칙 기반 신호를 추출한다.
 * @param {string} draft 사용자가 쓴 초안
 * @param {object} situation 상황 메타(rel 등)
 * @returns {object} signals — honorific/cushions/style/flags/relClass + 규칙 축 추정치
 */
export function extractSignals(draft, situation = {}) {
  const text = String(draft || '');
  const honorific = detectHonorific(text);
  const cushions = matchCushions(text);
  const style = detectStyle(text);
  const relClass = classifyRelation(situation);

  // 명백한 부적합 플래그(규칙으로 즉시 잡히는 것)
  const flags = [];
  if (relClass === 'superior') {
    if (honorific.banmal && !honorific.hap) flags.push('banmal_to_superior');
    if (style.hasEmoji || style.hasColloquial) flags.push('casual_style_to_superior');
  }
  if ((relClass === 'peer' || relClass === 'junior') && honorific.hap && cushions.count >= 2) {
    flags.push('overly_formal_to_peer');
  }

  // 규칙만으로 잠정 추정한 축 점수(1~5). 3단계 합성에서 관계·격식에 비중 있게,
  // 전략에 소폭 반영된다. 맥락·의도는 규칙으로 판단 불가하므로 추정하지 않는다.
  const ruleRegister = estimateRegister({ honorific, cushions, style, relClass, flags });
  const ruleStrategy = estimateStrategy({ cushions, style });

  return { honorific, cushions, style, relClass, flags, ruleRegister, ruleStrategy };
}

function clamp5(n) { return Math.max(1, Math.min(5, Math.round(n))); }

function estimateRegister({ honorific, cushions, style, relClass, flags }) {
  let s = 3;
  if (relClass === 'superior') {
    if (flags.includes('banmal_to_superior')) s = 1;
    else if (honorific.hap) s = 4;
    else if (honorific.haeyo) s = 3;
    if (flags.includes('casual_style_to_superior')) s -= 1;
  } else if (relClass === 'peer' || relClass === 'junior') {
    if (flags.includes('overly_formal_to_peer')) s = 2;      // 과공 → 거리감
    else if (honorific.haeyo && !honorific.banmal) s = 4;     // 가벼운 존댓말이 적절
    else if (honorific.banmal) s = 3;
  }
  return clamp5(s);
}

function estimateStrategy({ cushions, style }) {
  let s = 3;
  if (style.sentenceCount >= 2 && style.charLen >= 20 && style.charLen <= 400) s += 1; // 최소한의 구조
  if (cushions.count >= 1) s += 0.5;
  if (style.charLen < 12) s -= 1;              // 너무 짧아 요청·근거가 부실
  if (style.hasColloquial) s -= 0.5;
  return clamp5(s);
}
