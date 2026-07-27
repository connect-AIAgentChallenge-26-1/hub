'use client';

import { useMemo } from 'react';

import { usePlannerStore } from '../../stores/usePlannerStore';
import type { DayKey, Task, TimeBlock } from '../../types/planner';

export interface CalendarBusySlot {
  id: string;
  title: string;
  start: number;
  end: number;
}

interface TimeBlockTimelineProps {
  day?: DayKey;
  meetings?: CalendarBusySlot[];
}

interface MinuteRange {
  start: number;
  end: number;
}

const MINUTES_PER_DAY = 24 * 60;

const toMinutes = (value: string, fallback: number): number => {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return fallback;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return fallback;
  return hours * 60 + minutes;
};

const formatMinutes = (minutes: number): string => {
  const safeMinutes = Math.max(0, Math.min(minutes, MINUTES_PER_DAY - 1));
  const hours = Math.floor(safeMinutes / 60);
  const remainder = safeMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
};

const mergeBusySlots = (
  slots: CalendarBusySlot[],
  windowStart: number,
  windowEnd: number,
): MinuteRange[] => {
  const normalized = slots
    .map((slot) => ({
      start: Math.max(windowStart, Math.min(slot.start, windowEnd)),
      end: Math.max(windowStart, Math.min(slot.end, windowEnd)),
    }))
    .filter((slot) => slot.end > slot.start)
    .sort((a, b) => a.start - b.start);

  return normalized.reduce<MinuteRange[]>((merged, slot) => {
    const previous = merged.at(-1);
    if (!previous || slot.start > previous.end) {
      merged.push({ ...slot });
    } else {
      previous.end = Math.max(previous.end, slot.end);
    }
    return merged;
  }, []);
};

export const calculateFreeSlots = (
  windowStart: number,
  windowEnd: number,
  meetings: CalendarBusySlot[],
): MinuteRange[] => {
  if (windowEnd <= windowStart) return [];

  const busySlots = mergeBusySlots(meetings, windowStart, windowEnd);
  const freeSlots: MinuteRange[] = [];
  let cursor = windowStart;

  busySlots.forEach((slot) => {
    if (cursor < slot.start) freeSlots.push({ start: cursor, end: slot.start });
    cursor = Math.max(cursor, slot.end);
  });

  if (cursor < windowEnd) freeSlots.push({ start: cursor, end: windowEnd });
  return freeSlots;
};

const toPriority = (urgency: number): TimeBlock['priority'] => {
  if (urgency >= 3) return 'High';
  if (urgency === 2) return 'Medium';
  return 'Low';
};

export const buildAutomaticTimeBlocks = ({
  tasks,
  meetings,
  windowStart,
  windowEnd,
}: {
  tasks: Task[];
  meetings: CalendarBusySlot[];
  windowStart: number;
  windowEnd: number;
}): TimeBlock[] => {
  const freeSlots = calculateFreeSlots(windowStart, windowEnd, meetings).map(
    (slot) => ({ ...slot }),
  );
  const pendingTasks = tasks
    .filter((task) => !task.done)
    .sort(
      (a, b) =>
        b.urgency - a.urgency ||
        a.durationMinutes - b.durationMinutes ||
        a.text.localeCompare(b.text, 'ko'),
    );

  let overflowCursor = windowEnd;

  return pendingTasks.map((task) => {
    const duration = Math.max(5, Math.round(task.durationMinutes || 25));
    const freeSlot = freeSlots.find(
      (slot) => slot.end - slot.start >= duration,
    );

    if (freeSlot) {
      const start = freeSlot.start;
      const end = start + duration;
      freeSlot.start = end;

      return {
        id: `auto-${task.id}`,
        start,
        end,
        task: task.text,
        priority: toPriority(task.urgency),
        overflow: false,
      };
    }

    const start = overflowCursor;
    const end = start + duration;
    overflowCursor = end;

    return {
      id: `auto-${task.id}`,
      start,
      end,
      task: task.text,
      priority: toPriority(task.urgency),
      overflow: true,
    };
  });
};

export function TimeBlockTimeline({
  day,
  meetings = [],
}: TimeBlockTimelineProps) {
  const currentDay = usePlannerStore((state) => state.currentDay);
  const targetDay = day ?? currentDay;
  const tasks = usePlannerStore((state) => state.plans[targetDay].tasks);
  const scheduleWindow = usePlannerStore(
    (state) => state.dayScheduleWindows[targetDay],
  );
  const timeBlocks = usePlannerStore((state) => state.timeBlocks[targetDay]);
  const setTimeBlocks = usePlannerStore((state) => state.setTimeBlocks);

  const windowStart = toMinutes(scheduleWindow.plannedStart, 9 * 60);
  const windowEnd = toMinutes(scheduleWindow.plannedEnd, 18 * 60);
  const validWindowEnd = windowEnd > windowStart ? windowEnd : windowStart + 60;
  const windowDuration = validWindowEnd - windowStart;

  const freeSlots = useMemo(
    () => calculateFreeSlots(windowStart, validWindowEnd, meetings),
    [meetings, validWindowEnd, windowStart],
  );

  const pendingCount = tasks.filter((task) => !task.done).length;
  const scheduledMinutes = timeBlocks
    .filter((block) => !block.overflow)
    .reduce((total, block) => total + (block.end - block.start), 0);
  const overflowBlocks = timeBlocks.filter((block) => block.overflow);

  const handleAutoArrange = () => {
    setTimeBlocks(
      targetDay,
      buildAutomaticTimeBlocks({
        tasks,
        meetings,
        windowStart,
        windowEnd: validWindowEnd,
      }),
    );
  };

  return (
    <section className="rounded-[2rem] border-2 border-cyan-950 bg-cyan-50 p-5 shadow-[6px_6px_0_#164e63] sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs font-black uppercase tracking-[0.2em] text-cyan-700">
            1-Click Time Blocking
          </p>
          <h2 className="mt-1 text-xl font-black text-slate-950">
            빈 시간 자동 타임블로킹
          </h2>
          <p className="mt-2 text-sm font-semibold text-slate-600">
            공백 = 근무 시간창 − 회의 시간, 긴급도가 높은 미완료 작업부터 배치합니다.
          </p>
        </div>

        <button
          type="button"
          onClick={handleAutoArrange}
          disabled={pendingCount === 0}
          className="rounded-xl border-2 border-slate-950 bg-slate-950 px-5 py-3 text-sm font-black text-cyan-100 shadow-[3px_3px_0_#67e8f9] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
        >
          ⚡ 1-Click 자동 배치
        </button>
      </header>

      <div className="mt-5 grid grid-cols-3 gap-2">
        <Metric label="미완료 작업" value={`${pendingCount}개`} />
        <Metric
          label="사용 가능 공백"
          value={`${freeSlots.reduce((sum, slot) => sum + slot.end - slot.start, 0)}분`}
        />
        <Metric label="배치된 몰입" value={`${scheduledMinutes}분`} />
      </div>

      <div className="mt-6 overflow-x-auto pb-2">
        <div className="min-w-[680px]">
          <div className="relative h-14 border-x-2 border-cyan-950">
            {Array.from({ length: 7 }, (_, index) => {
              const minute = windowStart + (windowDuration * index) / 6;
              return (
                <div
                  key={index}
                  className="absolute top-0 h-full border-l border-dashed border-cyan-300"
                  style={{ left: `${(index / 6) * 100}%` }}
                >
                  <span className="-translate-x-1/2 bg-cyan-50 px-1 font-mono text-[11px] font-black text-cyan-800">
                    {formatMinutes(Math.round(minute))}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="relative h-36 overflow-hidden rounded-2xl border-2 border-cyan-950 bg-white">
            {meetings.map((meeting) => {
              const left =
                ((Math.max(meeting.start, windowStart) - windowStart) /
                  windowDuration) *
                100;
              const width =
                ((Math.min(meeting.end, validWindowEnd) -
                  Math.max(meeting.start, windowStart)) /
                  windowDuration) *
                100;
              if (width <= 0) return null;

              return (
                <div
                  key={meeting.id}
                  className="absolute top-2 h-10 overflow-hidden rounded-lg border-2 border-slate-800 bg-slate-800 px-2 py-1 text-xs font-black text-white"
                  style={{ left: `${left}%`, width: `${width}%` }}
                  title={`${meeting.title} ${formatMinutes(meeting.start)}–${formatMinutes(meeting.end)}`}
                >
                  회의 · {meeting.title}
                </div>
              );
            })}

            {timeBlocks
              .filter((block) => !block.overflow)
              .map((block, index) => (
                <div
                  key={block.id}
                  className="absolute top-16 h-14 overflow-hidden rounded-xl border-2 border-cyan-900 bg-cyan-200 px-2 py-1 text-xs font-black text-cyan-950 shadow-[2px_2px_0_#164e63]"
                  style={{
                    left: `${((block.start - windowStart) / windowDuration) * 100}%`,
                    width: `${Math.max(
                      ((block.end - block.start) / windowDuration) * 100,
                      2,
                    )}%`,
                    transform: `translateY(${(index % 2) * 4}px)`,
                  }}
                  title={`${block.task} ${formatMinutes(block.start)}–${formatMinutes(block.end)}`}
                >
                  <span className="block truncate">{block.task}</span>
                  <span className="font-mono text-[10px] text-cyan-800">
                    {formatMinutes(block.start)}–{formatMinutes(block.end)}
                  </span>
                </div>
              ))}

            {timeBlocks.length === 0 && (
              <p className="grid h-full place-items-center text-sm font-bold text-cyan-700">
                버튼을 누르면 미완료 작업이 회의 사이에 자동 배치됩니다.
              </p>
            )}
          </div>
        </div>
      </div>

      {overflowBlocks.length > 0 && (
        <div className="mt-4 rounded-2xl border-2 border-amber-700 bg-amber-50 p-4">
          <p className="text-sm font-black text-amber-900">
            시간창 밖으로 넘어간 작업 {overflowBlocks.length}개
          </p>
          <p className="mt-1 text-xs font-bold text-amber-800">
            {overflowBlocks.map((block) => block.task).join(' · ')}
          </p>
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border-2 border-cyan-900 bg-white px-3 py-3 text-center">
      <p className="text-[11px] font-bold text-slate-500">{label}</p>
      <p className="mt-1 font-mono text-base font-black text-cyan-950">
        {value}
      </p>
    </div>
  );
}
