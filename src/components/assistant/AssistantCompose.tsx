'use client';

import { useMemo, useRef, useState, type TouchEvent } from 'react';

import { usePlannerStore } from '../../stores/usePlannerStore';
import type { Recommendation } from '../../types/assistant';
import type { DayKey, Task } from '../../types/planner';
import { OmniInput, type OmniInputPayload } from './OmniInput';

interface AssistantResponse {
  success: boolean;
  reply?: string;
  recommendations?: Recommendation[];
  error?: string;
}

interface UploadResponse {
  success: boolean;
  summary?: string;
  tasks?: Array<Pick<Task, 'text' | 'details' | 'urgency' | 'durationMinutes'>>;
  error?: string;
}

const NEXT_DAY: Record<DayKey, DayKey> = {
  mon: 'tue',
  tue: 'wed',
  wed: 'thu',
  thu: 'fri',
  fri: 'fri',
};

const ACTION_LABEL: Record<Recommendation['type'], string> = {
  move: '이 작업 이동 승인',
  delete: '작업 삭제 승인',
  atomize: '소단위 작업 반영',
  'reorder-light': '가벼운 작업 우선 배치',
  none: '확인 완료',
};

export function AssistantCompose() {
  const [slide, setSlide] = useState<0 | 1>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [responseText, setResponseText] = useState('');
  const [responseAt, setResponseAt] = useState('');
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [approvedCards, setApprovedCards] = useState<Set<number>>(new Set());
  const touchStartX = useRef<number | null>(null);

  const currentDay = usePlannerStore((state) => state.currentDay);
  const currentMode = usePlannerStore((state) => state.currentMode);
  const currentEnergy = usePlannerStore((state) => state.currentEnergy);
  const plans = usePlannerStore((state) => state.plans);
  const dayScheduleWindows = usePlannerStore(
    (state) => state.dayScheduleWindows,
  );
  const timeBlocks = usePlannerStore((state) => state.timeBlocks);
  const assistantChat = usePlannerStore((state) => state.assistantChat);
  const addChatMessage = usePlannerStore((state) => state.addChatMessage);
  const addTask = usePlannerStore((state) => state.addTask);
  const setTasks = usePlannerStore((state) => state.setTasks);
  const addTaskDetail = usePlannerStore((state) => state.addTaskDetail);

  const latestAssistantMessage = useMemo(
    () =>
      [...assistantChat]
        .reverse()
        .find((message) => message.role === 'assistant'),
    [assistantChat],
  );

  const handleAssistantRequest = async ({
    text,
    file,
  }: OmniInputPayload) => {
    setIsSubmitting(true);
    setApprovedCards(new Set());

    const submittedAt = new Date().toISOString();
    const baseMessage = text || '첨부 파일을 분석해 오늘 일정으로 정리해 줘.';
    addChatMessage({
      role: 'user',
      message: baseMessage,
      at: submittedAt,
    });

    try {
      let fileContext = '';

      if (file) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('mode', currentMode);
        formData.append('currentDay', currentDay);
        formData.append('message', baseMessage);

        const uploadResponse = await fetch('/api/assistant/upload-parse', {
          method: 'POST',
          body: formData,
        });
        const uploadResult = (await uploadResponse.json()) as UploadResponse;

        if (!uploadResponse.ok || !uploadResult.success) {
          throw new Error(uploadResult.error || '첨부 파일을 분석하지 못했습니다.');
        }

        const extractedTasks = uploadResult.tasks ?? [];
        fileContext = [
          uploadResult.summary
            ? `첨부 분석 요약: ${uploadResult.summary}`
            : '',
          extractedTasks.length
            ? `추출 작업: ${extractedTasks.map((task) => task.text).join(', ')}`
            : '',
        ]
          .filter(Boolean)
          .join('\n');
      }

      const message = [baseMessage, fileContext].filter(Boolean).join('\n\n');
      const response = await fetch('/api/assistant/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          currentDay,
          mode: currentMode,
          energy: currentEnergy,
          plans,
          dayScheduleWindows,
          timeBlocks: timeBlocks[currentDay],
        }),
      });
      const result = (await response.json()) as AssistantResponse;

      if (!response.ok || !result.success || !result.reply) {
        throw new Error(result.error || 'AI 비서 응답을 받지 못했습니다.');
      }

      addChatMessage({
        role: 'assistant',
        message: result.reply,
        at: new Date().toISOString(),
      });
      setResponseText(result.reply);
      setResponseAt(new Date().toISOString());
      setRecommendations(result.recommendations ?? []);
      setSlide(1);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'AI 비서 요청을 처리하지 못했습니다.';

      addChatMessage({
        role: 'assistant',
        message: `요청 처리 실패: ${message}`,
        at: new Date().toISOString(),
      });
      setResponseText(`요청 처리 실패: ${message}`);
      setResponseAt(new Date().toISOString());
      setRecommendations([]);
      setSlide(1);
      throw error;
    } finally {
      setIsSubmitting(false);
    }
  };

  const approveRecommendation = (
    recommendation: Recommendation,
    cardIndex: number,
  ) => {
    const currentTasks = plans[currentDay].tasks;
    const normalizedTaskText = recommendation.taskText?.trim();
    const targetTask = normalizedTaskText
      ? currentTasks.find(
          (task) =>
            task.text === normalizedTaskText ||
            task.text.includes(normalizedTaskText),
        )
      : undefined;

    if (recommendation.type === 'move' && targetTask) {
      const destination =
        recommendation.toDay && recommendation.toDay !== currentDay
          ? recommendation.toDay
          : NEXT_DAY[currentDay];

      if (destination !== currentDay) {
        setTasks(
          currentDay,
          currentTasks.filter((task) => task.id !== targetTask.id),
        );
        setTasks(destination, [...plans[destination].tasks, targetTask]);
      }
    }

    if (recommendation.type === 'delete' && targetTask) {
      setTasks(
        currentDay,
        currentTasks.filter((task) => task.id !== targetTask.id),
      );
    }

    if (recommendation.type === 'atomize') {
      if (targetTask) {
        (recommendation.items ?? []).forEach((item) =>
          addTaskDetail(currentDay, targetTask.id, item),
        );
      } else {
        (recommendation.items ?? []).forEach((item) =>
          addTask(currentDay, {
            text: item,
            done: false,
            durationMinutes: 25,
            urgency: 2,
            details: [],
            source: 'manual',
          }),
        );
      }
    }

    if (recommendation.type === 'reorder-light') {
      setTasks(
        currentDay,
        [...currentTasks].sort(
          (a, b) =>
            a.urgency - b.urgency ||
            a.durationMinutes - b.durationMinutes,
        ),
      );
    }

    setApprovedCards((approved) => new Set(approved).add(cardIndex));
    addChatMessage({
      role: 'assistant',
      message: `승인 완료: ${recommendation.title}`,
      at: new Date().toISOString(),
    });
  };

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    touchStartX.current = event.changedTouches[0]?.clientX ?? null;
  };

  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    if (touchStartX.current === null) return;

    const endX = event.changedTouches[0]?.clientX ?? touchStartX.current;
    const distance = endX - touchStartX.current;
    touchStartX.current = null;

    if (Math.abs(distance) < 45) return;
    setSlide(distance < 0 ? 1 : 0);
  };

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-xs font-black uppercase tracking-[0.22em] text-cyan-700">
            AI Executive Assistant
          </p>
          <h2 className="mt-1 text-2xl font-black text-slate-950">
            AI 비서에게 요청
          </h2>
        </div>

        <div className="hidden gap-2 sm:flex">
          <CarouselButton
            label="요청 작성 화면"
            disabled={slide === 0}
            onClick={() => setSlide(0)}
          >
            ←
          </CarouselButton>
          <CarouselButton
            label="AI 답변 화면"
            disabled={slide === 1}
            onClick={() => setSlide(1)}
          >
            →
          </CarouselButton>
        </div>
      </div>

      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="overflow-hidden rounded-[2rem] border-2 border-cyan-950 bg-cyan-50 shadow-[7px_7px_0_#164e63]"
      >
        <div
          className="flex transition-transform duration-500 ease-out"
          style={{ transform: `translateX(-${slide * 100}%)` }}
        >
          <article
            aria-hidden={slide !== 0}
            className="w-full shrink-0 p-4 sm:p-7"
          >
            <div className="mb-5">
              <span className="rounded-full border-2 border-cyan-900 bg-cyan-200 px-3 py-1 font-mono text-xs font-black text-cyan-950">
                SLIDE 01 · REQUEST
              </span>
              <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
                텍스트, 이미지, PDF 또는 음성으로 한 번에 지시하세요.
              </p>
            </div>

            <OmniInput
              onSubmit={handleAssistantRequest}
              isSubmitting={isSubmitting}
            />
          </article>

          <article
            aria-hidden={slide !== 1}
            className="w-full shrink-0 p-4 sm:p-7"
          >
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="rounded-full border-2 border-cyan-900 bg-white px-3 py-1 font-mono text-xs font-black text-cyan-950">
                  SLIDE 02 · RESPONSE
                </span>
                <h3 className="mt-3 text-xl font-black text-slate-950">
                  AI 비서 답변
                </h3>
              </div>

              {(responseAt || latestAssistantMessage) && (
                <time className="font-mono text-xs font-bold text-cyan-800">
                  {new Date(
                    responseAt || latestAssistantMessage?.at || '',
                  ).toLocaleTimeString(
                    'ko-KR',
                    {
                      hour: '2-digit',
                      minute: '2-digit',
                    },
                  )}
                </time>
              )}
            </div>

            <div className="min-h-44 whitespace-pre-wrap rounded-3xl border-2 border-cyan-900 bg-white p-5 text-sm font-semibold leading-7 text-slate-700">
              {responseText ||
                latestAssistantMessage?.message ||
                '요청을 보내면 AI 비서의 답변과 승인 가능한 실행안이 표시됩니다.'}
            </div>

            <div className="mt-5">
              <h4 className="mb-3 font-mono text-xs font-black uppercase tracking-[0.18em] text-cyan-800">
                Approval Actions
              </h4>

              {recommendations.length > 0 ? (
                <ul className="space-y-3">
                  {recommendations.map((recommendation, index) => {
                    const approved = approvedCards.has(index);

                    return (
                      <li
                        key={`${recommendation.type}-${index}-${recommendation.title}`}
                        className="rounded-2xl border-2 border-cyan-900 bg-cyan-100 p-4 shadow-[3px_3px_0_#164e63]"
                      >
                        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
                          <div>
                            <p className="font-black text-slate-950">
                              {recommendation.title}
                            </p>
                            <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">
                              {recommendation.message}
                            </p>
                            {recommendation.metrics && (
                              <p className="mt-2 font-mono text-xs font-black text-cyan-800">
                                {recommendation.metrics}
                              </p>
                            )}
                            {(recommendation.items?.length ?? 0) > 0 && (
                              <ul className="mt-2 space-y-1 text-sm font-semibold text-slate-700">
                                {recommendation.items?.map((item) => (
                                  <li key={item}>↳ {item}</li>
                                ))}
                              </ul>
                            )}
                          </div>

                          <button
                            type="button"
                            disabled={approved}
                            onClick={() =>
                              approveRecommendation(recommendation, index)
                            }
                            className="rounded-xl border-2 border-slate-950 bg-slate-950 px-4 py-2.5 text-sm font-black text-cyan-100 transition hover:-translate-y-0.5 disabled:border-cyan-700 disabled:bg-white disabled:text-cyan-800"
                          >
                            {approved
                              ? '✓ 반영 완료'
                              : ACTION_LABEL[recommendation.type]}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="rounded-2xl border-2 border-dashed border-cyan-300 px-4 py-6 text-center text-sm font-bold text-cyan-800">
                  승인할 실행안이 아직 없습니다.
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => setSlide(0)}
              className="mt-5 w-full rounded-xl border-2 border-cyan-900 bg-white px-4 py-3 font-black text-cyan-950 transition hover:bg-cyan-100 sm:hidden"
            >
              ← 요청 화면으로
            </button>
          </article>
        </div>
      </div>

      <div
        role="tablist"
        aria-label="AI 비서 화면 선택"
        className="mt-5 flex justify-center gap-2"
      >
        {[0, 1].map((index) => (
          <button
            key={index}
            type="button"
            role="tab"
            aria-selected={slide === index}
            aria-label={index === 0 ? '요청 작성' : 'AI 답변'}
            onClick={() => setSlide(index as 0 | 1)}
            className={`h-2.5 rounded-full border border-cyan-900 transition-all ${
              slide === index ? 'w-8 bg-cyan-700' : 'w-2.5 bg-white'
            }`}
          />
        ))}
      </div>
    </section>
  );
}

interface CarouselButtonProps {
  children: string;
  label: string;
  disabled: boolean;
  onClick: () => void;
}

function CarouselButton({
  children,
  label,
  disabled,
  onClick,
}: CarouselButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-10 place-items-center rounded-full border-2 border-cyan-950 bg-white font-black text-cyan-950 shadow-[2px_2px_0_#164e63] transition hover:-translate-y-0.5 disabled:cursor-default disabled:opacity-30"
    >
      {children}
    </button>
  );
}
