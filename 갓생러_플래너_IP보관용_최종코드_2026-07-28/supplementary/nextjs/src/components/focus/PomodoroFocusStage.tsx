'use client';

import { useEffect, useRef, useState } from 'react';

const SESSION_SECONDS = 25 * 60;

interface PomodoroFocusStageProps {
  taskName?: string;
  onComplete?: () => void;
}

const formatTime = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
};

export function PomodoroFocusStage({
  taskName = '지금 가장 중요한 한 가지',
  onComplete,
}: PomodoroFocusStageProps) {
  const [remainingSeconds, setRemainingSeconds] = useState(SESSION_SECONDS);
  const [isRunning, setIsRunning] = useState(false);
  const [isOverlayOpen, setIsOverlayOpen] = useState(false);
  const deadlineRef = useRef<number | null>(null);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (!isRunning || deadlineRef.current === null) return;

    const updateTimer = () => {
      const seconds = Math.max(
        0,
        Math.ceil((deadlineRef.current! - Date.now()) / 1000),
      );
      setRemainingSeconds(seconds);

      if (seconds === 0) {
        deadlineRef.current = null;
        setIsRunning(false);
        onCompleteRef.current?.();
      }
    };

    updateTimer();
    const intervalId = window.setInterval(updateTimer, 250);
    return () => window.clearInterval(intervalId);
  }, [isRunning]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) setIsOverlayOpen(false);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () =>
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const startTimer = () => {
    const nextSeconds =
      remainingSeconds > 0 ? remainingSeconds : SESSION_SECONDS;
    if (remainingSeconds === 0) setRemainingSeconds(nextSeconds);
    deadlineRef.current = Date.now() + nextSeconds * 1000;
    setIsRunning(true);
  };

  const pauseTimer = () => {
    if (deadlineRef.current !== null) {
      setRemainingSeconds(
        Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000)),
      );
    }
    deadlineRef.current = null;
    setIsRunning(false);
  };

  const resetTimer = () => {
    deadlineRef.current = null;
    setIsRunning(false);
    setRemainingSeconds(SESSION_SECONDS);
  };

  const enterFocusMode = async () => {
    setIsOverlayOpen(true);
    startTimer();

    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen?.();
      }
    } catch {
      // 고정 오버레이가 동일한 몰입 화면을 제공하므로 권한 거부는 무시합니다.
    }
  };

  const closeFocusMode = async () => {
    setIsOverlayOpen(false);
    pauseTimer();

    try {
      if (document.fullscreenElement) await document.exitFullscreen();
    } catch {
      // 이미 전체 화면이 종료된 경우 별도 처리가 필요하지 않습니다.
    }
  };

  const progress = (SESSION_SECONDS - remainingSeconds) / SESSION_SECONDS;
  const radius = 76;
  const circumference = 2 * Math.PI * radius;

  const timerPanel = (
    <div className="flex flex-col items-center text-center">
      <p className="font-mono text-xs font-black uppercase tracking-[0.26em] text-cyan-700">
        25 Minute Deep Focus
      </p>
      <h2 className="mt-3 max-w-xl text-2xl font-black text-slate-950 sm:text-3xl">
        {taskName}
      </h2>

      <div className="relative mt-8 size-56">
        <svg
          viewBox="0 0 192 192"
          className="-rotate-90 size-full"
          aria-hidden="true"
        >
          <circle
            cx="96"
            cy="96"
            r={radius}
            fill="none"
            stroke="#cffafe"
            strokeWidth="12"
          />
          <circle
            cx="96"
            cy="96"
            r={radius}
            fill="none"
            stroke="#0e7490"
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - progress)}
            className="transition-[stroke-dashoffset] duration-300"
          />
        </svg>
        <time
          dateTime={`PT${remainingSeconds}S`}
          className="absolute inset-0 grid place-content-center font-mono text-5xl font-black tabular-nums text-slate-950"
        >
          {formatTime(remainingSeconds)}
        </time>
      </div>

      <p aria-live="polite" className="mt-5 text-sm font-bold text-slate-600">
        {remainingSeconds === 0
          ? '몰입 세션 완료! 잠시 호흡을 고르세요.'
          : isRunning
            ? '알림을 내려놓고 이 한 가지에만 집중하세요.'
            : '타이머가 일시 정지되었습니다.'}
      </p>

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={isRunning ? pauseTimer : startTimer}
          disabled={remainingSeconds === 0}
          className="rounded-xl border-2 border-slate-950 bg-slate-950 px-6 py-3 font-black text-cyan-100 shadow-[3px_3px_0_#67e8f9] transition hover:-translate-y-0.5 disabled:opacity-40"
        >
          {isRunning ? 'Ⅱ 잠시 멈춤' : '▶ 이어서 집중'}
        </button>
        <button
          type="button"
          onClick={resetTimer}
          className="rounded-xl border-2 border-cyan-900 bg-white px-5 py-3 font-black text-cyan-950 transition hover:bg-cyan-100"
        >
          ↻ 25분 리셋
        </button>
      </div>
    </div>
  );

  return (
    <>
      <section className="rounded-[2rem] border-2 border-cyan-950 bg-white p-6 shadow-[6px_6px_0_#164e63]">
        <div className="flex flex-col items-center justify-between gap-5 sm:flex-row">
          <div>
            <p className="font-mono text-xs font-black uppercase tracking-[0.2em] text-cyan-700">
              Pomodoro Focus Stage
            </p>
            <h2 className="mt-1 text-xl font-black text-slate-950">
              25분 몰입 모드
            </h2>
            <p className="mt-2 text-sm font-semibold text-slate-600">
              {taskName} · 현재 {formatTime(remainingSeconds)}
            </p>
          </div>
          <button
            type="button"
            onClick={enterFocusMode}
            className="w-full rounded-xl border-2 border-slate-950 bg-cyan-300 px-6 py-3 font-black text-slate-950 shadow-[3px_3px_0_#164e63] transition hover:-translate-y-0.5 hover:bg-cyan-200 sm:w-auto"
          >
            ⛶ 몰입 화면 시작
          </button>
        </div>
      </section>

      {isOverlayOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="뽀모도로 몰입 모드"
          className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-[radial-gradient(circle_at_top,#ecfeff_0%,#a5f3fc_40%,#083344_100%)] p-5"
        >
          <button
            type="button"
            onClick={closeFocusMode}
            aria-label="몰입 화면 닫기"
            className="fixed right-5 top-5 grid size-11 place-items-center rounded-full border-2 border-cyan-950 bg-white text-xl font-black text-cyan-950 shadow-[3px_3px_0_#164e63]"
          >
            ×
          </button>
          <div className="w-full max-w-2xl rounded-[2.5rem] border-2 border-cyan-950 bg-white/95 p-7 shadow-[10px_10px_0_#164e63] backdrop-blur sm:p-10">
            {timerPanel}
          </div>
        </div>
      )}
    </>
  );
}
