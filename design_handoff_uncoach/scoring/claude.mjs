// 결(結) — Anthropic(Claude) 채점 호출 (프로덕션·테스트 공용)
//
// 2단계 LLM 채점의 실제 호출 로직. api/score.mjs(서버리스)와 live-test.mjs(실호출 테스트)가
// 이 함수를 공유하므로, 테스트가 실제 배포 경로를 그대로 검증한다.
// structured outputs로 JSON을 강제하고 파싱해 반환한다(파이프라인 callClaude 규약: 파싱된 객체 반환).

export const DEFAULT_MODEL = 'claude-opus-4-8'; // 비용이 문제면 'claude-haiku-4-5' / 'claude-sonnet-5'

/**
 * @param {import('@anthropic-ai/sdk').default} client 생성된 Anthropic 클라이언트
 * @param {{model?:string, onMeta?:(m:{usage,model,stop_reason})=>void}} opts
 * @returns {(args:{system,user,schema})=>Promise<object>} 파이프라인용 callClaude
 */
export function createClaudeScorer(client, { model = DEFAULT_MODEL, onMeta } = {}) {
  return async function callClaude({ system, user, schema }) {
    const resp = await client.messages.create({
      model,
      max_tokens: 4096,
      thinking: { type: 'adaptive' }, // 화용 판단은 미묘하므로 적응형 사고 사용
      system,
      messages: [{ role: 'user', content: user }],
      output_config: { format: { type: 'json_schema', schema } },
    });
    // structured outputs는 첫 text 블록이 스키마를 만족하는 JSON임을 보장한다
    const text = (resp.content || []).find(b => b.type === 'text')?.text;
    if (!text) throw new Error('빈 응답: ' + (resp.stop_reason || '알 수 없음'));
    if (onMeta) onMeta({ usage: resp.usage, model: resp.model, stop_reason: resp.stop_reason });
    return JSON.parse(text);
  };
}
