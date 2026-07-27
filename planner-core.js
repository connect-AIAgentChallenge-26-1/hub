(function attachPlannerCore(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.PlannerCore = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createPlannerCore() {
    'use strict';

    function countRemaining(tasks) {
        if (!Array.isArray(tasks)) return 0;
        return tasks.filter((task) => task && task.done !== true).length;
    }

    function computeCompletionPercent(tasks) {
        if (!Array.isArray(tasks) || !tasks.length) return 0;
        const completed = tasks.filter((task) => task && task.done === true).length;
        return Math.round((completed / tasks.length) * 100);
    }

    function sanitizeSensitiveText(value) {
        return String(value || '')
            .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[이메일 보호됨]')
            .replace(/(?:\+?82[-\s]?)?0?1[016789][-\s]?\d{3,4}[-\s]?\d{4}/g, '[연락처 보호됨]')
            .replace(/(?:sk-|sb_secret_|eyJ)[A-Za-z0-9._-]{12,}/g, '[보안 토큰 보호됨]');
    }

    function extractTitleFromInstruction(instruction) {
        const clean = String(instruction || '')
            .replace(/\s+/g, ' ')
            .replace(/^(오늘|내일|이번 주)\s*/g, '')
            .trim();
        if (!clean) return '';
        const firstClause = clean.split(/[.!?。]|(?:해\s*줘)|(?:해주세요)|(?:해 줘)/)[0].trim();
        return firstClause.slice(0, 46) || clean.slice(0, 46);
    }

    function isValidTimeLabel(value) {
        if (typeof value !== 'string') return false;
        const match = value.match(/^(\d{2}):(\d{2})$/);
        if (!match) return false;
        const hours = Number(match[1]);
        const minutes = Number(match[2]);
        return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
    }

    function hhmmToMinutes(value) {
        if (!isValidTimeLabel(value)) return null;
        const [hours, minutes] = value.split(':').map(Number);
        return hours * 60 + minutes;
    }

    function createPlannerTask(input = {}) {
        const text = typeof input.text === 'string' ? input.text.trim() : '';
        if (!text) return null;
        const rawDetails = Array.isArray(input.details) ? input.details : [];
        const rawDetailDone = Array.isArray(input.detailDone) ? input.detailDone : [];
        const details = [];
        const detailDone = [];
        rawDetails.forEach((detail, index) => {
            if (
                typeof detail === 'string'
                && detail.trim()
                && !/^이미지 OCR \d+번째 인식 문장$/i.test(detail.trim())
                && !/^인식 원문:/i.test(detail.trim())
            ) {
                details.push(detail.trim());
                detailDone.push(Boolean(input.done) || Boolean(rawDetailDone[index]));
            }
        });
        const urgencyValue = Number(input.urgency);
        const durationValue = Number(input.durationMinutes);
        return {
            text,
            done: details.length ? detailDone.every(Boolean) : Boolean(input.done),
            details,
            detailDone,
            urgency: Number.isFinite(urgencyValue) ? Math.max(1, Math.min(5, Math.round(urgencyValue))) : 2,
            durationMinutes: Number.isFinite(durationValue) ? Math.max(5, Math.min(240, Math.round(durationValue))) : 30,
            source: input.source === 'upload' ? 'upload' : 'manual'
        };
    }

    function setTaskDone(task, done) {
        if (!task || typeof task !== 'object') return task;
        const nextDone = Boolean(done);
        const detailCount = Array.isArray(task.details) ? task.details.length : 0;
        task.done = nextDone;
        task.detailDone = Array.from({ length: detailCount }, () => nextDone);
        return task;
    }

    function setSubtaskDone(task, detailIndex, done) {
        if (!task || typeof task !== 'object' || !Array.isArray(task.details)) return task;
        const index = Number(detailIndex);
        if (!Number.isInteger(index) || index < 0 || index >= task.details.length) return task;
        const current = Array.isArray(task.detailDone) ? task.detailDone : [];
        task.detailDone = task.details.map((_, itemIndex) => (
            itemIndex === index ? Boolean(done) : Boolean(current[itemIndex])
        ));
        task.done = task.detailDone.length > 0 && task.detailDone.every(Boolean);
        return task;
    }

    return {
        countRemaining,
        computeCompletionPercent,
        sanitizeSensitiveText,
        extractTitleFromInstruction,
        isValidTimeLabel,
        hhmmToMinutes,
        createPlannerTask,
        setTaskDone,
        setSubtaskDone
    };
}));
