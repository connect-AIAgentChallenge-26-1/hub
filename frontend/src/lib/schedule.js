// 스케줄 에이전트(b) — 시드 + v1.5 주간 분산.
// 매칭된 학습법 TOP → 오늘의 시간블록으로 구성한다(규칙 기반).
// 상세 시간표·생활 스케줄(에브리타임식)은 v1.5 완주 후 재검토한다(§C-2, docs/backlog.md).

export function buildDailySchedule(recommendations = [], routine = {}, { availableMinutes } = {}) {
  // 가용시간(task/state 입력) 입력 시 짧은 시간일수록 집중 블록을 좁힌다. 미입력 시 기존 규칙 유지.
  const focusMinutes = availableMinutes
    ? Math.max(15, Math.min(25, Math.floor(availableMinutes / 2)))
    : routine.estimatedMinutes >= 28
      ? 25
      : 20;
  const recoveryMinutes = routine.recoveryMinutes ?? 3;

  const blocks = recommendations.slice(0, 2).map((rec, index) => ({
    order: index + 1,
    kind: "focus",
    minutes: focusMinutes,
    title: rec.title,
    text: rec.action,
  }));

  blocks.push({
    order: blocks.length + 1,
    kind: "recovery",
    minutes: recoveryMinutes,
    title: "회복",
    text: routine.recoveryStep ?? "짧게 자리에서 일어나 몸을 풀고 다음 재료 1개만 남깁니다.",
  });

  const totalMinutes = blocks.reduce((sum, block) => sum + block.minutes, 0);
  return { blocks, totalMinutes };
}

// 하루 스케줄 생성기(최소 슬라이스, §C-2 backlog). 24h에서 필수시간(수면·수업·식사 등)을 빼고,
// 남는 가용시간에 추천 학습법 블록을 배치한다. 순수 함수(입력→출력)로 두어 단위 테스트가 쉽다(이슈 #19).
// 알림·캘린더 연동은 하지 않는다(하드룰). 결과는 "오늘 이만큼 쓸 수 있다 + 이렇게 나눠보자" 제안 수준.
export function buildDayPlan({ essentialHours = {}, recommendations = [], routine = {} } = {}) {
  // 필수시간 합계(시간). 음수·과대 입력을 방어하고 하루 총량(24h)을 넘지 않게 자른다.
  const essentialTotal = Object.values(essentialHours).reduce(
    (sum, hours) => sum + Math.max(0, Number(hours) || 0),
    0,
  );
  const clampedEssential = Math.min(24, essentialTotal);
  const freeMinutes = Math.max(0, Math.round((24 - clampedEssential) * 60));

  // 하루에 다 공부에 쓰지 않는다: 가용시간의 일부(기본 40%, 상한 180분)만 학습 블록으로 제안.
  const studyBudget = Math.min(180, Math.round(freeMinutes * 0.4));
  const focusMinutes = routine.estimatedMinutes >= 28 ? 25 : 20;
  const recoveryMinutes = routine.recoveryMinutes ?? 3;

  const blocks = [];
  let used = 0;
  for (const rec of recommendations.slice(0, 3)) {
    if (used + focusMinutes > studyBudget) break;
    blocks.push({
      order: blocks.length + 1,
      kind: "focus",
      minutes: focusMinutes,
      title: rec.title,
      text: rec.plain ?? rec.action,
    });
    used += focusMinutes;
  }

  if (blocks.length > 0 && used + recoveryMinutes <= studyBudget + recoveryMinutes) {
    blocks.push({
      order: blocks.length + 1,
      kind: "recovery",
      minutes: recoveryMinutes,
      title: "회복",
      text: routine.recoveryStep ?? "짧게 일어나 몸을 풀고 다음 재료 1개만 남깁니다.",
    });
    used += recoveryMinutes;
  }

  const note =
    freeMinutes === 0
      ? "필수시간 합이 24시간 이상이라 남는 시간이 없습니다. 필수시간을 다시 확인해보세요."
      : blocks.length === 0
        ? `오늘 자유시간은 약 ${Math.round(freeMinutes / 60 * 10) / 10}시간입니다. 우선 20분 블록 하나부터 넣어보세요.`
        : `오늘 자유시간 약 ${Math.round(freeMinutes / 60 * 10) / 10}시간 중 ${used}분을 학습·회복으로 제안했습니다. 나머지는 여유·다른 일에 쓰세요.`;

  return { freeMinutes, studyMinutes: used, blocks, note };
}

// v1.5: 주간 타임테이블 골격(#29). buildDayPlan 블록을 한 주에 "분산"해 배치한다.
// 정확한 시계 시각·알림·캘린더는 하지 않는다(하드룰) — 거친 시간대(아침/오후/저녁) × 요일 그리드 골격만 제안한다.
export const WEEKLY_SLOTS = ["아침", "오후", "저녁"];
export const WEEKDAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

export function buildWeeklyTimetable({ dayPlan = {}, weeklyPlan = {} } = {}) {
  const blocks = Array.isArray(dayPlan.blocks) ? dayPlan.blocks : [];
  const focusBlocks = blocks.filter((block) => block.kind === "focus");
  const recovery = blocks.find((block) => block.kind === "recovery");

  // 분산 학습(F1·A4): 학습을 이틀 간격(월·수·금)으로 벌린다. 마감이 오늘이면 앞쪽 이틀로 압축.
  const compressed = weeklyPlan.compressed === true;
  const studyDayIndexes = compressed ? [0, 1] : [0, 2, 4];

  const days = WEEKDAY_LABELS.map((label, index) => {
    const cells = { 아침: null, 오후: null, 저녁: null };
    if (focusBlocks.length > 0 && studyDayIndexes.includes(index)) {
      // 학습 블록은 오후에 순환 배치, 회복은 같은 날 저녁.
      const rank = studyDayIndexes.indexOf(index);
      const block = focusBlocks[rank % focusBlocks.length];
      cells["오후"] = { title: block.title, minutes: block.minutes, kind: "focus" };
      if (recovery) {
        cells["저녁"] = { title: recovery.title, minutes: recovery.minutes, kind: "recovery" };
      }
    }
    return { label, cells };
  });

  const note =
    focusBlocks.length === 0
      ? "먼저 오늘 자유시간에 20분 학습 블록 하나를 넣으면 주간 배치가 만들어집니다."
      : compressed
        ? "마감이 가까워 학습을 앞쪽 이틀에 모았습니다. 다음 과제부터는 사흘로 벌려 더 오래 남기세요(분산·인출)."
        : "같은 내용을 몰아보지 않고 월·수·금으로 벌려 다시 떠올리도록 배치했습니다(분산·인출, F1·A4).";

  return { slots: WEEKLY_SLOTS, days, note, compressed };
}

// v1.5: 분산·인출 재현 시점을 사흘에 걸쳐 배치한다(§C-2). [F1] 분산연습 최고효용, [A4] 인출간격 이점.
// 마감이 오늘이면 분산할 시간이 없으므로 압축 안내로 대체한다 — 실제 알림·캘린더 연동은 하지 않는다(하드룰).
export function buildWeeklyPlan(recommendations = [], { deadline } = {}) {
  const topTitle = recommendations[0]?.title ?? "핵심 학습법";

  if (deadline === "today") {
    return {
      compressed: true,
      note: "마감이 오늘이라 이번 내용은 분산 없이 오늘 안에 마무리합니다. 분산 재인출은 다음 과제부터 적용해볼 수 있습니다.",
      checkpoints: [],
    };
  }

  return {
    compressed: false,
    note: "같은 내용을 하루에 몰아보지 않고 사흘에 걸쳐 다시 떠올리면 더 오래 남을 수 있습니다(분산·인출 효과, [F1][A4]).",
    checkpoints: [
      { day: "오늘", label: `${topTitle} 방식으로 처음 익히기` },
      { day: "내일", label: "오늘 배운 내용을 5분 인출로 되짚기" },
      { day: "이틀 뒤", label: "다시 5분 인출로 확인하고, 막힌 부분만 재학습" },
    ],
  };
}
