'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';

import { createClient } from '../lib/supabase/client';
import { usePlannerStore, type PlannerStore } from '../stores/usePlannerStore';
import type {
  DayKey,
  DayPlan,
  DayScheduleWindow,
  Task,
  TimeBlock,
} from '../types/planner';

const DAY_KEYS: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri'];
const SYNC_DELAY_MS = 800;

interface DailyPlanRow {
  id: string;
  date_key: string;
  day_of_week: DayKey;
  planned_start: string | null;
  planned_end: string | null;
  actual_end: string | null;
  energy_level: 'high' | 'mid' | 'low';
  tasks: TaskRow[] | null;
  time_blocks: TimeBlockRow[] | null;
}

interface TaskRow {
  id: string;
  task_text: string;
  is_done: boolean;
  urgency_score: number;
  duration_minutes: number;
  details: unknown;
  source: 'manual' | 'upload';
}

interface TimeBlockRow {
  id: string;
  start_time: string;
  end_time: string;
  priority: 'High' | 'Medium' | 'Low';
  is_overflow: boolean;
}

interface ChatLogRow {
  id: string;
  role: 'user' | 'assistant';
  message: string;
  created_at: string;
}

interface ProfileRow {
  persona: 'student' | 'worker';
}

const createEmptyPlans = (): Record<DayKey, DayPlan> => ({
  mon: { title: '', description: '', tasks: [] },
  tue: { title: '', description: '', tasks: [] },
  wed: { title: '', description: '', tasks: [] },
  thu: { title: '', description: '', tasks: [] },
  fri: { title: '', description: '', tasks: [] },
});

const createEmptyWindows = (): Record<DayKey, DayScheduleWindow> => ({
  mon: { plannedStart: '09:00', plannedEnd: '18:00', actualEnd: '' },
  tue: { plannedStart: '09:00', plannedEnd: '18:00', actualEnd: '' },
  wed: { plannedStart: '09:00', plannedEnd: '18:00', actualEnd: '' },
  thu: { plannedStart: '09:00', plannedEnd: '18:00', actualEnd: '' },
  fri: { plannedStart: '09:00', plannedEnd: '18:00', actualEnd: '' },
});

const createEmptyTimeBlocks = (): Record<DayKey, TimeBlock[]> => ({
  mon: [],
  tue: [],
  wed: [],
  thu: [],
  fri: [],
});

const clearPlannerStore = () => {
  usePlannerStore.setState({
    currentDay: 'mon',
    currentMode: 'student',
    currentEnergy: 'mid',
    plans: createEmptyPlans(),
    dayScheduleWindows: createEmptyWindows(),
    timeBlocks: createEmptyTimeBlocks(),
    assistantChat: [],
  });
};

const formatLocalDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getCurrentWeekDates = (): Record<DayKey, string> => {
  const today = new Date();
  const mondayOffset = (today.getDay() + 6) % 7;
  const monday = new Date(today);
  monday.setHours(12, 0, 0, 0);
  monday.setDate(today.getDate() - mondayOffset);

  return DAY_KEYS.reduce<Record<DayKey, string>>(
    (dates, day, index) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);
      dates[day] = formatLocalDate(date);
      return dates;
    },
    {} as Record<DayKey, string>,
  );
};

const normalizeTime = (value: string | null, fallback = ''): string =>
  value ? value.slice(0, 5) : fallback;

const timeToMinutes = (value: string): number => {
  const [hours = 0, minutes = 0] = value.slice(0, 5).split(':').map(Number);
  return hours * 60 + minutes;
};

const minutesToTime = (value: number): string => {
  const normalized = ((Math.round(value) % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
};

const normalizeDetails = (details: unknown): string[] =>
  Array.isArray(details)
    ? details.filter((detail): detail is string => typeof detail === 'string')
    : [];

const throwIfError = (error: { message: string } | null) => {
  if (error) throw new Error(error.message);
};

const getAuthRedirectUrl = (): string => {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  return url.toString();
};

const hydratePlannerFromSupabase = async (userId: string) => {
  const supabase = createClient();
  const weekDates = getCurrentWeekDates();
  const dateKeys = DAY_KEYS.map((day) => weekDates[day]);

  const [plansResult, chatResult, profileResult] = await Promise.all([
    supabase
      .from('daily_plans')
      .select(
        `
          id,
          date_key,
          day_of_week,
          planned_start,
          planned_end,
          actual_end,
          energy_level,
          tasks (
            id,
            task_text,
            is_done,
            urgency_score,
            duration_minutes,
            details,
            source
          ),
          time_blocks (
            id,
            start_time,
            end_time,
            priority,
            is_overflow
          )
        `,
      )
      .eq('user_id', userId)
      .in('date_key', dateKeys),
    supabase
      .from('chat_logs')
      .select('id, role, message, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(500),
    supabase
      .from('users')
      .select('persona')
      .eq('id', userId)
      .maybeSingle(),
  ]);

  throwIfError(plansResult.error);
  throwIfError(chatResult.error);
  throwIfError(profileResult.error);

  const plans = createEmptyPlans();
  const dayScheduleWindows = createEmptyWindows();
  const timeBlocks = createEmptyTimeBlocks();
  let currentEnergy: PlannerStore['currentEnergy'] = 'mid';

  ((plansResult.data ?? []) as DailyPlanRow[]).forEach((row) => {
    if (!DAY_KEYS.includes(row.day_of_week)) return;
    const day = row.day_of_week;

    plans[day].tasks = (row.tasks ?? []).map<Task>((task) => ({
      id: task.id,
      text: task.task_text,
      done: task.is_done,
      urgency: task.urgency_score,
      durationMinutes: task.duration_minutes,
      details: normalizeDetails(task.details),
      source: task.source,
    }));

    dayScheduleWindows[day] = {
      plannedStart: normalizeTime(row.planned_start, '09:00'),
      plannedEnd: normalizeTime(row.planned_end, '18:00'),
      actualEnd: normalizeTime(row.actual_end),
    };

    const localBlocks = usePlannerStore.getState().timeBlocks[day];
    timeBlocks[day] = (row.time_blocks ?? []).map((block) => {
      const start = timeToMinutes(block.start_time);
      const end = timeToMinutes(block.end_time);
      const matchingLocalBlock = localBlocks.find(
        (localBlock) =>
          localBlock.start === start && localBlock.end === end,
      );

      return {
        id: block.id,
        start,
        end,
        task: matchingLocalBlock?.task ?? '집중 작업',
        priority: block.priority,
        overflow: block.is_overflow,
      };
    });

    if (day === usePlannerStore.getState().currentDay) {
      currentEnergy = row.energy_level;
    }
  });

  usePlannerStore.setState({
    currentMode:
      ((profileResult.data as ProfileRow | null)?.persona ?? 'student'),
    plans,
    dayScheduleWindows,
    timeBlocks,
    currentEnergy,
    assistantChat: ((chatResult.data ?? []) as ChatLogRow[]).map((log) => ({
      id: log.id,
      role: log.role,
      message: log.message,
      at: log.created_at,
    })),
  });
};

const persistPlannerToSupabase = async (
  userId: string,
  state: PlannerStore,
) => {
  const supabase = createClient();
  const weekDates = getCurrentWeekDates();

  const profileResult = await supabase
    .from('users')
    .update({ persona: state.currentMode })
    .eq('id', userId);
  throwIfError(profileResult.error);

  const dailyPlanPayload = DAY_KEYS.map((day) => ({
    user_id: userId,
    date_key: weekDates[day],
    day_of_week: day,
    planned_start: state.dayScheduleWindows[day].plannedStart || null,
    planned_end: state.dayScheduleWindows[day].plannedEnd || null,
    actual_end: state.dayScheduleWindows[day].actualEnd || null,
    energy_level:
      day === state.currentDay ? state.currentEnergy : 'mid',
  }));

  const plansResult = await supabase
    .from('daily_plans')
    .upsert(dailyPlanPayload, { onConflict: 'user_id,date_key' })
    .select('id, day_of_week');
  throwIfError(plansResult.error);

  const planIdByDay = new Map<DayKey, string>(
    ((plansResult.data ?? []) as Array<{ id: string; day_of_week: DayKey }>).map(
      (plan) => [plan.day_of_week, plan.id],
    ),
  );
  const planIds = [...planIdByDay.values()];
  if (planIds.length === 0) return;

  const [deleteTasksResult, deleteBlocksResult] = await Promise.all([
    supabase.from('tasks').delete().in('daily_plan_id', planIds),
    supabase.from('time_blocks').delete().in('daily_plan_id', planIds),
  ]);
  throwIfError(deleteTasksResult.error);
  throwIfError(deleteBlocksResult.error);

  const taskPayload = DAY_KEYS.flatMap((day) => {
    const dailyPlanId = planIdByDay.get(day);
    if (!dailyPlanId) return [];

    return state.plans[day].tasks.map((task) => ({
      daily_plan_id: dailyPlanId,
      task_text: task.text,
      is_done: task.done,
      urgency_score: task.urgency,
      duration_minutes: task.durationMinutes,
      details: task.details,
      source: task.source,
    }));
  });

  const blockPayload = DAY_KEYS.flatMap((day) => {
    const dailyPlanId = planIdByDay.get(day);
    if (!dailyPlanId) return [];

    return state.timeBlocks[day].map((block) => ({
      daily_plan_id: dailyPlanId,
      start_time: minutesToTime(block.start),
      end_time: minutesToTime(block.end),
      priority: block.priority,
      is_overflow: block.overflow,
    }));
  });

  if (taskPayload.length > 0) {
    const result = await supabase.from('tasks').insert(taskPayload);
    throwIfError(result.error);
  }

  if (blockPayload.length > 0) {
    const result = await supabase.from('time_blocks').insert(blockPayload);
    throwIfError(result.error);
  }

  const deleteChatResult = await supabase
    .from('chat_logs')
    .delete()
    .eq('user_id', userId);
  throwIfError(deleteChatResult.error);

  if (state.assistantChat.length > 0) {
    const chatResult = await supabase.from('chat_logs').insert(
      state.assistantChat.map((message) => ({
        user_id: userId,
        role: message.role,
        message: message.message,
        created_at: message.at,
      })),
    );
    throwIfError(chatResult.error);
  }
};

export function useSupabaseAuth() {
  const supabase = createClient();
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeUserIdRef = useRef<string | null>(null);
  const isHydratingRef = useRef(false);
  const syncTimerRef = useRef<number | null>(null);
  const syncQueueRef = useRef<Promise<void>>(Promise.resolve());
  const authRequestRef = useRef(0);

  useEffect(() => {
    let isMounted = true;

    const applySession = async (nextSession: Session | null) => {
      const requestId = ++authRequestRef.current;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setError(null);

      if (!nextSession) {
        if (activeUserIdRef.current) clearPlannerStore();
        activeUserIdRef.current = null;
        isHydratingRef.current = false;
        if (isMounted) setIsLoading(false);
        return;
      }

      const nextUserId = nextSession.user.id;
      if (activeUserIdRef.current === nextUserId) {
        if (isMounted) setIsLoading(false);
        return;
      }

      isHydratingRef.current = true;
      if (activeUserIdRef.current !== nextUserId) {
        activeUserIdRef.current = null;
        clearPlannerStore();
      }

      try {
        await hydratePlannerFromSupabase(nextUserId);
        if (!isMounted || requestId !== authRequestRef.current) return;
        activeUserIdRef.current = nextUserId;
      } catch (syncError) {
        if (isMounted) {
          setError(
            syncError instanceof Error
              ? syncError.message
              : 'Supabase 데이터를 불러오지 못했습니다.',
          );
        }
      } finally {
        if (requestId === authRequestRef.current) {
          isHydratingRef.current = false;
          if (isMounted) setIsLoading(false);
        }
      }
    };

    const initializeAuth = async () => {
      const authorizationCode = new URL(window.location.href).searchParams.get(
        'code',
      );

      if (authorizationCode) {
        const { error: exchangeError } =
          await supabase.auth.exchangeCodeForSession(authorizationCode);
        if (exchangeError) {
          if (isMounted) {
            setError(exchangeError.message);
            setIsLoading(false);
          }
          return;
        }

        window.history.replaceState(
          {},
          document.title,
          getAuthRedirectUrl(),
        );
      }

      const { data, error: sessionError } = await supabase.auth.getSession();
      if (!isMounted) return;
      if (sessionError) {
        setError(sessionError.message);
        setIsLoading(false);
        return;
      }
      await applySession(data.session);
    };

    void initializeAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      window.setTimeout(() => {
        if (isMounted) void applySession(nextSession);
      }, 0);
    });

    const unsubscribeStore = usePlannerStore.subscribe((state, previous) => {
      const userId = activeUserIdRef.current;
      if (!userId || isHydratingRef.current) return;

      const hasPlannerChanges =
        state.currentDay !== previous.currentDay ||
        state.currentMode !== previous.currentMode ||
        state.currentEnergy !== previous.currentEnergy ||
        state.plans !== previous.plans ||
        state.dayScheduleWindows !== previous.dayScheduleWindows ||
        state.timeBlocks !== previous.timeBlocks ||
        state.assistantChat !== previous.assistantChat;
      if (!hasPlannerChanges) return;

      if (syncTimerRef.current !== null) {
        window.clearTimeout(syncTimerRef.current);
      }

      syncTimerRef.current = window.setTimeout(() => {
        const snapshot = usePlannerStore.getState();
        setIsSyncing(true);

        syncQueueRef.current = syncQueueRef.current
          .catch(() => undefined)
          .then(() => persistPlannerToSupabase(userId, snapshot))
          .catch((syncError: unknown) => {
            if (isMounted) {
              setError(
                syncError instanceof Error
                  ? syncError.message
                  : 'Supabase 자동 저장에 실패했습니다.',
              );
            }
          })
          .finally(() => {
            if (isMounted) setIsSyncing(false);
          });
      }, SYNC_DELAY_MS);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
      unsubscribeStore();
      if (syncTimerRef.current !== null) {
        window.clearTimeout(syncTimerRef.current);
      }
    };
  }, [supabase]);

  const signInWithGoogle = useCallback(async () => {
    setError(null);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: getAuthRedirectUrl(),
      },
    });

    if (oauthError) {
      setError(oauthError.message);
      throw oauthError;
    }
  }, [supabase]);

  const signInWithMagicLink = useCallback(
    async (email: string) => {
      const normalizedEmail = email.trim().toLowerCase();
      if (!normalizedEmail) {
        const validationError = new Error('이메일을 입력해 주세요.');
        setError(validationError.message);
        throw validationError;
      }

      setError(null);
      const { error: magicLinkError } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          emailRedirectTo: getAuthRedirectUrl(),
          shouldCreateUser: true,
        },
      });

      if (magicLinkError) {
        setError(magicLinkError.message);
        throw magicLinkError;
      }
    },
    [supabase],
  );

  const signOut = useCallback(async () => {
    setError(null);

    try {
      const { unregisterPushNotifications } = await import(
        '../lib/notifications'
      );
      await unregisterPushNotifications();
    } catch {
      // 푸시 플러그인이 없거나 토큰이 이미 제거되어도 로그아웃은 계속합니다.
    }

    const { error: signOutError } = await supabase.auth.signOut();

    if (signOutError) {
      setError(signOutError.message);
      throw signOutError;
    }

    activeUserIdRef.current = null;
    clearPlannerStore();
  }, [supabase]);

  return {
    session,
    user,
    isLoading,
    isSyncing,
    error,
    signInWithGoogle,
    signInWithMagicLink,
    signOut,
  };
}
