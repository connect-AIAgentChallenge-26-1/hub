'use strict';

const crypto = require('node:crypto');

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri'];
const DAY_LABELS = { mon: '월요일', tue: '화요일', wed: '수요일', thu: '목요일', fri: '금요일' };
const MUTATING_TYPES = new Set(['move', 'delete', 'atomize', 'reorder-light']);

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

function compactText(value, maximum = 240) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maximum);
}

function parseTime(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

function stableHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function inferIntent(message) {
  const text = compactText(message, 2000);
  if (/(삭제|지워|제거)/.test(text)) return 'delete';
  if (/(이동|이월|내일로|옮기)/.test(text)) return 'move';
  if (/(정렬|재배치|조정|최적화|시간표)/.test(text)) return 'reorder';
  if (/(쪼개|세분화|소단위)/.test(text)) return 'atomize';
  if (/(알려|설명|질문|어떻게|무엇|왜)/.test(text)) return 'answer';
  return 'organize';
}

function collectTasks(payload) {
  const tasks = [];
  for (const day of DAY_KEYS) {
    const dayTasks = Array.isArray(payload?.plans?.[day]?.tasks) ? payload.plans[day].tasks : [];
    dayTasks.forEach((task, index) => {
      if (!task || typeof task.text !== 'string' || !task.text.trim()) return;
      tasks.push({
        day,
        index,
        text: compactText(task.text, 200),
        done: Boolean(task.done),
        urgency: clamp(task.urgency || 2, 1, 5),
        durationMinutes: clamp(task.durationMinutes || 30, 5, 480),
        source: task.source === 'upload' ? 'upload' : 'manual',
        sourceName: compactText(task.sourceName, 180),
        sourceRefs: Array.isArray(task.sourceRefs) ? task.sourceRefs.map((item) => compactText(item, 180)).filter(Boolean).slice(0, 8) : [],
        confidence: clamp(task.confidence, 0, 100)
      });
    });
  }
  return tasks;
}

function detectConflicts(payload, tasks) {
  const conflicts = [];
  const currentDay = DAY_KEYS.includes(payload?.currentDay) ? payload.currentDay : 'mon';
  const blocks = Array.isArray(payload?.timeBlocks) ? payload.timeBlocks : [];
  const normalizedBlocks = blocks
    .map((block, index) => ({
      index,
      start: parseTime(block?.start),
      end: parseTime(block?.end),
      task: compactText(block?.task, 180),
      overflow: Boolean(block?.overflow)
    }))
    .filter((block) => block.start !== null && block.end !== null && block.end > block.start)
    .sort((a, b) => a.start - b.start);

  for (let index = 1; index < normalizedBlocks.length; index += 1) {
    const previous = normalizedBlocks[index - 1];
    const current = normalizedBlocks[index];
    if (current.start < previous.end) {
      conflicts.push({
        code: 'TIME_OVERLAP',
        severity: 'high',
        message: `${previous.task || '앞 일정'}과 ${current.task || '뒤 일정'}의 시간이 겹칩니다.`,
        affected: [previous.task, current.task].filter(Boolean)
      });
    }
  }

  normalizedBlocks.filter((block) => block.overflow).forEach((block) => {
    conflicts.push({
      code: 'WINDOW_OVERFLOW',
      severity: 'medium',
      message: `${block.task || '작업'}이 계획 시간창을 벗어납니다.`,
      affected: [block.task].filter(Boolean)
    });
  });

  const delayMinutes = clamp(payload?.scheduleWindow?.delayMinutes, 0, 1440);
  if (delayMinutes >= 20) {
    conflicts.push({
      code: 'ACCUMULATED_DELAY',
      severity: delayMinutes >= 60 ? 'high' : 'medium',
      message: `현재 일정이 ${delayMinutes}분 지연되어 뒤쪽 계획의 재검토가 필요합니다.`,
      affected: tasks.filter((task) => task.day === currentDay && !task.done).slice(0, 5).map((task) => task.text)
    });
  }

  const seen = new Map();
  tasks.filter((task) => !task.done).forEach((task) => {
    const key = task.text.toLowerCase().replace(/\s+/g, '');
    if (!key) return;
    if (seen.has(key) && seen.get(key).day !== task.day) {
      conflicts.push({
        code: 'DUPLICATE_TASK',
        severity: 'low',
        message: `"${task.text}"이 여러 요일에 중복되어 있습니다.`,
        affected: [seen.get(key).text, task.text]
      });
    } else {
      seen.set(key, task);
    }
  });

  const schedule = payload?.scheduleWindow || {};
  const start = parseTime(schedule.plannedStart);
  const end = parseTime(schedule.plannedEnd);
  if (start !== null && end !== null && end > start) {
    const capacity = end - start;
    const demand = tasks.filter((task) => task.day === currentDay && !task.done).reduce((sum, task) => sum + task.durationMinutes, 0);
    if (demand > capacity) {
      conflicts.push({
        code: 'CAPACITY_EXCEEDED',
        severity: demand > capacity * 1.35 ? 'high' : 'medium',
        message: `미완료 작업 ${demand}분이 오늘 가용 시간 ${capacity}분을 초과합니다.`,
        affected: tasks.filter((task) => task.day === currentDay && !task.done).slice(0, 8).map((task) => task.text)
      });
    }
  }

  return conflicts.slice(0, 12);
}

function collectProvenance(payload, tasks) {
  const provenance = [];
  const uploadedTexts = Array.isArray(payload?.requestContext?.uploadedTaskTexts)
    ? payload.requestContext.uploadedTaskTexts
    : [];
  uploadedTexts.slice(0, 12).forEach((text) => provenance.push({
    kind: 'attachment',
    label: compactText(text, 160),
    reference: '이번 요청의 첨부 자료',
    strength: 0.92
  }));

  if (payload?.requestContext?.hasAttachment) {
    const currentUploaded = new Set(uploadedTexts.map((item) => compactText(item, 200)));
    tasks
      .filter((task) => task.source === 'upload' && currentUploaded.has(task.text))
      .slice(0, 12)
      .forEach((task) => provenance.push({
        kind: 'stored-attachment',
        label: task.text,
        reference: task.sourceRefs[0] || task.sourceName || '이번 요청의 첨부 자료',
        strength: task.confidence ? clamp(task.confidence / 100, 0.35, 0.98) : 0.72
      }));
  }

  const memories = Array.isArray(payload?.retrievedMemories) ? payload.retrievedMemories : [];
  memories.slice(0, 5).forEach((memory) => provenance.push({
    kind: 'memory',
    label: compactText(memory?.content, 160),
    reference: compactText(memory?.sourceRef || memory?.sourceName || '장기 기억', 180),
    strength: clamp(memory?.similarity || 0.55, 0.35, 0.95)
  }));

  if (payload?.scheduleWindow) provenance.push({
    kind: 'planner-state',
    label: '현재 일정 시간창과 지연 상태',
    reference: DAY_KEYS.includes(payload?.currentDay) ? `${DAY_LABELS[payload.currentDay]} 일정` : '현재 일정',
    strength: 0.9
  });
  return provenance
    .filter((item, index, array) => array.findIndex((other) => `${other.kind}:${other.label}:${other.reference}` === `${item.kind}:${item.label}:${item.reference}`) === index)
    .slice(0, 16);
}

function findTaskForRecommendation(recommendation, tasks, currentDay) {
  const taskText = compactText(recommendation?.taskText, 200).toLowerCase();
  if (!taskText) return null;
  return tasks.find((task) => task.day === currentDay && task.text.toLowerCase() === taskText)
    || tasks.find((task) => task.text.toLowerCase().includes(taskText) || taskText.includes(task.text.toLowerCase()))
    || null;
}

function scoreRecommendation(recommendation, context) {
  const type = compactText(recommendation?.type, 40) || 'none';
  const task = findTaskForRecommendation(recommendation, context.tasks, context.currentDay);
  const typeImpact = { move: 78, delete: 62, atomize: 72, 'reorder-light': 76, none: 35 }[type] || 50;
  const urgency = task ? task.urgency * 16 : 48;
  const timeSaved = type === 'delete'
    ? (task?.durationMinutes || 30)
    : type === 'atomize' ? 18 : type === 'reorder-light' ? 24 : type === 'move' ? 28 : 5;
  const conflictBenefit = context.conflicts.reduce((sum, conflict) => sum + ({ high: 13, medium: 8, low: 3 }[conflict.severity] || 0), 0);
  const disruption = type === 'delete' ? 44 : type === 'move' ? 32 : type === 'reorder-light' ? 22 : type === 'atomize' ? 12 : 5;
  const evidenceStrength = context.provenance.length
    ? context.provenance.reduce((sum, item) => sum + item.strength, 0) / context.provenance.length
    : 0.46;
  const explicitIntentBonus = context.intent === type || (context.intent === 'reorder' && type === 'reorder-light') ? 14 : 0;
  const feedbackAdjustment = clamp(context.feedback?.[type]?.score || 0, -12, 12);
  const actionValue = clamp(
    typeImpact * 0.34 + urgency * 0.2 + clamp(timeSaved, 0, 90) * 0.2 + conflictBenefit * 0.18
      + explicitIntentBonus + feedbackAdjustment - disruption * 0.18,
    0,
    100
  );
  const confidence = clamp(
    46 + evidenceStrength * 34 + explicitIntentBonus + (task?.confidence || 0) * 0.12
      - context.conflicts.filter((item) => item.severity === 'high').length * 4,
    25,
    98
  );
  const destructive = type === 'delete';
  const riskScore = clamp(disruption + (100 - confidence) * 0.42 + (destructive ? 22 : 0), 0, 100);
  const riskLevel = riskScore >= 65 ? 'high' : riskScore >= 36 ? 'medium' : 'low';
  const mutating = MUTATING_TYPES.has(type);

  return {
    type,
    actionValue: Math.round(actionValue),
    confidence: Math.round(confidence),
    riskScore: Math.round(riskScore),
    riskLevel,
    expectedMinutesSaved: Math.round(timeSaved),
    reversible: mutating,
    requiresConfirmation: mutating || confidence < 82 || riskLevel !== 'low',
    autoExecutable: mutating && !destructive && confidence >= 90 && riskLevel === 'low',
    reasonCodes: [
      explicitIntentBonus ? 'EXPLICIT_USER_INTENT' : 'INFERRED_INTENT',
      context.provenance.length ? 'EVIDENCE_LINKED' : 'PLANNER_CONTEXT_ONLY',
      context.conflicts.length ? 'CONFLICT_REDUCTION' : 'FLOW_OPTIMIZATION',
      destructive ? 'DESTRUCTIVE_ACTION' : 'REVERSIBLE_ACTION'
    ]
  };
}

function buildDecisionBatch({ ownerId, payload, coachOutput, notificationBudget = {}, feedbackProfile = {} }) {
  const tasks = collectTasks(payload);
  const currentDay = DAY_KEYS.includes(payload?.currentDay) ? payload.currentDay : 'mon';
  const intent = inferIntent(payload?.displayMessage || payload?.message);
  const conflicts = detectConflicts(payload, tasks);
  const provenance = collectProvenance(payload, tasks);
  const batchId = crypto.randomUUID();
  const recommendations = Array.isArray(coachOutput?.recommendations) ? coachOutput.recommendations.slice(0, 3) : [];
  const remainingNotifications = Math.max(0, Number(notificationBudget.limit || 3) - Number(notificationBudget.used || 0));

  const decisions = recommendations.map((recommendation, index) => {
    const scoring = scoreRecommendation(recommendation, {
      tasks,
      currentDay,
      intent,
      conflicts,
      provenance,
      feedback: feedbackProfile
    });
    const id = crypto.randomUUID();
    const decisionSignature = crypto.randomBytes(24).toString('base64url');
    const notificationEligible = remainingNotifications > 0
      && index === 0
      && scoring.actionValue >= 72
      && scoring.confidence >= 70
      && conflicts.some((item) => item.severity === 'high');
    const publicProvenance = provenance.slice(0, 4).map((item) => ({
      kind: item.kind,
      label: item.label,
      reference: item.reference,
      strength: Math.round(item.strength * 100)
    }));
    const record = {
      id,
      batchId,
      ownerId,
      index,
      intent,
      status: 'proposed',
      recommendation,
      provenance,
      conflicts,
      ...scoring,
      notificationEligible,
      notificationReason: notificationEligible ? '중요 충돌을 해소하며 오늘 알림 예산이 남아 있습니다.' : '앱 안에서만 제시합니다.',
      createdAt: new Date().toISOString()
    };
    return {
      record,
      public: {
        decisionId: id,
        decisionSignature,
        confidence: scoring.confidence,
        actionValue: scoring.actionValue,
        riskLevel: scoring.riskLevel,
        expectedMinutesSaved: scoring.expectedMinutesSaved,
        reversible: scoring.reversible,
        requiresConfirmation: scoring.requiresConfirmation,
        autoExecutable: scoring.autoExecutable,
        reasonCodes: scoring.reasonCodes,
        evidence: publicProvenance,
        conflicts: conflicts.slice(0, 4),
        notificationEligible,
        notificationRemaining: remainingNotifications
      }
    };
  });

  return {
    batchId,
    intent,
    conflicts,
    provenance,
    decisions,
    metrics: {
      proposed: decisions.length,
      averageConfidence: decisions.length ? Math.round(decisions.reduce((sum, item) => sum + item.record.confidence, 0) / decisions.length) : 0,
      highRiskCount: decisions.filter((item) => item.record.riskLevel === 'high').length,
      conflictCount: conflicts.length,
      evidenceCount: provenance.length,
      notificationRemaining: remainingNotifications
    }
  };
}

function attachDecisionMetadata(coachOutput, batch) {
  const recommendations = (coachOutput.recommendations || []).slice(0, 3).map((recommendation, index) => ({
    ...recommendation,
    ...(batch.decisions[index]?.public || {})
  }));
  return {
    ...coachOutput,
    recommendations,
    decisionBatch: {
      id: batch.batchId,
      intent: batch.intent,
      metrics: batch.metrics,
      conflicts: batch.conflicts.slice(0, 6),
      evidence: batch.provenance.slice(0, 6).map((item) => ({
        kind: item.kind,
        label: item.label,
        reference: item.reference,
        strength: Math.round(item.strength * 100)
      }))
    }
  };
}

module.exports = {
  buildDecisionBatch,
  attachDecisionMetadata,
  detectConflicts,
  inferIntent,
  stableHash
};
