'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { ChatMessage } from '../types/assistant';
import type {
  DayKey,
  DayPlan,
  DayScheduleWindow,
  EnergyLevel,
  Mode,
  Task,
  TimeBlock,
} from '../types/planner';

const STORAGE_KEY = 'godsaeng-planner-store-v1';

const createEmptyPlans = (): Record<DayKey, DayPlan> => ({
  mon: { title: '', description: '', tasks: [] },
  tue: { title: '', description: '', tasks: [] },
  wed: { title: '', description: '', tasks: [] },
  thu: { title: '', description: '', tasks: [] },
  fri: { title: '', description: '', tasks: [] },
});

const createDefaultScheduleWindow = (): DayScheduleWindow => ({
  plannedStart: '09:00',
  plannedEnd: '18:00',
  actualEnd: '',
});

const createDefaultScheduleWindows = (): Record<DayKey, DayScheduleWindow> => ({
  mon: createDefaultScheduleWindow(),
  tue: createDefaultScheduleWindow(),
  wed: createDefaultScheduleWindow(),
  thu: createDefaultScheduleWindow(),
  fri: createDefaultScheduleWindow(),
});

const createEmptyTimeBlocks = (): Record<DayKey, TimeBlock[]> => ({
  mon: [],
  tue: [],
  wed: [],
  thu: [],
  fri: [],
});

const createId = (prefix: 'task' | 'chat'): string => {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

interface PlannerState {
  currentDay: DayKey;
  currentMode: Mode;
  currentEnergy: EnergyLevel;
  plans: Record<DayKey, DayPlan>;
  dayScheduleWindows: Record<DayKey, DayScheduleWindow>;
  timeBlocks: Record<DayKey, TimeBlock[]>;
  assistantChat: ChatMessage[];
}

interface PlannerActions {
  setCurrentDay: (day: DayKey) => void;
  setCurrentMode: (mode: Mode) => void;
  setCurrentEnergy: (energy: EnergyLevel) => void;
  toggleTask: (day: DayKey, taskId: string) => void;
  addTask: (day: DayKey, task: Omit<Task, 'id'>) => void;
  removeTask: (day: DayKey, taskId: string) => void;
  setTasks: (day: DayKey, tasks: Task[]) => void;
  updateTaskText: (day: DayKey, taskId: string, text: string) => void;
  addTaskDetail: (day: DayKey, taskId: string, detail: string) => void;
  removeTaskDetail: (
    day: DayKey,
    taskId: string,
    detailIndex: number,
  ) => void;
  updateScheduleWindow: (
    day: DayKey,
    window: Partial<DayScheduleWindow>,
  ) => void;
  setTimeBlocks: (day: DayKey, blocks: TimeBlock[]) => void;
  addChatMessage: (message: Omit<ChatMessage, 'id'>) => void;
}

export type PlannerStore = PlannerState & PlannerActions;

export const usePlannerStore = create<PlannerStore>()(
  persist(
    (set) => ({
      currentDay: 'mon',
      currentMode: 'student',
      currentEnergy: 'high',
      plans: createEmptyPlans(),
      dayScheduleWindows: createDefaultScheduleWindows(),
      timeBlocks: createEmptyTimeBlocks(),
      assistantChat: [],

      setCurrentDay: (day) => set({ currentDay: day }),

      setCurrentMode: (mode) => set({ currentMode: mode }),

      setCurrentEnergy: (energy) => set({ currentEnergy: energy }),

      toggleTask: (day, taskId) =>
        set((state) => ({
          plans: {
            ...state.plans,
            [day]: {
              ...state.plans[day],
              tasks: state.plans[day].tasks.map((task) =>
                task.id === taskId ? { ...task, done: !task.done } : task,
              ),
            },
          },
        })),

      addTask: (day, task) =>
        set((state) => ({
          plans: {
            ...state.plans,
            [day]: {
              ...state.plans[day],
              tasks: [
                ...state.plans[day].tasks,
                {
                  ...task,
                  id: createId('task'),
                  details: [...task.details],
                },
              ],
            },
          },
        })),

      removeTask: (day, taskId) =>
        set((state) => ({
          plans: {
            ...state.plans,
            [day]: {
              ...state.plans[day],
              tasks: state.plans[day].tasks.filter(
                (task) => task.id !== taskId,
              ),
            },
          },
        })),

      setTasks: (day, tasks) =>
        set((state) => ({
          plans: {
            ...state.plans,
            [day]: {
              ...state.plans[day],
              tasks: tasks.map((task) => ({
                ...task,
                details: [...task.details],
              })),
            },
          },
        })),

      updateTaskText: (day, taskId, text) =>
        set((state) => ({
          plans: {
            ...state.plans,
            [day]: {
              ...state.plans[day],
              tasks: state.plans[day].tasks.map((task) =>
                task.id === taskId ? { ...task, text } : task,
              ),
            },
          },
        })),

      addTaskDetail: (day, taskId, detail) =>
        set((state) => {
          const normalizedDetail = detail.trim();
          if (!normalizedDetail) return state;

          return {
            plans: {
              ...state.plans,
              [day]: {
                ...state.plans[day],
                tasks: state.plans[day].tasks.map((task) =>
                  task.id === taskId
                    ? {
                        ...task,
                        details: [...task.details, normalizedDetail],
                      }
                    : task,
                ),
              },
            },
          };
        }),

      removeTaskDetail: (day, taskId, detailIndex) =>
        set((state) => ({
          plans: {
            ...state.plans,
            [day]: {
              ...state.plans[day],
              tasks: state.plans[day].tasks.map((task) =>
                task.id === taskId
                  ? {
                      ...task,
                      details: task.details.filter(
                        (_, index) => index !== detailIndex,
                      ),
                    }
                  : task,
              ),
            },
          },
        })),

      updateScheduleWindow: (day, window) =>
        set((state) => ({
          dayScheduleWindows: {
            ...state.dayScheduleWindows,
            [day]: {
              ...state.dayScheduleWindows[day],
              ...window,
            },
          },
        })),

      setTimeBlocks: (day, blocks) =>
        set((state) => ({
          timeBlocks: {
            ...state.timeBlocks,
            [day]: blocks.map((block) => ({ ...block })),
          },
        })),

      addChatMessage: (message) =>
        set((state) => ({
          assistantChat: [
            ...state.assistantChat,
            {
              ...message,
              id: createId('chat'),
            },
          ],
        })),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
