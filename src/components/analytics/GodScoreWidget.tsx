'use client';

import { useMemo } from 'react';

import { usePlannerStore } from '../../stores/usePlannerStore';
import type { DayKey, GodScoreMetrics } from '../../types/planner';

interface GodScoreWidgetProps {
  day?: DayKey;
  focusedMinutes?: number;
  focusGoalMinutes?: number;
  streakDays?: number;
  streakGoalDays?: number;
}

const clampPercent = (value: number): number =>
  Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));

export const calculateGodScore = ({
  completedTasks,
  totalTasks,
  focusedMinutes,
  focusGoalMinutes,
  streakDays,
  streakGoalDays,
}: {
  completedTasks: number;
  totalTasks: number;
  focusedMinutes: number;
  focusGoalMinutes: number;
  streakDays: number;
  streakGoalDays: number;
}): GodScoreMetrics => {
  const completion = clampPercent(
    totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0,
  );
  const focusAchievement = clampPercent(
    focusGoalMinutes > 0 ? (focusedMinutes / focusGoalMinutes) * 100 : 0,
  );
  const streakBonus = clampPercent(
    streakGoalDays > 0 ? (streakDays / streakGoalDays) * 100 : 0,
  );

  return {
    score: Math.round(
      completion * 0.4 + focusAchievement * 0.4 + streakBonus * 0.2,
    ),
    completion: Math.round(completion),
    focusAchievement: Math.round(focusAchievement),
    streakBonus: Math.round(streakBonus),
  };
};

const getScoreTitle = (score: number): string => {
  if (score >= 90) return '상위권 몰입 달성';
  if (score >= 75) return '갓생 흐름 완성';
  if (score >= 55) return '꾸준한 상승 구간';
  if (score >= 30) return '시동이 걸리는 중';
  return '오늘의 첫 실행이 필요해요';
};

export function GodScoreWidget({
  day,
  focusedMinutes = 0,
  focusGoalMinutes = 120,
  streakDays = 0,
  streakGoalDays = 7,
}: GodScoreWidgetProps) {
  const currentDay = usePlannerStore((state) => state.currentDay);
  const targetDay = day ?? currentDay;
  const tasks = usePlannerStore((state) => state.plans[targetDay].tasks);

  const metrics = useMemo(
    () =>
      calculateGodScore({
        completedTasks: tasks.filter((task) => task.done).length,
        totalTasks: tasks.length,
        focusedMinutes,
        focusGoalMinutes,
        streakDays,
        streakGoalDays,
      }),
    [
      focusGoalMinutes,
      focusedMinutes,
      streakDays,
      streakGoalDays,
      tasks,
    ],
  );

  const radius = 72;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - metrics.score / 100);

  return (
    <section className="rounded-[2rem] border-2 border-cyan-950 bg-gradient-to-br from-white via-cyan-50 to-teal-100 p-5 shadow-[6px_6px_0_#164e63] sm:p-6">
      <div className="flex flex-col items-center gap-6 sm:flex-row">
        <div className="relative size-44 shrink-0">
          <svg
            viewBox="0 0 176 176"
            className="-rotate-90 size-full"
            role="img"
            aria-label={`오늘의 갓생 지수 ${metrics.score}점`}
          >
            <circle
              cx="88"
              cy="88"
              r={radius}
              fill="none"
              stroke="#cffafe"
              strokeWidth="15"
            />
            <circle
              cx="88"
              cy="88"
              r={radius}
              fill="none"
              stroke="#0e7490"
              strokeWidth="15"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              className="transition-[stroke-dashoffset] duration-700 ease-out"
            />
          </svg>

          <div className="absolute inset-0 grid place-content-center text-center">
            <span className="font-mono text-4xl font-black text-slate-950">
              {metrics.score}
            </span>
            <span className="text-xs font-black text-cyan-800">GOD SCORE</span>
          </div>
        </div>

        <div className="w-full min-w-0 flex-1">
          <p className="font-mono text-xs font-black uppercase tracking-[0.2em] text-cyan-700">
            Daily Performance
          </p>
          <h2 className="mt-1 text-2xl font-black text-slate-950">
            {getScoreTitle(metrics.score)}
          </h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
            Score = 완료율 × 0.4 + 몰입도 × 0.4 + 스트릭 × 0.2
          </p>

          <div className="mt-5 grid grid-cols-3 gap-2">
            <ScoreMetric label="완료율 × 40%" value={metrics.completion} />
            <ScoreMetric
              label="몰입도 × 40%"
              value={metrics.focusAchievement}
            />
            <ScoreMetric label="스트릭 × 20%" value={metrics.streakBonus} />
          </div>
        </div>
      </div>
    </section>
  );
}

function ScoreMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border-2 border-cyan-900 bg-white px-2 py-3 text-center">
      <p className="text-[10px] font-extrabold text-slate-500 sm:text-xs">
        {label}
      </p>
      <p className="mt-1 font-mono text-lg font-black text-cyan-950">
        {value}%
      </p>
    </div>
  );
}
