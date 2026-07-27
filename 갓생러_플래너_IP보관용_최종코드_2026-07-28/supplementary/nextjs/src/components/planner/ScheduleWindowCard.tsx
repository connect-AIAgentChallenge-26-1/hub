'use client';

import { useMemo } from 'react';

import { usePlannerStore } from '../../stores/usePlannerStore';
import type { DayKey } from '../../types/planner';

interface ScheduleWindowCardProps {
  day: DayKey;
}

const toMinutes = (value: string): number | null => {
  if (!/^\d{2}:\d{2}$/.test(value)) return null;

  const [hours, minutes] = value.split(':').map(Number);
  if (hours > 23 || minutes > 59) return null;

  return hours * 60 + minutes;
};

export function ScheduleWindowCard({ day }: ScheduleWindowCardProps) {
  const window = usePlannerStore((state) => state.dayScheduleWindows[day]);
  const updateScheduleWindow = usePlannerStore(
    (state) => state.updateScheduleWindow,
  );

  const delayMinutes = useMemo(() => {
    const plannedEnd = toMinutes(window.plannedEnd);
    const actualEnd = toMinutes(window.actualEnd);

    if (plannedEnd === null || actualEnd === null) return null;
    return actualEnd - plannedEnd;
  }, [window.actualEnd, window.plannedEnd]);

  const resultLabel =
    delayMinutes === null
      ? '실제 종료 시각을 입력하면 지연을 계산합니다.'
      : delayMinutes > 0
        ? `${delayMinutes}분 지연`
        : delayMinutes < 0
          ? `${Math.abs(delayMinutes)}분 일찍 종료`
          : '예정대로 종료';

  return (
    <section className="rounded-3xl border-2 border-cyan-950 bg-cyan-50 p-5 shadow-[5px_5px_0_#164e63] sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-xs font-black uppercase tracking-[0.2em] text-cyan-700">
            Time Window
          </p>
          <h2 className="mt-1 text-lg font-black text-slate-900">
            예상·실제 시간창
          </h2>
        </div>

        <span
          className={`rounded-full border-2 px-3 py-1 font-mono text-xs font-black ${
            delayMinutes !== null && delayMinutes > 0
              ? 'border-rose-700 bg-rose-100 text-rose-800'
              : 'border-cyan-800 bg-white text-cyan-900'
          }`}
        >
          {resultLabel}
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <TimeInput
          id={`${day}-planned-start`}
          label="예상 시작"
          value={window.plannedStart}
          onChange={(plannedStart) =>
            updateScheduleWindow(day, { plannedStart })
          }
        />
        <TimeInput
          id={`${day}-planned-end`}
          label="예상 종료"
          value={window.plannedEnd}
          onChange={(plannedEnd) => updateScheduleWindow(day, { plannedEnd })}
        />
        <TimeInput
          id={`${day}-actual-end`}
          label="실제 종료"
          value={window.actualEnd}
          onChange={(actualEnd) => updateScheduleWindow(day, { actualEnd })}
        />
      </div>
    </section>
  );
}

interface TimeInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}

function TimeInput({ id, label, value, onChange }: TimeInputProps) {
  return (
    <label
      htmlFor={id}
      className="block rounded-2xl border-2 border-cyan-900 bg-white p-3"
    >
      <span className="mb-2 block text-xs font-extrabold text-cyan-900">
        {label}
      </span>
      <input
        id={id}
        type="time"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 font-mono font-bold text-slate-900 outline-none transition focus:border-cyan-700 focus:ring-4 focus:ring-cyan-100"
      />
    </label>
  );
}
