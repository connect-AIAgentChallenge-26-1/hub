'use client';

import { useState, type FormEvent } from 'react';

import { usePlannerStore } from '../../stores/usePlannerStore';
import type { DayKey } from '../../types/planner';
import { ScheduleWindowCard } from './ScheduleWindowCard';
import { TaskItem } from './TaskItem';

const DAY_LABELS: Record<DayKey, string> = {
  mon: '월',
  tue: '화',
  wed: '수',
  thu: '목',
  fri: '금',
};

const DAY_KEYS = Object.keys(DAY_LABELS) as DayKey[];

export function PlanBoard() {
  const [quickTask, setQuickTask] = useState('');

  const currentDay = usePlannerStore((state) => state.currentDay);
  const currentPlan = usePlannerStore((state) => state.plans[currentDay]);
  const setCurrentDay = usePlannerStore((state) => state.setCurrentDay);
  const addTask = usePlannerStore((state) => state.addTask);

  const completedCount = currentPlan.tasks.filter((task) => task.done).length;

  const handleQuickAdd = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = quickTask.trim();
    if (!text) return;

    addTask(currentDay, {
      text,
      done: false,
      durationMinutes: 25,
      urgency: 2,
      details: [],
      source: 'manual',
    });
    setQuickTask('');
  };

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:py-12">
      <header className="mb-6 rounded-[2rem] border-2 border-cyan-950 bg-gradient-to-br from-cyan-100 via-teal-50 to-white p-5 shadow-[7px_7px_0_#164e63] sm:p-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-xs font-black uppercase tracking-[0.24em] text-cyan-700">
              Weekly Planner
            </p>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
              갓생러 플랜 보드
            </h1>
          </div>

          <div className="rounded-2xl border-2 border-cyan-900 bg-white px-4 py-2 text-right">
            <p className="text-xs font-bold text-slate-500">오늘 완료</p>
            <p className="font-mono text-lg font-black text-cyan-900">
              {completedCount}/{currentPlan.tasks.length}
            </p>
          </div>
        </div>
      </header>

      <nav
        aria-label="요일 선택"
        className="mb-6 grid grid-cols-5 gap-2 rounded-3xl border-2 border-cyan-950 bg-slate-950 p-2 shadow-[5px_5px_0_#67e8f9]"
      >
        {DAY_KEYS.map((day) => {
          const isActive = currentDay === day;

          return (
            <button
              key={day}
              type="button"
              onClick={() => setCurrentDay(day)}
              aria-pressed={isActive}
              className={`rounded-2xl border-2 px-2 py-3 text-sm font-black transition sm:text-base ${
                isActive
                  ? '-translate-y-0.5 border-cyan-950 bg-cyan-300 text-slate-950 shadow-[3px_3px_0_#ecfeff]'
                  : 'border-transparent bg-slate-900 text-cyan-100 hover:border-cyan-300 hover:bg-slate-800'
              }`}
            >
              {DAY_LABELS[day]}
            </button>
          );
        })}
      </nav>

      <ScheduleWindowCard day={currentDay} />

      <section className="mt-7">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-xs font-black uppercase tracking-[0.2em] text-cyan-700">
              {currentDay.toUpperCase()} Checklist
            </p>
            <h2 className="mt-1 text-xl font-black text-slate-950">
              {currentPlan.title || `${DAY_LABELS[currentDay]}요일 계획`}
            </h2>
            {currentPlan.description && (
              <p className="mt-1 text-sm font-medium text-slate-600">
                {currentPlan.description}
              </p>
            )}
          </div>
        </div>

        <form
          onSubmit={handleQuickAdd}
          className="mb-5 grid gap-2 rounded-2xl border-2 border-cyan-900 bg-cyan-100 p-3 shadow-[4px_4px_0_#164e63] sm:grid-cols-[1fr_auto]"
        >
          <input
            value={quickTask}
            onChange={(event) => setQuickTask(event.target.value)}
            placeholder="오늘 할 일을 빠르게 추가하세요."
            aria-label="할 일 빠른 추가"
            className="min-w-0 rounded-xl border-2 border-cyan-200 bg-white px-4 py-3 font-bold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-cyan-800 focus:ring-4 focus:ring-white/80"
          />
          <button
            type="submit"
            className="rounded-xl border-2 border-slate-950 bg-slate-950 px-6 py-3 font-black text-cyan-100 transition hover:-translate-y-0.5 hover:bg-cyan-950"
          >
            + Quick Add
          </button>
        </form>

        {currentPlan.tasks.length > 0 ? (
          <ul className="space-y-4">
            {currentPlan.tasks.map((task) => (
              <TaskItem key={task.id} day={currentDay} task={task} />
            ))}
          </ul>
        ) : (
          <div className="rounded-3xl border-2 border-dashed border-cyan-400 bg-cyan-50 px-5 py-12 text-center">
            <p className="text-4xl" aria-hidden="true">
              ◌
            </p>
            <p className="mt-3 font-black text-cyan-950">
              아직 등록된 할 일이 없습니다.
            </p>
            <p className="mt-1 text-sm font-medium text-cyan-800">
              Quick Add로 첫 25분 작업을 만들어 보세요.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
