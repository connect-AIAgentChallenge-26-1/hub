const RESPONSE_TEMPLATES = Object.freeze({
  continue_task: "요청한 작업을 이어서 처리할게.",
  request_clarification:
    "현재 정보만으로는 다음 행동을 정하기 어려워. 원하는 결과를 한 가지 더 알려줘.",
  verify_context:
    "이전 맥락과 현재 요청이 어떻게 이어지는지 먼저 확인할게.",
  ask_priority:
    "동시에 고려할 목표가 여러 개야. 무엇을 먼저 처리할지 정해줘.",
  explore_topic:
    "아직 확인하지 않은 방향이 있어. 관련 정보를 한 가지 더 살펴볼게.",
  reduce_scope:
    "현재 처리 범위를 줄이고 가장 중요한 부분부터 진행할게.",
  pause_or_recover:
    "연속성을 확인할 시간이 필요해. 현재까지의 기록을 먼저 점검할게.",
  acknowledge_observation:
    "새로운 관찰값을 확인했어. 다음 행동을 정하기 전에 변화 여부를 살펴볼게."
});

export function generateAgentResponseTemplate(actionType) {
  return (
    RESPONSE_TEMPLATES[actionType] ||
    "현재 입력을 기록하고 다음 행동 조건을 확인할게."
  );
}
