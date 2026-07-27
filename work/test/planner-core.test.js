'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  countRemaining,
  computeCompletionPercent,
  createPlannerTask,
  extractTitleFromInstruction,
  hhmmToMinutes,
  isValidTimeLabel,
  sanitizeSensitiveText,
  setSubtaskDone,
  setTaskDone
} = require('../../frontend-work/planner-core');

test('미완료 작업만 세고 빈 배열은 0을 반환한다', () => {
  const tasks = [
    { text: '강의 듣기', done: false },
    { text: '정리하기', done: true },
    { text: '복습하기', done: false }
  ];

  assert.equal(countRemaining(tasks), 2);
  assert.equal(countRemaining([]), 0);
  assert.equal(countRemaining(null), 0);
});

test('완료율은 반올림하며 작업이 없으면 0%다', () => {
  assert.equal(computeCompletionPercent([
    { done: true },
    { done: false },
    { done: false }
  ]), 33);
  assert.equal(computeCompletionPercent([{ done: true }, { done: true }]), 100);
  assert.equal(computeCompletionPercent([]), 0);
});

test('플래너 작업은 공백을 정리하고 긴급도·시간 범위를 제한한다', () => {
  assert.deepEqual(createPlannerTask({
    text: '  시험범위 복습  ',
    done: 1,
    details: ['1장 읽기', '', 3, '핵심어 표시'],
    urgency: 9,
    durationMinutes: 2,
    source: 'upload'
  }), {
    text: '시험범위 복습',
    done: true,
    details: ['1장 읽기', '핵심어 표시'],
    detailDone: [true, true],
    urgency: 5,
    durationMinutes: 5,
    source: 'upload'
  });

  assert.equal(createPlannerTask({ text: '   ' }), null);
});

test('값이 빠진 작업에는 안전한 기본값을 사용한다', () => {
  assert.deepEqual(createPlannerTask({ text: '메일 정리' }), {
    text: '메일 정리',
    done: false,
    details: [],
    detailDone: [],
    urgency: 2,
    durationMinutes: 30,
    source: 'manual'
  });
});

test('상위 작업과 소단위 체크리스트 완료 상태가 양방향으로 동기화된다', () => {
  const task = createPlannerTask({
    text: '발표 준비',
    details: ['자료 조사', '슬라이드 작성'],
    detailDone: [false, false]
  });

  setSubtaskDone(task, 0, true);
  assert.equal(task.done, false);
  assert.deepEqual(task.detailDone, [true, false]);

  setSubtaskDone(task, 1, true);
  assert.equal(task.done, true);
  assert.deepEqual(task.detailDone, [true, true]);

  setTaskDone(task, false);
  assert.equal(task.done, false);
  assert.deepEqual(task.detailDone, [false, false]);

  setTaskDone(task, true);
  assert.equal(task.done, true);
  assert.deepEqual(task.detailDone, [true, true]);
});

test('스마트 지시문에서 날짜 접두어와 요청 어미를 빼고 제목을 추출한다', () => {
  const title = extractTitleFromInstruction('오늘 2시 회의를 30분 연기하고 일정을 재배치해 줘. 자료도 확인해줘.');
  assert.equal(title, '2시 회의를 30분 연기하고 일정을 재배치');
  assert.equal(extractTitleFromInstruction('   '), '');
  assert.ok(extractTitleFromInstruction('내일 ' + '아주 긴 계획 '.repeat(20)).length <= 46);
});

test('HH:MM 시간 형식의 경계값을 검증하고 분으로 변환한다', () => {
  assert.equal(isValidTimeLabel('00:00'), true);
  assert.equal(isValidTimeLabel('23:59'), true);
  assert.equal(isValidTimeLabel('24:00'), false);
  assert.equal(isValidTimeLabel('09:60'), false);
  assert.equal(isValidTimeLabel('9:30'), false);
  assert.equal(hhmmToMinutes('09:30'), 570);
  assert.equal(hhmmToMinutes('잘못된 값'), null);
});

test('대화 저장 전에 이메일·연락처·API 토큰을 마스킹한다', () => {
  const result = sanitizeSensitiveText(
    'user@example.com 010-1234-5678 sk-abcdefghijklmnop sb_secret_abcdefghijklmnop'
  );

  assert.equal(result.includes('user@example.com'), false);
  assert.equal(result.includes('010-1234-5678'), false);
  assert.equal(result.includes('sk-abcdefghijklmnop'), false);
  assert.match(result, /\[이메일 보호됨\]/);
  assert.match(result, /\[연락처 보호됨\]/);
  assert.match(result, /\[보안 토큰 보호됨\]/);
});
