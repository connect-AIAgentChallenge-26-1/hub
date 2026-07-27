'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { sanitizeForStorage, validateCoachOutput } = require('../server');

function validCoachOutput() {
  return {
    reply: '첫 작업을 25분 진행하세요.',
    conditionSuggestion: {
      enabled: false,
      energyLevel: '',
      fatigueLevel: '',
      estimatedMinutes: 0,
      summary: '',
      actions: []
    },
    retrospective: {
      summary: '일정을 정리했습니다.',
      wins: ['우선순위를 정했습니다.'],
      risks: [],
      coachComment: '바로 시작하세요.'
    },
    nextDaySuggestion: {
      day: 'tue',
      title: '내일 계획',
      tasks: ['복습 25분'],
      note: '승인 후 반영합니다.'
    },
    planUpdates: [],
    taskUpdates: [],
    recommendations: [{
      type: 'focus',
      title: '집중 시작',
      message: '25분 타이머를 시작합니다.',
      metrics: '25분',
      taskText: '복습',
      items: [],
      toDay: 'mon'
    }]
  };
}

test('AI JSON 응답의 필수 구조를 통과시키고 알 수 없는 요일은 거부한다', () => {
  const output = validCoachOutput();
  assert.deepEqual(validateCoachOutput(output), output);

  const invalid = validCoachOutput();
  invalid.recommendations[0].toDay = 'sun';
  assert.throws(() => validateCoachOutput(invalid), /요일 값이 올바르지 않습니다/);
});

test('DB 저장용 페이로드는 중첩된 보안 키와 개인정보를 제거한다', () => {
  const sanitized = sanitizeForStorage({
    message: '연락처 010-9876-5432, 이메일 owner@example.com',
    passiveContext: {
      apiKey: 'sk-abcdefghijklmnop',
      refreshToken: 'sb_secret_abcdefghijklmnop'
    }
  });

  assert.equal(sanitized.passiveContext.apiKey, '[보안정보 저장 안 함]');
  assert.equal(sanitized.passiveContext.refreshToken, '[보안정보 저장 안 함]');
  assert.equal(sanitized.message.includes('010-9876-5432'), false);
  assert.equal(sanitized.message.includes('owner@example.com'), false);
});
