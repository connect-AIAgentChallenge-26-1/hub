'use client';

import { useEffect, useState, type FormEvent } from 'react';

import { usePlannerStore } from '../../stores/usePlannerStore';
import type { DayKey, Task } from '../../types/planner';

interface TaskItemProps {
  day: DayKey;
  task: Task;
}

export function TaskItem({ day, task }: TaskItemProps) {
  const [draftText, setDraftText] = useState(task.text);
  const [newDetail, setNewDetail] = useState('');

  const toggleTask = usePlannerStore((state) => state.toggleTask);
  const removeTask = usePlannerStore((state) => state.removeTask);
  const updateTaskText = usePlannerStore((state) => state.updateTaskText);
  const addTaskDetail = usePlannerStore((state) => state.addTaskDetail);
  const removeTaskDetail = usePlannerStore((state) => state.removeTaskDetail);

  useEffect(() => {
    setDraftText(task.text);
  }, [task.text]);

  const commitText = () => {
    const normalizedText = draftText.trim();

    if (!normalizedText) {
      setDraftText(task.text);
      return;
    }

    if (normalizedText !== task.text) {
      updateTaskText(day, task.id, normalizedText);
      setDraftText(normalizedText);
    }
  };

  const handleAddDetail = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedDetail = newDetail.trim();
    if (!normalizedDetail) return;

    addTaskDetail(day, task.id, normalizedDetail);
    setNewDetail('');
  };

  return (
    <li
      className={`rounded-3xl border-2 p-4 transition sm:p-5 ${
        task.done
          ? 'border-cyan-300 bg-cyan-50/70 opacity-70 shadow-[3px_3px_0_#a5f3fc]'
          : 'border-cyan-950 bg-white shadow-[5px_5px_0_#164e63]'
      }`}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={task.done}
          onChange={() => toggleTask(day, task.id)}
          aria-label={`${task.text} 완료 상태 변경`}
          className="mt-2 size-5 shrink-0 cursor-pointer accent-cyan-700"
        />

        <div className="min-w-0 flex-1">
          <input
            value={draftText}
            onChange={(event) => setDraftText(event.target.value)}
            onBlur={commitText}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
              if (event.key === 'Escape') {
                setDraftText(task.text);
                event.currentTarget.blur();
              }
            }}
            aria-label="할 일 텍스트 수정"
            className={`w-full rounded-xl border-0 bg-transparent px-2 py-1 text-base font-black outline-none ring-cyan-200 transition focus:bg-cyan-50 focus:ring-4 ${
              task.done ? 'text-slate-500 line-through' : 'text-slate-900'
            }`}
          />

          <div className="mt-2 flex flex-wrap gap-2 px-2 font-mono text-[11px] font-bold uppercase tracking-wide text-cyan-800">
            <span>{task.durationMinutes} min</span>
            <span>·</span>
            <span>urgency {task.urgency}</span>
            <span>·</span>
            <span>{task.source}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => removeTask(day, task.id)}
          aria-label={`${task.text} 삭제`}
          className="shrink-0 rounded-xl border-2 border-rose-800 bg-rose-50 px-3 py-2 text-xs font-black text-rose-800 transition hover:-translate-y-0.5 hover:bg-rose-100"
        >
          삭제
        </button>
      </div>

      <div className="mt-4 border-t-2 border-dashed border-cyan-200 pt-4 sm:ml-8">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-black uppercase tracking-[0.16em] text-cyan-900">
            Subtasks
          </h3>
          <span className="rounded-full bg-cyan-100 px-2 py-0.5 font-mono text-xs font-black text-cyan-900">
            {task.details.length}
          </span>
        </div>

        {task.details.length > 0 && (
          <ul className="mb-3 space-y-2">
            {task.details.map((detail, index) => (
              <li
                key={`${task.id}-${index}-${detail}`}
                className="flex items-center gap-2 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2"
              >
                <span className="text-cyan-700" aria-hidden="true">
                  ↳
                </span>
                <span className="min-w-0 flex-1 text-sm font-semibold text-slate-700">
                  {detail}
                </span>
                <button
                  type="button"
                  onClick={() => removeTaskDetail(day, task.id, index)}
                  aria-label={`${detail} 소단위 작업 삭제`}
                  className="rounded-lg px-2 py-1 text-xs font-black text-slate-500 transition hover:bg-white hover:text-rose-700"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        <form
          onSubmit={handleAddDetail}
          className="grid gap-2 sm:grid-cols-[1fr_auto]"
        >
          <input
            value={newDetail}
            onChange={(event) => setNewDetail(event.target.value)}
            placeholder="작업을 더 작은 단계로 입력하세요."
            aria-label={`${task.text} 소단위 작업 입력`}
            className="min-w-0 rounded-xl border-2 border-cyan-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-cyan-700 focus:ring-4 focus:ring-cyan-100"
          />
          <button
            type="submit"
            className="rounded-xl border-2 border-cyan-900 bg-cyan-100 px-4 py-2 text-sm font-black text-cyan-950 transition hover:-translate-y-0.5 hover:bg-cyan-200"
          >
            + 소단위 추가
          </button>
        </form>
      </div>
    </li>
  );
}
